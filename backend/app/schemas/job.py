"""Job Pydantic schemas."""

from datetime import datetime

from pydantic import BaseModel


class SearchProfileCreate(BaseModel):
    name: str
    keywords: str
    location: str | None = None
    remote_type: str | None = None  # "remote" | "onsite" | "hybrid"
    experience_level: str | None = None


class SearchProfileResponse(BaseModel):
    id: str
    name: str
    keywords: str
    location: str | None
    remote_type: str | None
    experience_level: str | None
    last_run_at: datetime | None
    created_at: datetime

    class Config:
        from_attributes = True


class JobResponse(BaseModel):
    id: str
    title: str
    company: str
    location: str | None
    url: str | None
    description: str | None
    remote_type: str | None
    experience_level: str | None
    salary_range: str | None
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
    match_score: float | None
    status: str
    scraped_at: datetime

    class Config:
        from_attributes = True


class SearchProfileUpdate(BaseModel):
    name: str | None = None
    keywords: str | None = None
    location: str | None = None
    remote_type: str | None = None
    experience_level: str | None = None


class JobStatusUpdate(BaseModel):
    status: str  # "new" | "interested" | "applied" | "ignored" | "rejected"
