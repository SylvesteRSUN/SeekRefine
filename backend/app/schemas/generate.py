"""LLM generation Pydantic schemas."""

from pydantic import BaseModel


class MatchAnalysisRequest(BaseModel):
    resume_id: str
    job_id: str


class MatchAnalysisResponse(BaseModel):
    score: float
    matching_points: list[str]
    gaps: list[str]
    recommendation: str
    suggested_projects: list[str]


class TailorResumeRequest(BaseModel):
    resume_id: str
    job_id: str


class CoverLetterRequest(BaseModel):
    resume_id: str  # can be tailored_resume_id
    job_id: str
    style: str = "professional"  # "professional" | "enthusiastic" | "concise"


class CoverLetterResponse(BaseModel):
    id: str
    content: str
    style: str


class SuggestSearchesRequest(BaseModel):
    resume_id: str


class SearchSuggestion(BaseModel):
    name: str
    keywords: str
    experience_level: str | None = None
    reasoning: str = ""


class SuggestSearchesResponse(BaseModel):
    suggestions: list[SearchSuggestion]


# --- Chat ---

class ChatMessage(BaseModel):
    role: str  # "user" | "assistant"
    content: str


class ChatRequest(BaseModel):
    resume_id: str
    message: str
    history: list[ChatMessage] = []
    file_content: str | None = None  # Content of uploaded file
    file_name: str | None = None


class ChatResponse(BaseModel):
    reply: str
    updated_section: str | None = None  # Which section was modified, if any
    updated_data: dict | list | None = None  # The new section data
