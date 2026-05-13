"""Jobs API routes."""

import json
import logging
import re
import traceback

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

logger = logging.getLogger("seekrefine.jobs")

from app.database import get_db
from app.models.job import Job, SearchProfile
from app.schemas.job import (
    JobListItem,
    JobResponse,
    JobStatusUpdate,
    SearchProfileCreate,
    SearchProfileResponse,
    SearchProfileUpdate,
)

router = APIRouter()


# --- helpers ---

def _serialize_exclude_keywords(data: dict) -> dict:
    """Convert exclude_keywords list to JSON string for DB storage."""
    if "exclude_keywords" in data and data["exclude_keywords"] is not None:
        data["exclude_keywords"] = json.dumps(data["exclude_keywords"])
    return data


def _profile_to_response(profile: SearchProfile) -> dict:
    """Convert DB profile to response dict, parsing JSON fields."""
    d = {c.key: getattr(profile, c.key) for c in profile.__table__.columns}
    if d.get("exclude_keywords"):
        try:
            d["exclude_keywords"] = json.loads(d["exclude_keywords"])
        except (json.JSONDecodeError, TypeError):
            d["exclude_keywords"] = []
    else:
        d["exclude_keywords"] = None
    return d


def _extract_linkedin_job_id(url: str | None) -> str | None:
    """Extract LinkedIn job ID from any LinkedIn job URL variant.

    Handles:
      /jobs/view/1234567890/                          -> 1234567890
      /jobs/collections/...?currentJobId=1234567890   -> 1234567890
      /jobs/search/?currentJobId=1234567890           -> 1234567890
      /jobs/view/1234567890?trackingId=...&refId=...  -> 1234567890
    """
    if not url:
        return None
    # /jobs/view/<id>
    m = re.search(r"/jobs/view/(\d+)", url)
    if m:
        return m.group(1)
    # ?currentJobId=<id> (SDUI / collections page)
    m = re.search(r"[?&]currentJobId=(\d+)", url)
    if m:
        return m.group(1)
    # ?referenceJobId=<id> (similar-jobs links)
    m = re.search(r"[?&]referenceJobId=(\d+)", url)
    if m:
        return m.group(1)
    return None


def _canonical_url(url: str | None) -> str | None:
    """Strip tracking params and return canonical https://www.linkedin.com/jobs/view/<id>/ form.

    Returns the original URL if no job ID can be extracted.
    """
    if not url:
        return None
    job_id = _extract_linkedin_job_id(url)
    if job_id:
        return f"https://www.linkedin.com/jobs/view/{job_id}/"
    # Fall back to URL without query string
    return url.split("?")[0].split("#")[0]


def _is_duplicate(db: Session, job_data: dict) -> bool:
    """Check if job already exists by linkedin_job_id, canonical URL, or title+company."""
    linkedin_id = job_data.get("linkedin_job_id")
    if linkedin_id:
        if db.query(Job).filter(Job.linkedin_job_id == linkedin_id).first():
            return True

    # Canonical URL comparison (ignores tracking params)
    canon = _canonical_url(job_data.get("url"))
    if canon:
        if db.query(Job).filter(Job.url == canon).first():
            return True

    # Fallback: same title + company = duplicate
    title = job_data.get("title", "").strip()
    company = job_data.get("company", "").strip()
    if title and company:
        existing = db.query(Job).filter(Job.title == title, Job.company == company).first()
        if existing:
            return True

    return False


def _should_exclude(description: str | None, exclude_keywords: list[str]) -> str | None:
    """Check if description contains any exclude keywords. Returns the matched keyword or None."""
    if not description or not exclude_keywords:
        return None
    desc_lower = description.lower()
    for kw in exclude_keywords:
        if kw.lower() in desc_lower:
            return kw
    return None


# --- Search Profiles ---

@router.get("/search-profiles", response_model=list[SearchProfileResponse])
def list_search_profiles(db: Session = Depends(get_db)):
    profiles = db.query(SearchProfile).order_by(SearchProfile.created_at.desc()).all()
    return [_profile_to_response(p) for p in profiles]


@router.post("/search-profiles", response_model=SearchProfileResponse, status_code=201)
def create_search_profile(payload: SearchProfileCreate, db: Session = Depends(get_db)):
    data = _serialize_exclude_keywords(payload.model_dump())
    profile = SearchProfile(**data)
    db.add(profile)
    db.commit()
    db.refresh(profile)
    return _profile_to_response(profile)


@router.put("/search-profiles/{profile_id}", response_model=SearchProfileResponse)
def update_search_profile(profile_id: str, payload: SearchProfileUpdate, db: Session = Depends(get_db)):
    profile = db.query(SearchProfile).filter(SearchProfile.id == profile_id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Search profile not found")
    data = _serialize_exclude_keywords(payload.model_dump(exclude_unset=True))
    for field, value in data.items():
        setattr(profile, field, value)
    db.commit()
    db.refresh(profile)
    return _profile_to_response(profile)


@router.delete("/search-profiles/{profile_id}", status_code=204)
def delete_search_profile(profile_id: str, db: Session = Depends(get_db)):
    profile = db.query(SearchProfile).filter(SearchProfile.id == profile_id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Search profile not found")
    db.delete(profile)
    db.commit()


@router.post("/search-profiles/run-batch")
async def run_batch_searches(profile_ids: list[str], db: Session = Depends(get_db)):
    """Run selected search profiles in one shared browser session."""
    from datetime import datetime, timezone
    from app.services import scraper

    profiles = db.query(SearchProfile).filter(SearchProfile.id.in_(profile_ids)).all()
    if not profiles:
        raise HTTPException(status_code=404, detail="No matching search profiles found")

    # Build search list for batch scraper
    searches = []
    exclude_map: dict[str, list[str]] = {}  # profile_id -> exclude keywords
    max_applicants_map: dict[str, int | None] = {}

    for p in profiles:
        exclude_kw = []
        if p.exclude_keywords:
            try:
                exclude_kw = json.loads(p.exclude_keywords)
            except (json.JSONDecodeError, TypeError):
                pass
        exclude_map[p.id] = exclude_kw
        max_applicants_map[p.id] = p.max_applicants

        searches.append({
            "id": p.id,
            "keywords": p.keywords,
            "location": p.location,
            "remote_type": p.remote_type,
            "experience_level": p.experience_level,
            "date_posted": p.date_posted,
            "sort_by": p.sort_by,
        })

    try:
        batch_results = await scraper.search_linkedin_jobs_batch(searches)
    except Exception as e:
        error_msg = f"{type(e).__name__}: {e}"
        logger.error(f"Batch scrape failed: {error_msg}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=502, detail=f"Scraper error: {error_msg}")

    # Save results to DB with filtering
    results = []
    profile_map = {p.id: p for p in profiles}
    for pid, jobs_data in batch_results.items():
        profile = profile_map[pid]
        exclude_kw = exclude_map.get(pid, [])
        max_app = max_applicants_map.get(pid)
        saved = []
        skipped_dup = 0
        skipped_filter = 0
        unknown_applicants = 0

        for job_data in jobs_data:
            # Extract linkedin job ID + canonicalize URL for stable dedup
            job_data["linkedin_job_id"] = _extract_linkedin_job_id(job_data.get("url"))
            job_data["url"] = _canonical_url(job_data.get("url"))

            # Dedup check
            if _is_duplicate(db, job_data):
                skipped_dup += 1
                continue

            # Max applicants filter
            app_count = job_data.get("applicant_count")
            if max_app is not None:
                if app_count is not None and app_count > max_app:
                    skipped_filter += 1
                    logger.info(f"  Skipped (applicants={app_count} > {max_app}): {job_data.get('title')}")
                    continue
                elif app_count is None:
                    unknown_applicants += 1
                    logger.debug(f"  Unknown applicant count, keeping: {job_data.get('title')}")

            # Exclude keywords filter
            matched_kw = _should_exclude(job_data.get("description"), exclude_kw)
            if matched_kw:
                skipped_filter += 1
                logger.info(f"  Skipped (matched '{matched_kw}'): {job_data.get('title')}")
                continue

            job = Job(**job_data)
            db.add(job)
            saved.append(job)

        if unknown_applicants > 0:
            logger.info(f"  {unknown_applicants} jobs had unknown applicant count (kept anyway)")

        profile.last_run_at = datetime.now(timezone.utc)
        results.append({
            "profile_id": pid,
            "profile_name": profile.name,
            "scraped": len(jobs_data),
            "new_saved": len(saved),
            "skipped_duplicate": skipped_dup,
            "skipped_filtered": skipped_filter,
            "status": "ok",
        })

    db.commit()

    total_scraped = sum(r["scraped"] for r in results)
    total_saved = sum(r["new_saved"] for r in results)
    return {"total_scraped": total_scraped, "total_saved": total_saved, "results": results}


@router.post("/search-profiles/{profile_id}/run")
async def run_search(profile_id: str, db: Session = Depends(get_db)):
    """Run a single search profile."""
    from datetime import datetime, timezone
    from app.services import scraper

    profile = db.query(SearchProfile).filter(SearchProfile.id == profile_id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Search profile not found")

    jobs = await scraper.search_linkedin_jobs(
        keywords=profile.keywords,
        location=profile.location,
        remote_type=profile.remote_type,
        experience_level=profile.experience_level,
        date_posted=profile.date_posted,
        sort_by=profile.sort_by,
    )

    exclude_kw = []
    if profile.exclude_keywords:
        try:
            exclude_kw = json.loads(profile.exclude_keywords)
        except (json.JSONDecodeError, TypeError):
            pass

    saved = []
    for job_data in jobs:
        job_data["linkedin_job_id"] = _extract_linkedin_job_id(job_data.get("url"))
        job_data["url"] = _canonical_url(job_data.get("url"))

        if _is_duplicate(db, job_data):
            continue

        app_count = job_data.get("applicant_count")
        if profile.max_applicants is not None and app_count is not None and app_count > profile.max_applicants:
            continue

        if _should_exclude(job_data.get("description"), exclude_kw):
            continue

        job = Job(**job_data)
        db.add(job)
        saved.append(job)

    profile.last_run_at = datetime.now(timezone.utc)
    db.commit()

    return {"scraped": len(jobs), "new_saved": len(saved)}


# --- Import by URL ---

class ImportUrlRequest(BaseModel):
    url: str


@router.post("/import-url", response_model=JobResponse, status_code=201)
async def import_job_by_url(payload: ImportUrlRequest, db: Session = Depends(get_db)):
    """Import a single job by its LinkedIn URL."""
    from app.services import scraper

    url = payload.url.strip()
    if "linkedin.com" not in url:
        raise HTTPException(status_code=400, detail="Please provide a valid LinkedIn job URL")

    # Extract linkedin_job_id for dedup
    linkedin_job_id = _extract_linkedin_job_id(url)
    job_data_check = {"url": url, "linkedin_job_id": linkedin_job_id}
    if _is_duplicate(db, job_data_check):
        # Return existing job instead of error
        existing = None
        if linkedin_job_id:
            existing = db.query(Job).filter(Job.linkedin_job_id == linkedin_job_id).first()
        if not existing:
            existing = db.query(Job).filter(Job.url == url).first()
        if existing:
            return existing
        raise HTTPException(status_code=409, detail="This job already exists in your list")

    try:
        job_data = await scraper.scrape_job_by_url(url)
    except Exception as e:
        error_msg = f"{type(e).__name__}: {e}"
        logger.error(f"URL import failed: {error_msg}")
        raise HTTPException(status_code=502, detail=f"Failed to scrape job: {error_msg}")

    job_data["linkedin_job_id"] = linkedin_job_id
    job_data["url"] = _canonical_url(job_data.get("url")) or _canonical_url(url)
    job = Job(**job_data)
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


# --- Jobs ---

@router.get("/", response_model=list[JobListItem])
def list_jobs(
    status: str | None = Query(None),
    min_score: float | None = Query(None),
    db: Session = Depends(get_db),
):
    query = db.query(Job)
    if status:
        query = query.filter(Job.status == status)
    if min_score is not None:
        query = query.filter(Job.match_score >= min_score)
    return query.order_by(Job.scraped_at.desc()).all()


@router.get("/{job_id}", response_model=JobResponse)
def get_job(job_id: str, db: Session = Depends(get_db)):
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@router.patch("/{job_id}/status", response_model=JobResponse)
def update_job_status(job_id: str, payload: JobStatusUpdate, db: Session = Depends(get_db)):
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    job.status = payload.status
    db.commit()
    db.refresh(job)
    return job


@router.delete("/{job_id}", status_code=204)
def delete_job(job_id: str, db: Session = Depends(get_db)):
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    db.delete(job)
    db.commit()


@router.get("/{job_id}/cover-letters")
def list_cover_letters(job_id: str, db: Session = Depends(get_db)):
    from app.models.cover_letter import CoverLetter
    letters = db.query(CoverLetter).filter(CoverLetter.job_id == job_id).order_by(CoverLetter.created_at.desc()).all()
    return [{"id": cl.id, "content": cl.content, "style": cl.style, "created_at": str(cl.created_at)} for cl in letters]
