"""Job database models."""

from datetime import datetime, timezone

from sqlalchemy import DateTime, Float, ForeignKey, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.resume import _uuid, _utcnow


class Job(Base):
    __tablename__ = "jobs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    linkedin_job_id: Mapped[str | None] = mapped_column(String(50), nullable=True, unique=True, index=True)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    company: Mapped[str] = mapped_column(String(300), nullable=False)
    location: Mapped[str | None] = mapped_column(String(300), nullable=True)
    url: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    remote_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    experience_level: Mapped[str | None] = mapped_column(String(100), nullable=True)
    salary_range: Mapped[str | None] = mapped_column(String(200), nullable=True)
    applicant_count: Mapped[int | None] = mapped_column(nullable=True)

    # Job category (assigned by LLM during match analysis, manually overridable)
    category_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("job_categories.id", ondelete="SET NULL"), nullable=True, index=True
    )

    # LLM analysis results
    match_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    match_analysis: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    # Status tracking
    status: Mapped[str] = mapped_column(String(50), default="new")

    scraped_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, onupdate=_utcnow)

    # Joined so JobResponse/JobListItem can read category_name/color without N+1
    category: Mapped["JobCategory | None"] = relationship(lazy="joined")

    @property
    def category_name(self) -> str | None:
        return self.category.name if self.category else None

    @property
    def category_color(self) -> str | None:
        return self.category.color if self.category else None


class SearchProfile(Base):
    __tablename__ = "search_profiles"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    keywords: Mapped[str] = mapped_column(String(500), nullable=False)
    location: Mapped[str | None] = mapped_column(String(300), nullable=True)
    remote_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    experience_level: Mapped[str | None] = mapped_column(String(100), nullable=True)
    date_posted: Mapped[str | None] = mapped_column(String(20), nullable=True)  # "24h" | "week" | "month"
    sort_by: Mapped[str | None] = mapped_column(String(20), nullable=True)  # "relevant" | "recent"
    max_applicants: Mapped[int | None] = mapped_column(nullable=True)  # filter out jobs with more applicants
    exclude_keywords: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON list: ["Swedish", "5 years"]
    last_run_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)


class JobCategory(Base):
    """A reusable job category (大类). Jobs are classified into one of these by
    the LLM during match analysis. Each category holds its own AI-tailored resume
    so the user can apply with a ready-made version instead of tailoring per job.
    """
    __tablename__ = "job_categories"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    color: Mapped[str] = mapped_column(String(20), default="blue")  # palette key for the tag
    # Dual purpose: helps the LLM decide if a job belongs here AND guides tailoring focus
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Which master resume to tailor from when generating this category's resume
    base_resume_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("resumes.id", ondelete="SET NULL"), nullable=True
    )
    # The AI-tailored resume for this category, stored inline (ResumeData JSON)
    resume_data: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, onupdate=_utcnow)
