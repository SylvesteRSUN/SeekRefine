"""Job category API routes."""

import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.job import JobCategory, SearchProfile
from app.models.resume import Resume
from app.schemas.category import (
    CategorySuggestion,
    JobCategoryCreate,
    JobCategoryResponse,
    JobCategoryUpdate,
    SuggestCategoriesRequest,
    SuggestCategoriesResponse,
)
from app.schemas.resume import LaTeXExportResponse, ResumeData
from app.services import latex_service, llm_service

logger = logging.getLogger("seekrefine.categories")

router = APIRouter()

ALLOWED_COLORS = {"blue", "green", "purple", "orange", "pink", "teal", "red", "indigo"}


def _to_response(c: JobCategory) -> JobCategoryResponse:
    return JobCategoryResponse(
        id=c.id,
        name=c.name,
        color=c.color,
        description=c.description,
        base_resume_id=c.base_resume_id,
        has_resume=c.resume_data is not None,
        created_at=c.created_at,
        updated_at=c.updated_at,
    )


@router.get("/", response_model=list[JobCategoryResponse])
def list_categories(db: Session = Depends(get_db)):
    cats = db.query(JobCategory).order_by(JobCategory.created_at.asc()).all()
    return [_to_response(c) for c in cats]


@router.post("/", response_model=JobCategoryResponse, status_code=201)
def create_category(payload: JobCategoryCreate, db: Session = Depends(get_db)):
    color = payload.color if payload.color in ALLOWED_COLORS else "blue"
    cat = JobCategory(
        name=payload.name,
        color=color,
        description=payload.description,
        base_resume_id=payload.base_resume_id,
    )
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return _to_response(cat)


@router.put("/{category_id}", response_model=JobCategoryResponse)
def update_category(category_id: str, payload: JobCategoryUpdate, db: Session = Depends(get_db)):
    cat = db.query(JobCategory).filter(JobCategory.id == category_id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    data = payload.model_dump(exclude_unset=True)
    if "color" in data and data["color"] not in ALLOWED_COLORS:
        data.pop("color")
    for field, value in data.items():
        setattr(cat, field, value)
    db.commit()
    db.refresh(cat)
    return _to_response(cat)


@router.delete("/{category_id}", status_code=204)
def delete_category(category_id: str, db: Session = Depends(get_db)):
    cat = db.query(JobCategory).filter(JobCategory.id == category_id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    db.delete(cat)
    db.commit()


@router.get("/{category_id}/resume")
def get_category_resume(category_id: str, db: Session = Depends(get_db)):
    """Return the stored AI-tailored resume JSON for a category (or 404)."""
    cat = db.query(JobCategory).filter(JobCategory.id == category_id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    if cat.resume_data is None:
        raise HTTPException(status_code=404, detail="No resume generated for this category yet")
    return cat.resume_data


@router.post("/{category_id}/generate-resume", response_model=JobCategoryResponse)
async def generate_category_resume(category_id: str, db: Session = Depends(get_db)):
    """AI-tailor the category's base resume toward this whole category of roles."""
    cat = db.query(JobCategory).filter(JobCategory.id == category_id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    if not cat.base_resume_id:
        raise HTTPException(status_code=400, detail="Set a base resume for this category first")

    base = db.query(Resume).filter(Resume.id == cat.base_resume_id).first()
    if not base:
        raise HTTPException(status_code=404, detail="Base resume not found")

    import json
    try:
        tailored = await llm_service.tailor_resume_for_category(
            resume_json=json.dumps(base.data, ensure_ascii=False),
            category_name=cat.name,
            category_description=cat.description or "",
        )
        # Validate it conforms to the resume schema before storing
        ResumeData(**tailored)
    except Exception as e:
        logger.error(f"Category resume generation failed: {type(e).__name__}: {e}")
        raise HTTPException(status_code=502, detail=f"AI tailoring failed: {type(e).__name__}: {e}")

    cat.resume_data = tailored
    db.commit()
    db.refresh(cat)
    return _to_response(cat)


@router.get("/{category_id}/export/latex", response_model=LaTeXExportResponse)
def export_category_latex(category_id: str, db: Session = Depends(get_db)):
    """Export the category's tailored resume as LaTeX source."""
    cat = db.query(JobCategory).filter(JobCategory.id == category_id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    if cat.resume_data is None:
        raise HTTPException(status_code=400, detail="Generate the category resume first")
    resume_data = ResumeData(**cat.resume_data)
    latex_source = latex_service.render_resume_latex(resume_data)
    filename = latex_service.generate_filename(resume_data, suffix=cat.name.replace(" ", "_"))
    return LaTeXExportResponse(latex_source=latex_source, filename=filename)


@router.post("/suggest", response_model=SuggestCategoriesResponse)
async def suggest_categories(payload: SuggestCategoriesRequest, db: Session = Depends(get_db)):
    """AI-propose a set of job categories from the resume + existing search profiles."""
    import json

    resume = db.query(Resume).filter(Resume.id == payload.resume_id).first()
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")

    profiles = db.query(SearchProfile).all()
    profiles_summary = ""
    if profiles:
        profiles_summary = "\n".join(f"- {p.name}: {p.keywords}" for p in profiles)

    raw = await llm_service.suggest_categories(
        json.dumps(resume.data, ensure_ascii=False), profiles_summary
    )
    items = raw if isinstance(raw, list) else raw.get("suggestions", raw.get("categories", []))
    suggestions = []
    for item in items:
        try:
            s = CategorySuggestion(**item)
            if s.color not in ALLOWED_COLORS:
                s.color = "blue"
            suggestions.append(s)
        except Exception:
            continue

    return SuggestCategoriesResponse(suggestions=suggestions)
