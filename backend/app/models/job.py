"""Job database models."""

from datetime import datetime, timezone

from sqlalchemy import DateTime, Float, JSON, String, Text
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

    # LLM analysis results
    match_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    match_analysis: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    # Status tracking
    status: Mapped[str] = mapped_column(String(50), default="new")

    scraped_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, onupdate=_utcnow)


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
