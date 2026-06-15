"""Job category Pydantic schemas."""

from datetime import datetime

from pydantic import BaseModel


class JobCategoryCreate(BaseModel):
    name: str
    color: str = "blue"
    description: str | None = None
    base_resume_id: str | None = None


class JobCategoryUpdate(BaseModel):
    name: str | None = None
    color: str | None = None
    description: str | None = None
    base_resume_id: str | None = None


class JobCategoryResponse(BaseModel):
    id: str
    name: str
    color: str
    description: str | None
    base_resume_id: str | None
    has_resume: bool  # whether resume_data has been generated
    created_at: datetime
    updated_at: datetime


class CategorySuggestion(BaseModel):
    name: str
    color: str = "blue"
    description: str = ""


class SuggestCategoriesRequest(BaseModel):
    resume_id: str


class SuggestCategoriesResponse(BaseModel):
    suggestions: list[CategorySuggestion]
