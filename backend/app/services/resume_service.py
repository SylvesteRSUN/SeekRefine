"""Resume CRUD and version management service."""

import uuid

from sqlalchemy.orm import Session

from app.models.resume import Resume, TailoredResume
from app.schemas.resume import ResumeCreate, ResumeData, ResumeUpdate


def create_resume(db: Session, payload: ResumeCreate) -> Resume:
    resume = Resume(
        id=str(uuid.uuid4()),
        name=payload.name,
        data=payload.data.model_dump(),
    )
    db.add(resume)
    db.commit()
    db.refresh(resume)
    return resume


def get_resume(db: Session, resume_id: str) -> Resume | None:
    return db.query(Resume).filter(Resume.id == resume_id).first()


def list_resumes(db: Session) -> list[Resume]:
    return db.query(Resume).order_by(Resume.updated_at.desc()).all()


def update_resume(db: Session, resume_id: str, payload: ResumeUpdate) -> Resume | None:
    resume = get_resume(db, resume_id)
    if not resume:
        return None
    if payload.name is not None:
        resume.name = payload.name
    if payload.data is not None:
        resume.data = payload.data.model_dump()
    db.commit()
    db.refresh(resume)
    return resume


def update_resume_section(db: Session, resume_id: str, section: str, data) -> Resume | None:
    """Update a single section of the resume JSON."""
    resume = get_resume(db, resume_id)
    if not resume:
        return None

    current_data = dict(resume.data)
    current_data[section] = data

    # Validate through Pydantic
    validated = ResumeData(**current_data)
    resume.data = validated.model_dump()
    db.commit()
    db.refresh(resume)
    return resume


def delete_resume(db: Session, resume_id: str) -> bool:
    resume = get_resume(db, resume_id)
    if not resume:
        return False
    db.delete(resume)
    db.commit()
    return True


def create_tailored_resume(
    db: Session,
    resume_id: str,
    job_id: str | None,
    data: ResumeData,
    changes_summary: str | None = None,
) -> TailoredResume:
    tailored = TailoredResume(
        id=str(uuid.uuid4()),
        resume_id=resume_id,
        job_id=job_id,
        data=data.model_dump(),
        changes_summary=changes_summary,
    )
    db.add(tailored)
    db.commit()
    db.refresh(tailored)
    return tailored


def list_tailored_resumes(db: Session, resume_id: str) -> list[TailoredResume]:
    return (
        db.query(TailoredResume)
        .filter(TailoredResume.resume_id == resume_id)
        .order_by(TailoredResume.created_at.desc())
        .all()
    )
