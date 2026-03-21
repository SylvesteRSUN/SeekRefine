"""Job Pydantic schemas."""

from datetime import datetime

from pydantic import BaseModel


class SearchProfileCreate(BaseModel):
    name: str
    keywords: str
    location: str | None = None
    remote_type: str | None = None  # "remote" | "onsite" | "hybrid"
    experience_level: str | None = None
    date_posted: str | None = None  # "24h" | "week" | "month"
    sort_by: str | None = None  # "relevant" | "recent"
    max_applicants: int | None = None
    exclude_keywords: list[str] | None = None  # ["Swedish", "5 years experience"]


class SearchProfileUpdate(BaseModel):
    name: str | None = None
    keywords: str | None = None
    location: str | None = None
    remote_type: str | None = None
    experience_level: str | None = None
    date_posted: str | None = None
    sort_by: str | None = None
    max_applicants: int | None = None
    exclude_keywords: list[str] | None = None


class SearchProfileResponse(BaseModel):
    id: str
    name: str
    keywords: str
    location: str | None
    remote_type: str | None
    experience_level: str | None
    date_posted: str | None
    sort_by: str | None
    max_applicants: int | None
    exclude_keywords: list[str] | None
    last_run_at: datetime | None
    created_at: datetime

    class Config:
        from_attributes = True


class JobResponse(BaseModel):
    id: str
    linkedin_job_id: str | None
    title: str
    company: str
    location: str | None
    url: str | None
    description: str | None
    remote_type: str | None
    experience_level: str | None
    salary_range: str | None
    applicant_count: int | None
    match_score: float | None
    match_analysis: dict | None
    status: str
    scraped_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class JobListItem(BaseModel):
    id: str
    title: str
    company: str
    location: str | None
    applicant_count: int | None
    match_score: float | None
    status: str
    scraped_at: datetime

    class Config:
        from_attributes = True


class JobStatusUpdate(BaseModel):
    status: str  # "new" | "interested" | "applied" | "ignored" | "rejected"
