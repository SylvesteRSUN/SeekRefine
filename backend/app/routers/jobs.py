"""Jobs API routes."""

import logging
import traceback

from fastapi import APIRouter, Depends, HTTPException, Query
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


# --- Search Profiles ---

@router.get("/search-profiles", response_model=list[SearchProfileResponse])
def list_search_profiles(db: Session = Depends(get_db)):
    return db.query(SearchProfile).order_by(SearchProfile.created_at.desc()).all()


@router.post("/search-profiles", response_model=SearchProfileResponse, status_code=201)
def create_search_profile(payload: SearchProfileCreate, db: Session = Depends(get_db)):
    profile = SearchProfile(**payload.model_dump())
    db.add(profile)
    db.commit()
    db.refresh(profile)
    return profile


@router.put("/search-profiles/{profile_id}", response_model=SearchProfileResponse)
def update_search_profile(profile_id: str, payload: SearchProfileUpdate, db: Session = Depends(get_db)):
    profile = db.query(SearchProfile).filter(SearchProfile.id == profile_id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Search profile not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(profile, field, value)
    db.commit()
    db.refresh(profile)
    return profile


@router.delete("/search-profiles/{profile_id}", status_code=204)
def delete_search_profile(profile_id: str, db: Session = Depends(get_db)):
    profile = db.query(SearchProfile).filter(SearchProfile.id == profile_id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Search profile not found")
    db.delete(profile)
    db.commit()


async def _run_profile(profile: SearchProfile, db: Session) -> dict:
    """Run a single search profile and save results. Returns stats dict."""
    from app.services import scraper
    from datetime import datetime, timezone

    jobs = await scraper.search_linkedin_jobs(
        keywords=profile.keywords,
        location=profile.location,
        remote_type=profile.remote_type,
        experience_level=profile.experience_level,
    )

    saved = []
    for job_data in jobs:
        if job_data.get("url"):
            existing = db.query(Job).filter(Job.url == job_data["url"]).first()
            if existing:
                continue
        job = Job(**job_data)
        db.add(job)
        saved.append(job)

    profile.last_run_at = datetime.now(timezone.utc)
    db.commit()

    return {
        "profile_id": profile.id,
        "profile_name": profile.name,
        "scraped": len(jobs),
        "new_saved": len(saved),
    }


@router.post("/search-profiles/run-batch")
async def run_batch_searches(profile_ids: list[str], db: Session = Depends(get_db)):
    """Run selected search profiles in one shared browser session."""
    from datetime import datetime, timezone
    from app.services import scraper

    profiles = db.query(SearchProfile).filter(SearchProfile.id.in_(profile_ids)).all()
    if not profiles:
        raise HTTPException(status_code=404, detail="No matching search profiles found")

    # Build search list for batch scraper
    searches = [
        {
            "id": p.id,
            "keywords": p.keywords,
            "location": p.location,
            "remote_type": p.remote_type,
            "experience_level": p.experience_level,
        }
        for p in profiles
    ]

    try:
        batch_results = await scraper.search_linkedin_jobs_batch(searches)
    except Exception as e:
        error_msg = f"{type(e).__name__}: {e}"
        logger.error(f"Batch scrape failed: {error_msg}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=502, detail=f"Scraper error: {error_msg}")

    # Save results to DB
    results = []
    profile_map = {p.id: p for p in profiles}
    for pid, jobs_data in batch_results.items():
        profile = profile_map[pid]
        saved = []
        for job_data in jobs_data:
            if job_data.get("url"):
                existing = db.query(Job).filter(Job.url == job_data["url"]).first()
                if existing:
                    continue
            job = Job(**job_data)
            db.add(job)
            saved.append(job)

        profile.last_run_at = datetime.now(timezone.utc)
        results.append({
            "profile_id": pid,
            "profile_name": profile.name,
            "scraped": len(jobs_data),
            "new_saved": len(saved),
            "status": "ok" if jobs_data or True else "ok",
        })

    db.commit()

    total_scraped = sum(r["scraped"] for r in results)
    total_saved = sum(r["new_saved"] for r in results)
    return {"total_scraped": total_scraped, "total_saved": total_saved, "results": results}


@router.post("/search-profiles/{profile_id}/run")
async def run_search(profile_id: str, db: Session = Depends(get_db)):
    """Run a scraping job based on search profile."""
    profile = db.query(SearchProfile).filter(SearchProfile.id == profile_id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Search profile not found")
    return await _run_profile(profile, db)


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
