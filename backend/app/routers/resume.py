"""Resume API routes."""

import logging

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session

logger = logging.getLogger("seekrefine.import")

from app.database import get_db
from app.schemas.resume import (
    LaTeXExportResponse,
    LaTeXImportRequest,
    ResumeCreate,
    ResumeData,
    ResumeListItem,
    ResumeResponse,
    ResumeSectionUpdate,
    ResumeUpdate,
    TailoredResumeResponse,
)
from app.services import latex_service, resume_service

router = APIRouter()


@router.get("/", response_model=list[ResumeListItem])
def list_resumes(db: Session = Depends(get_db)):
    return resume_service.list_resumes(db)


@router.post("/", response_model=ResumeResponse, status_code=201)
def create_resume(payload: ResumeCreate, db: Session = Depends(get_db)):
    return resume_service.create_resume(db, payload)


@router.get("/{resume_id}", response_model=ResumeResponse)
def get_resume(resume_id: str, db: Session = Depends(get_db)):
    resume = resume_service.get_resume(db, resume_id)
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")
    return resume


@router.put("/{resume_id}", response_model=ResumeResponse)
def update_resume(resume_id: str, payload: ResumeUpdate, db: Session = Depends(get_db)):
    resume = resume_service.update_resume(db, resume_id, payload)
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")
    return resume


@router.patch("/{resume_id}/section", response_model=ResumeResponse)
def update_section(resume_id: str, payload: ResumeSectionUpdate, db: Session = Depends(get_db)):
    """Update a single section of the resume."""
    resume = resume_service.update_resume_section(db, resume_id, payload.section, payload.data)
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")
    return resume


@router.delete("/{resume_id}", status_code=204)
def delete_resume(resume_id: str, db: Session = Depends(get_db)):
    if not resume_service.delete_resume(db, resume_id):
        raise HTTPException(status_code=404, detail="Resume not found")


@router.get("/{resume_id}/export/latex", response_model=LaTeXExportResponse)
def export_latex(resume_id: str, db: Session = Depends(get_db)):
    """Export resume as LaTeX source code."""
    resume = resume_service.get_resume(db, resume_id)
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")

    resume_data = ResumeData(**resume.data)
    latex_source = latex_service.render_resume_latex(resume_data)
    filename = latex_service.generate_filename(resume_data)
    return LaTeXExportResponse(latex_source=latex_source, filename=filename)


@router.get("/{resume_id}/export/latex/raw", response_class=PlainTextResponse)
def export_latex_raw(resume_id: str, db: Session = Depends(get_db)):
    """Download LaTeX source as a .tex file."""
    resume = resume_service.get_resume(db, resume_id)
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")

    resume_data = ResumeData(**resume.data)
    latex_source = latex_service.render_resume_latex(resume_data)
    filename = latex_service.generate_filename(resume_data)

    return PlainTextResponse(
        content=latex_source,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        media_type="application/x-tex",
    )


_IMPORT_SYSTEM_PROMPT = (
    "You are a resume parser. Extract ALL structured data from the resume text below.\n"
    "Output ONLY valid JSON (no markdown fences, no explanation) matching this schema:\n"
    '{"personal_info": {"first_name": "", "last_name": "", "address": "", "phone": "", '
    '"email": "", "linkedin": "", "github": ""}, '
    '"education": [{"id": "edu_1", "dates": "", "degree": "", "track": "", '
    '"school": "", "location": "", "grade": "", "courses": [], "thesis": null, "honors": []}], '
    '"work_experience": [{"id": "work_1", "dates": "", "title": "", "company": "", '
    '"location": "", "description": ""}], '
    '"projects": [{"id": "proj_1", "dates": "", "title": "", "context": "", '
    '"description": "", "tags": []}], '
    '"leadership": [{"id": "lead_1", "dates": "", "title": "", "organization": "", '
    '"parent_org": "", "description": ""}], '
    '"skills": {"category_name": "content"}, '
    '"languages": [{"language": "", "level": "", "detail": ""}]}\n\n'
    "IMPORTANT:\n"
    "- Include ALL projects and experiences. Use sequential IDs (proj_1, proj_2, ...).\n"
    "- Extract tags from project descriptions (programming languages and technologies).\n"
    "- Preserve the FULL description text for each project.\n"
    "- KEEP all LaTeX special characters and commands as-is if present. "
    "For example: \\textbf{}, \\%, \\&, \\_, \\$, \\#. "
    "Do NOT strip backslash escapes.\n"
    "- Output raw JSON only - no ```json fences, no extra text."
)


async def _parse_resume_text(text: str, source_type: str = "resume") -> ResumeData:
    """Parse resume text (LaTeX, PDF text, etc.) into structured data using LLM."""
    from app.services import llm_service

    logger.info(f"Import started: {source_type}, {len(text)} chars")

    prompt = f"Parse this {source_type} into JSON:\n\n{text}"

    try:
        parsed = await llm_service.generate_json(prompt, _IMPORT_SYSTEM_PROMPT, temperature=0.1)
        logger.info(f"LLM parse successful, got {len(parsed.get('projects', []))} projects")
    except ValueError as e:
        logger.error(f"LLM parse failed: {e}")
        raise HTTPException(status_code=502, detail=f"AI failed to parse into valid JSON. {str(e)}")
    except Exception as e:
        logger.error(f"LLM call failed: {type(e).__name__}: {e}")
        raise HTTPException(status_code=502, detail=f"AI service error: {type(e).__name__}: {str(e)}")

    try:
        return ResumeData(**parsed)
    except Exception as e:
        logger.error(f"Data validation failed: {e}")
        raise HTTPException(status_code=422, detail=f"AI output doesn't match expected schema: {str(e)}")


@router.post("/import/latex", response_model=ResumeResponse, status_code=201)
async def import_from_latex(payload: LaTeXImportRequest, db: Session = Depends(get_db)):
    """Import a resume from LaTeX source using LLM to parse it."""
    resume_data = await _parse_resume_text(payload.latex_source, "LaTeX resume")
    name = f"{resume_data.personal_info.first_name} {resume_data.personal_info.last_name}".strip()
    create_payload = ResumeCreate(name=name or "Imported Resume", data=resume_data)
    return resume_service.create_resume(db, create_payload)


@router.post("/import/file", response_model=ResumeResponse, status_code=201)
async def import_from_file(file: UploadFile = File(...), db: Session = Depends(get_db)):
    """Import a resume from PDF, Word, or text file."""
    from app.services.file_parser import parse_file

    content = await file.read()
    filename = file.filename or "uploaded_file"

    logger.info(f"File upload: {filename} ({len(content)} bytes)")

    text = parse_file(content, filename)
    if not text or text.startswith("("):
        raise HTTPException(status_code=400, detail=f"Could not extract text from {filename}")

    source_type = filename.rsplit(".", 1)[-1].upper() + " resume"
    resume_data = await _parse_resume_text(text, source_type)
    name = f"{resume_data.personal_info.first_name} {resume_data.personal_info.last_name}".strip()
    create_payload = ResumeCreate(name=name or "Imported Resume", data=resume_data)
    return resume_service.create_resume(db, create_payload)


@router.get("/{resume_id}/tailored", response_model=list[TailoredResumeResponse])
def list_tailored(resume_id: str, db: Session = Depends(get_db)):
    return resume_service.list_tailored_resumes(db, resume_id)
