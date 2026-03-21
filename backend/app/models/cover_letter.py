"""Cover letter database models."""

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.resume import _uuid, _utcnow


class CoverLetter(Base):
    __tablename__ = "cover_letters"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    job_id: Mapped[str] = mapped_column(ForeignKey("jobs.id"), nullable=False)
    tailored_resume_id: Mapped[str | None] = mapped_column(
        ForeignKey("tailored_resumes.id"), nullable=True
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
    style: Mapped[str] = mapped_column(String(50), default="professional")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)
