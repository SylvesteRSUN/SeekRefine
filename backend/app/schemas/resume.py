"""Resume Pydantic schemas."""

from datetime import datetime

from pydantic import BaseModel, Field


# --- Resume JSON sub-schemas (matching moderncv template) ---

class PersonalInfo(BaseModel):
    first_name: str = ""
    last_name: str = ""
    address: str = ""
    phone: str = ""
    email: str = ""
    linkedin: str = ""
    github: str = ""


class Education(BaseModel):
    id: str = ""
    dates: str = ""
    degree: str = ""
    track: str = ""
    school: str = ""
    location: str = ""
    grade: str = ""
    courses: list[str] = []
    thesis: str | None = None
    honors: list[str] = []


class WorkExperience(BaseModel):
    id: str = ""
    dates: str = ""
    title: str = ""
    company: str = ""
    location: str = ""
    description: str = ""


class Project(BaseModel):
    id: str = ""
    dates: str = ""
    title: str = ""
    context: str = ""
    description: str = ""
    tags: list[str] = []


class Leadership(BaseModel):
    id: str = ""
    dates: str = ""
    title: str = ""
    organization: str = ""
    parent_org: str = ""
    description: str = ""


class Language(BaseModel):
    language: str = ""
    level: str = ""
    detail: str = ""


class ResumeData(BaseModel):
    """Full structured resume data matching moderncv template."""
    personal_info: PersonalInfo = Field(default_factory=PersonalInfo)
    education: list[Education] = []
    work_experience: list[WorkExperience] = []
    projects: list[Project] = []
    leadership: list[Leadership] = []
    skills: dict[str, str] = {}
    languages: list[Language] = []


# --- API request/response schemas ---

class ResumeCreate(BaseModel):
    name: str
    data: ResumeData


class ResumeUpdate(BaseModel):
    name: str | None = None
    data: ResumeData | None = None


class ResumeSectionUpdate(BaseModel):
    """Update a single section of the resume."""
    section: str  # e.g. "education", "projects", "skills"
    data: dict | list  # section content


class ResumeResponse(BaseModel):
    id: str
    name: str
    data: ResumeData
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ResumeListItem(BaseModel):
    id: str
    name: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class TailoredResumeResponse(BaseModel):
    id: str
    resume_id: str
    job_id: str | None
    data: ResumeData
    changes_summary: str | None
    created_at: datetime

    class Config:
        from_attributes = True


class LaTeXImportRequest(BaseModel):
    latex_source: str


class LaTeXExportResponse(BaseModel):
    latex_source: str
    filename: str
