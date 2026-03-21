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
    """Parse applicant count from text like '23 applicants' or 'Over 100 applicants'."""
    if not text:
        return None
    # "Over 100 applicants" → 100
    m = re.search(r"(?:over\s+)?(\d+)\s*applicant", text, re.IGNORECASE)
    if m:
        return int(m.group(1))
    return None


def _scrape_search(page, keywords, location, remote_type, experience_level,
                   date_posted=None, sort_by=None, max_pages=3) -> list[dict]:
    """Scrape one search query using an already-authenticated page."""
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

    jobs = []

    for page_num in range(max_pages):
        logger.info(f"Scraping page {page_num + 1}/{max_pages}...")

        # Wait for results to load — try multiple selectors
        try:
            page.wait_for_selector(
                ".jobs-search-results-list, .scaffold-layout__list, .jobs-search-results",
                timeout=15000,
            )
        except Exception:
            logger.warning(f"No results container found on page {page_num + 1}, stopping")
            try:
                screenshot_path = COOKIE_FILE.parent / "debug_screenshot.png"
                page.screenshot(path=str(screenshot_path))
                logger.info(f"Debug screenshot saved to {screenshot_path}")
            except Exception:
                pass
            break

        # Scroll to load all cards
        for _ in range(5):
            page.mouse.wheel(0, 600)
            time.sleep(0.5)

        # Try multiple card selectors (LinkedIn changes these frequently)
        card_selectors = [
            ".job-card-container",
            ".jobs-search-results__list-item",
            "[data-occludable-job-id]",
            ".scaffold-layout__list-item",
        ]

        cards = []
        for selector in card_selectors:
            cards = page.query_selector_all(selector)
            if cards:
                logger.info(f"Found {len(cards)} cards with selector: {selector}")
                break

        if not cards:
            logger.warning(f"No job cards found on page {page_num + 1}")
            break

        for i, card in enumerate(cards):
            try:
                # Try multiple title selectors
                title_el = (
                    card.query_selector(".job-card-list__title--link")
                    or card.query_selector("a.job-card-container__link")
                    or card.query_selector("a[href*='/jobs/view/']")
                    or card.query_selector("strong")
                )
                company_el = (
                    card.query_selector(".artdeco-entity-lockup__subtitle")
                    or card.query_selector(".job-card-container__primary-description")
                    or card.query_selector(".job-card-container__company-name")
                )
                location_el = (
                    card.query_selector(".artdeco-entity-lockup__caption")
                    or card.query_selector(".job-card-container__metadata-wrapper")
                    or card.query_selector(".job-card-container__metadata-item")
                )

                title = title_el.inner_text().strip() if title_el else ""
                company = company_el.inner_text().strip() if company_el else ""
                loc = location_el.inner_text().strip() if location_el else ""

                # Get job URL
                link_el = (
                    card.query_selector("a[href*='/jobs/view/']")
                    or card.query_selector("a[href*='/jobs/']")
                    or title_el
                )
                href = link_el.get_attribute("href") if link_el else None
                url = f"https://www.linkedin.com{href}" if href and href.startswith("/") else href

                if not title:
                    continue

                # Click to load detail panel
                try:
                    card.click()
                    _random_delay(1.5, 3.5)
                except Exception:
                    pass

                # Extract job description from detail panel
                desc = ""
                applicant_count = None
                try:
                    desc_el = page.wait_for_selector(
                        ".jobs-description-content__text, .jobs-description__content, .jobs-box__html-content",
                        timeout=5000,
                    )
                    if desc_el:
                        desc = desc_el.inner_text().strip()
                except Exception:
                    pass

                # Try to extract applicant count from detail panel
                try:
                    applicant_el = (
                        page.query_selector(".jobs-unified-top-card__applicant-count")
                        or page.query_selector(".jobs-unified-top-card__bullet")
                        or page.query_selector("[class*='applicant']")
                    )
                    if applicant_el:
                        applicant_count = _extract_applicant_count(applicant_el.inner_text())

                    # Also try from the broader top card area
                    if applicant_count is None:
                        top_card = page.query_selector(".jobs-unified-top-card")
                        if top_card:
                            top_text = top_card.inner_text()
                            applicant_count = _extract_applicant_count(top_text)
                except Exception:
                    pass

                jobs.append({
                    "title": title,
                    "company": company,
                    "location": loc,
                    "url": url,
                    "description": desc,
                    "remote_type": remote_type,
                    "experience_level": experience_level,
                    "applicant_count": applicant_count,
                })
                logger.info(f"  [{i+1}] {title} @ {company} (applicants: {applicant_count})")

            except Exception as e:
                logger.debug(f"  Failed to parse card {i}: {type(e).__name__}: {e}")
                continue

        # Next page
        if page_num < max_pages - 1:
            next_btn = page.query_selector(
                f'button[aria-label="Page {page_num + 2}"]'
            )
            if next_btn:
                next_btn.click()
                _random_delay()
            else:
                logger.info("No next page button found, stopping pagination")
                break

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
