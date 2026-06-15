"""LinkedIn job scraper using Playwright (sync API in thread for Windows compatibility)."""

import json
import logging
import random
import re
import time
import asyncio
from pathlib import Path
from urllib.parse import quote

from app.config import settings

logger = logging.getLogger("seekrefine.scraper")

COOKIE_FILE = Path(settings.scraper_cookie_path) / "linkedin_cookies.json"


def _random_delay(lo=None, hi=None):
    delay = random.uniform(lo or settings.scraper_delay_min, hi or settings.scraper_delay_max)
    time.sleep(delay)


def _save_cookies(page):
    COOKIE_FILE.parent.mkdir(parents=True, exist_ok=True)
    cookies = page.context.cookies()
    COOKIE_FILE.write_text(json.dumps(cookies))
    logger.info(f"Cookies saved ({len(cookies)} entries)")


def _load_cookies(context):
    if COOKIE_FILE.exists():
        cookies = json.loads(COOKIE_FILE.read_text())
        context.add_cookies(cookies)
        logger.info(f"Loaded {len(cookies)} cookies from cache")
        return True
    logger.info("No cached cookies found")
    return False


def _login_linkedin(page):
    """Navigate to login, wait for user to log in manually (2 min timeout)."""
    logger.info("Navigating to LinkedIn login page — please log in manually...")
    page.goto("https://www.linkedin.com/login")
    try:
        page.wait_for_url("**/feed/**", timeout=120000)
        _save_cookies(page)
        logger.info("Login successful!")
        return True
    except Exception as e:
        logger.error(f"Login failed or timed out: {type(e).__name__}: {e}")
        return False


def _build_search_url(
    keywords: str,
    location: str | None = None,
    remote_type: str | None = None,
    experience_level: str | None = None,
    date_posted: str | None = None,
    sort_by: str | None = None,
) -> str:
    base = "https://www.linkedin.com/jobs/search/?"
    params = [f"keywords={quote(keywords)}"]

    if location:
        params.append(f"location={quote(location)}")

    remote_map = {"onsite": "1", "remote": "2", "hybrid": "3"}
    if remote_type and remote_type in remote_map:
        params.append(f"f_WT={remote_map[remote_type]}")

    exp_map = {
        "internship": "1", "entry": "2", "associate": "3",
        "mid-senior": "4", "director": "5", "executive": "6",
    }
    if experience_level and experience_level in exp_map:
        params.append(f"f_E={exp_map[experience_level]}")

    # Time posted filter
    time_map = {"24h": "r86400", "week": "r604800", "month": "r2592000"}
    if date_posted and date_posted in time_map:
        params.append(f"f_TPR={time_map[date_posted]}")

    # Sort order
    sort_map = {"relevant": "R", "recent": "DD"}
    if sort_by and sort_by in sort_map:
        params.append(f"sortBy={sort_map[sort_by]}")

    return base + "&".join(params)


def _ensure_logged_in(page) -> bool:
    """Make sure we have a valid LinkedIn session."""
    page.goto("https://www.linkedin.com/feed/", wait_until="domcontentloaded")
    time.sleep(2)

    if "login" in page.url or "authwall" in page.url:
        logger.info("Session expired or no cookies — need login")
        return _login_linkedin(page)

    logger.info("LinkedIn session is valid")
    return True


def _extract_applicant_count(text: str | None) -> int | None:
    """Parse applicant count from text in English or Chinese LinkedIn UI.

    Examples:
      EN: "23 applicants", "Over 100 applicants", "Be among the first 25 applicants"
      CN: "23位申请者", "52位会员点击了申请", "超过100位申请者", "成为前25位申请者之一"
    """
    if not text:
        return None

    # --- Chinese patterns ---
    # "52位申请者" / "52 位会员点击了申请" / "52位会员已申请"
    m = re.search(r"(\d[\d,]*)\s*位(?:申请|会员|求职)", text)
    if m:
        return int(m.group(1).replace(",", ""))
    # "超过100位申请者" / "超过 100 人申请"
    m = re.search(r"超过\s*(\d[\d,]*)\s*(?:位|人)", text)
    if m:
        return int(m.group(1).replace(",", ""))
    # "成为前25位申请者之一"
    m = re.search(r"前\s*(\d[\d,]*)\s*位", text)
    if m:
        return int(m.group(1).replace(",", ""))
    # Broader: "XX人申请" / "XX人已申请"
    m = re.search(r"(\d[\d,]*)\s*人(?:已)?申请", text)
    if m:
        return int(m.group(1).replace(",", ""))

    # --- English patterns ---
    # "Over 100 applicants" / "23 applicants"
    m = re.search(r"(?:over\s+)?(\d[\d,]*)\s*applicant", text, re.IGNORECASE)
    if m:
        return int(m.group(1).replace(",", ""))
    # "Be among the first 25 applicants"
    m = re.search(r"first\s+(\d+)\s*applicant", text, re.IGNORECASE)
    if m:
        return int(m.group(1))
    # "X people clicked apply"
    m = re.search(r"(\d[\d,]*)\s*(?:people|person)\s*(?:clicked|have)\s*appl", text, re.IGNORECASE)
    if m:
        return int(m.group(1).replace(",", ""))
    # Generic number near "appl"
    m = re.search(r"(\d[\d,]*)\s*appl", text, re.IGNORECASE)
    if m:
        return int(m.group(1).replace(",", ""))

    return None


def _collect_job_ids(page, max_jobs: int) -> list[str]:
    """Scroll the search results list and collect unique LinkedIn job IDs.

    Uses only stable anchors (job-view links and data-occludable-job-id),
    which survive LinkedIn's SDUI class-name churn.
    """
    seen: list[str] = []
    seen_set: set[str] = set()

    def _harvest():
        # Source 1: anchor hrefs containing /jobs/view/<id> or ?currentJobId=<id>
        for a in page.query_selector_all("a[href*='/jobs/view/'], a[href*='currentJobId=']"):
            href = a.get_attribute("href") or ""
            m = re.search(r"/jobs/view/(\d+)", href) or re.search(r"[?&]currentJobId=(\d+)", href)
            if m and m.group(1) not in seen_set:
                seen_set.add(m.group(1))
                seen.append(m.group(1))
        # Source 2: data-occludable-job-id attribute on list items
        for el in page.query_selector_all("[data-occludable-job-id], [data-job-id]"):
            jid = el.get_attribute("data-occludable-job-id") or el.get_attribute("data-job-id")
            if jid and jid.isdigit() and jid not in seen_set:
                seen_set.add(jid)
                seen.append(jid)

    # Initial harvest, then scroll-and-harvest to trigger lazy loading
    _harvest()
    last_count = len(seen)
    stagnant = 0
    for _ in range(20):
        if len(seen) >= max_jobs:
            break
        page.mouse.wheel(0, 1200)
        time.sleep(0.6)
        _harvest()
        if len(seen) == last_count:
            stagnant += 1
            if stagnant >= 3:  # no new jobs after 3 scrolls — list exhausted
                break
        else:
            stagnant = 0
            last_count = len(seen)

    return seen[:max_jobs]


def _scrape_search(page, keywords, location, remote_type, experience_level,
                   date_posted=None, sort_by=None, max_pages=3) -> list[dict]:
    """Scrape one search query using an already-authenticated page.

    LinkedIn's search results page is now Server-Driven UI with obfuscated
    class names, so we no longer parse cards in place. Instead we collect job
    IDs from stable link/data anchors, then visit each standalone job page and
    reuse the robust single-job extractor.
    """
    search_url = _build_search_url(keywords, location, remote_type, experience_level, date_posted, sort_by)
    logger.info(f"Searching: {search_url}")
    page.goto(search_url, wait_until="domcontentloaded")
    _random_delay()

    # Check if redirected to login
    if "login" in page.url or "authwall" in page.url:
        logger.warning("Redirected to login during search")
        if not _login_linkedin(page):
            return []
        page.goto(search_url, wait_until="domcontentloaded")
        _random_delay()

    # Wait for any job link to appear — the most stable signal that results loaded
    try:
        page.wait_for_selector(
            "a[href*='/jobs/view/'], [data-occludable-job-id], [data-job-id]",
            timeout=20000,
        )
    except Exception:
        logger.warning("No job links appeared on the search page")
        try:
            screenshot_path = COOKIE_FILE.parent / "debug_search.png"
            html_path = COOKIE_FILE.parent / "debug_search.html"
            page.screenshot(path=str(screenshot_path), full_page=True)
            html_path.write_text(page.content(), encoding="utf-8")
            logger.warning(f"  Final URL: {page.url}")
            logger.warning(f"  Screenshot: {screenshot_path}")
            logger.warning(f"  HTML dump: {html_path}")
        except Exception:
            pass
        return []

    # ~25 jobs per page; cap total by max_pages so behaviour roughly matches before
    max_jobs = max_pages * 25
    job_ids = _collect_job_ids(page, max_jobs)
    logger.info(f"Collected {len(job_ids)} job IDs for '{keywords}'")

    jobs = []
    for i, jid in enumerate(job_ids):
        view_url = f"https://www.linkedin.com/jobs/view/{jid}/"
        try:
            page.goto(view_url, wait_until="domcontentloaded")
            _random_delay(1.5, 3.0)
            if "login" in page.url or "authwall" in page.url:
                logger.warning("Hit auth wall mid-search, stopping this query")
                break
            data = _extract_job_details(page, view_url, save_debug=False)
            # Annotate with the search profile's filters for downstream use
            data["remote_type"] = remote_type
            data["experience_level"] = experience_level
            jobs.append(data)
            logger.info(f"  [{i+1}/{len(job_ids)}] {data.get('title')} @ {data.get('company')} "
                        f"(applicants: {data.get('applicant_count')})")
        except ValueError:
            logger.debug(f"  [{i+1}] job {jid}: could not extract title, skipping")
            continue
        except Exception as e:
            logger.debug(f"  [{i+1}] job {jid} failed: {type(e).__name__}: {e}")
            continue

    logger.info(f"Search complete: {len(jobs)} jobs found for '{keywords}'")
    return jobs


def _run_single_sync(keywords, location, remote_type, experience_level,
                     date_posted=None, sort_by=None, max_pages=3) -> list[dict]:
    """Sync version: launch browser, scrape, close."""
    from playwright.sync_api import sync_playwright

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        context = browser.new_context(
            viewport={"width": 1280, "height": 800},
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            ),
        )
        _load_cookies(context)
        page = context.new_page()

        if not _ensure_logged_in(page):
            browser.close()
            return []

        jobs = _scrape_search(page, keywords, location, remote_type, experience_level,
                              date_posted, sort_by, max_pages)
        _save_cookies(page)
        browser.close()

    return jobs


def _run_batch_sync(searches: list[dict], max_pages: int = 3) -> dict[str, list[dict]]:
    """Sync version: one browser, multiple searches."""
    from playwright.sync_api import sync_playwright

    results: dict[str, list[dict]] = {}

    logger.info(f"Starting batch scrape: {len(searches)} profiles")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        context = browser.new_context(
            viewport={"width": 1280, "height": 800},
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            ),
        )
        _load_cookies(context)
        page = context.new_page()

        if not _ensure_logged_in(page):
            browser.close()
            raise RuntimeError("LinkedIn login failed or timed out")

        for search in searches:
            sid = search["id"]
            try:
                jobs = _scrape_search(
                    page,
                    search["keywords"],
                    search.get("location"),
                    search.get("remote_type"),
                    search.get("experience_level"),
                    search.get("date_posted"),
                    search.get("sort_by"),
                    max_pages,
                )
                results[sid] = jobs
            except Exception as e:
                logger.error(f"Search '{search['keywords']}' failed: {type(e).__name__}: {e}")
                results[sid] = []

        _save_cookies(page)
        browser.close()

    logger.info(f"Batch scrape complete: {sum(len(v) for v in results.values())} total jobs")
    return results


def _extract_job_details(page, url: str, save_debug: bool = True) -> dict:
    """Extract job fields from a page already loaded on a /jobs/view/<id> URL.

    Assumes login is handled and the page has navigated. Does NOT save cookies
    or close the browser — the caller owns the page lifecycle. Raises ValueError
    if a title cannot be found. Robust against LinkedIn's SDUI class-name churn:
    title/company come from the <title> tag and stable href anchors, the JD from
    the data-testid="expandable-text-box" element.
    """
    # Wait for the JD container (data-testid is stable across LinkedIn redesigns)
    try:
        page.wait_for_selector(
            '[data-testid="expandable-text-box"], .jobs-description-content__text, '
            '.topcard__title, .top-card-layout__title, h1',
            timeout=15000,
        )
    except Exception:
        logger.warning("Content did not appear within 15s — continuing anyway")

    # Scroll a bit to trigger lazy-loaded sections
    for _ in range(3):
        page.mouse.wheel(0, 500)
        time.sleep(0.4)

    # --- Extract title + company from <title> tag ---
    # New LinkedIn SDUI format: "Software Developer | Acme Corp | LinkedIn"
    # Legacy guest page format: "Acme hiring Software Engineer in Stockholm, Sweden | LinkedIn"
    page_title = page.title() or ""
    title = ""
    company = ""
    location = ""

    # Try "Company hiring Title in Location" first (legacy format)
    m = re.search(r"^(.+?)\s+hiring\s+(.+?)\s+in\s+(.+?)(?:\s*\|\s*LinkedIn)?$", page_title)
    if m:
        company = m.group(1).strip()
        title = m.group(2).strip()
        location = m.group(3).strip()
    elif " | " in page_title:
        # New SDUI format: "Title | Company | LinkedIn"
        parts = [p.strip() for p in page_title.split(" | ")]
        if parts and parts[-1].lower() == "linkedin":
            parts = parts[:-1]
        if len(parts) >= 2:
            title = parts[0]
            company = parts[1]
        elif parts:
            title = parts[0]

    # --- Fallback selectors for title (legacy pages) ---
    if not title:
        for sel in [
            ".job-details-jobs-unified-top-card__job-title",
            ".jobs-unified-top-card__job-title",
            ".top-card-layout__title",
            ".topcard__title",
            "h1",
        ]:
            el = page.query_selector(sel)
            if el:
                t = el.inner_text().strip()
                if t:
                    title = t
                    break

    # --- Company fallback: a[href*="/company/"] is very stable ---
    if not company:
        el = page.query_selector('a[href*="/company/"]')
        if el:
            c = el.inner_text().strip()
            if c:
                company = c

    # --- Description: longest [data-testid="expandable-text-box"] is usually the JD ---
    # Aggressively expand any truncated content first. Multiple fallback strategies
    # because LinkedIn varies by page type (SDUI vs legacy) and locale.
    def _try_expand_buttons():
        for btn_sel in [
            'button[data-testid="expandable-text-button"]',
            "button.show-more-less-html__button--more",
            "button.jobs-description__footer-button",
            "button[aria-label*='see more' i]",
            "button[aria-label*='show more' i]",
            "button[aria-label*='查看更多']",
            "button[aria-label*='展开']",
            "button[aria-label*='æ´å¤']",  # CN encoding artifact seen in dumps
        ]:
            try:
                buttons = page.query_selector_all(btn_sel)
            except Exception:
                continue
            for btn in buttons:
                try:
                    btn.scroll_into_view_if_needed(timeout=1500)
                    try:
                        btn.click(timeout=1500)
                    except Exception:
                        try:
                            btn.click(force=True, timeout=1500)
                        except Exception:
                            btn.dispatch_event("click")
                    time.sleep(0.4)
                except Exception:
                    continue

    def _measure_jd_len() -> int:
        try:
            boxes = page.query_selector_all('[data-testid="expandable-text-box"]')
            if boxes:
                return max((len(b.inner_text() or "") for b in boxes), default=0)
            el = page.query_selector(
                ".jobs-description-content__text, .jobs-description__content, "
                ".jobs-box__html-content, .show-more-less-html__markup, "
                ".description__text, #job-details"
            )
            return len(el.inner_text() or "") if el else 0
        except Exception:
            return 0

    before_len = _measure_jd_len()
    _try_expand_buttons()
    after_len = _measure_jd_len()
    if after_len <= before_len + 50:
        time.sleep(0.5)
        _try_expand_buttons()
        after_len = _measure_jd_len()

    desc = ""
    # Strategy 1: SDUI expandable-text-box (new LinkedIn) — pick the longest one
    try:
        boxes = page.query_selector_all('[data-testid="expandable-text-box"]')
        texts = []
        for box in boxes:
            try:
                t = box.inner_text().strip()
                if t:
                    texts.append(t)
            except Exception:
                continue
        if texts:
            desc = max(texts, key=len)
    except Exception:
        pass

    # Strategy 2: legacy JD container classes
    if not desc:
        for sel in [
            ".jobs-description-content__text",
            ".jobs-description__content",
            ".jobs-box__html-content",
            ".show-more-less-html__markup",
            ".description__text",
            "#job-details",
        ]:
            el = page.query_selector(sel)
            if el:
                t = el.inner_text().strip()
                if t:
                    desc = t
                    break

    # --- Location fallback: top-card text block with location/date/applicants ---
    if not location:
        try:
            for p_el in page.query_selector_all("p"):
                txt = p_el.inner_text()
                if txt and ("·" in txt) and (
                    re.search(r"applicant|位申请|位会员|人申请|发布时间|Posted", txt, re.IGNORECASE)
                ):
                    first = txt.split("·")[0].strip()
                    if first and len(first) < 80:
                        location = first
                        break
        except Exception:
            pass

    # --- Applicant count ---
    applicant_count = None
    for sel in [
        ".jobs-unified-top-card__applicant-count",
        ".jobs-unified-top-card__bullet",
        ".job-details-jobs-unified-top-card__primary-description-container",
        ".tvm__text--low-emphasis",
    ]:
        el = page.query_selector(sel)
        if el:
            applicant_count = _extract_applicant_count(el.inner_text())
            if applicant_count is not None:
                break

    if applicant_count is None:
        try:
            for p_el in page.query_selector_all("p"):
                txt = p_el.inner_text()
                if txt and re.search(r"applicant|位申请|位会员|人申请|前\s*\d+\s*位|超过\s*\d+", txt, re.IGNORECASE):
                    applicant_count = _extract_applicant_count(txt)
                    if applicant_count is not None:
                        break
        except Exception:
            pass

    if applicant_count is None:
        for sel in [".jobs-unified-top-card", ".job-details-jobs-unified-top-card__container"]:
            area = page.query_selector(sel)
            if area:
                applicant_count = _extract_applicant_count(area.inner_text())
                if applicant_count is not None:
                    break

    if save_debug and (not title or not company or not desc):
        try:
            screenshot_path = COOKIE_FILE.parent / "debug_import_url.png"
            html_path = COOKIE_FILE.parent / "debug_import_url.html"
            page.screenshot(path=str(screenshot_path), full_page=True)
            html_path.write_text(page.content(), encoding="utf-8")
            logger.warning(
                f"Import incomplete — title={bool(title)} company={bool(company)} desc={bool(desc)}"
            )
            logger.warning(f"  Final URL: {page.url}")
            logger.warning(f"  Screenshot: {screenshot_path}")
            logger.warning(f"  HTML dump: {html_path}")
        except Exception:
            pass

    if not title:
        raise ValueError("Could not extract job title from the page — the URL may be invalid or require login")

    return {
        "title": title,
        "company": company,
        "location": location,
        "url": url,
        "description": desc,
        "applicant_count": applicant_count,
    }


def _scrape_single_job_sync(url: str) -> dict:
    """Sync: open a single LinkedIn job URL and extract its details."""
    from playwright.sync_api import sync_playwright

    logger.info(f"Scraping single job URL: {url}")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        context = browser.new_context(
            viewport={"width": 1280, "height": 800},
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            ),
        )
        _load_cookies(context)
        page = context.new_page()

        if not _ensure_logged_in(page):
            browser.close()
            raise RuntimeError("LinkedIn login failed or timed out")

        page.goto(url, wait_until="domcontentloaded")
        _random_delay(2, 4)

        # Check if redirected to login
        if "login" in page.url or "authwall" in page.url:
            if not _login_linkedin(page):
                browser.close()
                raise RuntimeError("LinkedIn login required")
            page.goto(url, wait_until="domcontentloaded")
            _random_delay(2, 4)

        data = _extract_job_details(page, url, save_debug=True)
        _save_cookies(page)
        browser.close()

    logger.info(f"Scraped: {data.get('title')} @ {data.get('company')} "
                f"(applicants: {data.get('applicant_count')})")
    return data


# --- Async wrappers (run sync Playwright in a thread) ---

async def search_linkedin_jobs(
    keywords: str,
    location: str | None = None,
    remote_type: str | None = None,
    experience_level: str | None = None,
    date_posted: str | None = None,
    sort_by: str | None = None,
    max_pages: int = 3,
) -> list[dict]:
    """Scrape a single search query."""
    return await asyncio.to_thread(
        _run_single_sync, keywords, location, remote_type, experience_level,
        date_posted, sort_by, max_pages
    )


async def search_linkedin_jobs_batch(
    searches: list[dict],
    max_pages: int = 3,
) -> dict[str, list[dict]]:
    """Run multiple searches sharing one browser session."""
    return await asyncio.to_thread(_run_batch_sync, searches, max_pages)


async def scrape_job_by_url(url: str) -> dict:
    """Scrape a single job by its LinkedIn URL."""
    return await asyncio.to_thread(_scrape_single_job_sync, url)
