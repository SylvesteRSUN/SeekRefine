"""LLM generation API routes - match analysis, resume tailoring, cover letter, chat."""

import json
import logging
import re

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from pydantic import BaseModel
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.cover_letter import CoverLetter
from app.models.job import Job
from app.models.resume import Resume
from app.schemas.generate import (
    ChatRequest,
    ChatResponse,
    CoverLetterRequest,
    CoverLetterResponse,
    MatchAnalysisRequest,
    MatchAnalysisResponse,
    SearchSuggestion,
    SuggestSearchesRequest,
    SuggestSearchesResponse,
    TailorResumeRequest,
)
from app.schemas.resume import ResumeData, TailoredResumeResponse
from app.services import llm_service, resume_service

logger = logging.getLogger("seekrefine.chat")

router = APIRouter()


def _get_resume_and_job(db: Session, resume_id: str, job_id: str):
    resume = db.query(Resume).filter(Resume.id == resume_id).first()
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return resume, job


@router.post("/match-analysis", response_model=MatchAnalysisResponse)
async def analyze_match(payload: MatchAnalysisRequest, db: Session = Depends(get_db)):
    """Analyze match between resume and job using LLM."""
    resume, job = _get_resume_and_job(db, payload.resume_id, payload.job_id)

    result = await llm_service.match_analysis(
        resume_json=json.dumps(resume.data, ensure_ascii=False),
        job_description=job.description or "",
    )

    # Save analysis to job
    job.match_score = result.get("score", 0)
    job.match_analysis = result
    db.commit()

    return MatchAnalysisResponse(**result)


@router.post("/tailor-resume", response_model=TailoredResumeResponse)
async def tailor_resume(payload: TailorResumeRequest, db: Session = Depends(get_db)):
    """Generate a tailored resume version for a specific job."""
    resume, job = _get_resume_and_job(db, payload.resume_id, payload.job_id)

    analysis_str = json.dumps(job.match_analysis or {}, ensure_ascii=False)

    tailored_data = await llm_service.tailor_resume(
        resume_json=json.dumps(resume.data, ensure_ascii=False),
        job_description=job.description or "",
        analysis=analysis_str,
    )

    resume_data = ResumeData(**tailored_data)
    tailored = resume_service.create_tailored_resume(
        db=db,
        resume_id=payload.resume_id,
        job_id=payload.job_id,
        data=resume_data,
        changes_summary=f"Tailored for {job.title} at {job.company}",
    )
    return tailored


@router.post("/cover-letter", response_model=CoverLetterResponse)
async def generate_cover_letter(payload: CoverLetterRequest, db: Session = Depends(get_db)):
    """Generate a cover letter for a job."""
    resume, job = _get_resume_and_job(db, payload.resume_id, payload.job_id)

    content = await llm_service.generate_cover_letter(
        resume_json=json.dumps(resume.data, ensure_ascii=False),
        job_description=job.description or "",
        style=payload.style,
    )

    cl = CoverLetter(
        job_id=payload.job_id,
        content=content,
        style=payload.style,
    )
    db.add(cl)
    db.commit()
    db.refresh(cl)

    return CoverLetterResponse(id=cl.id, content=cl.content, style=cl.style)


class BatchAnalyzeBody(BaseModel):
    job_ids: list[str] | None = None
    unscored_only: bool = True


@router.post("/batch-analyze")
async def batch_analyze(
    resume_id: str,
    body: BatchAnalyzeBody | None = None,
    db: Session = Depends(get_db),
):
    """Analyze jobs against a resume. If job_ids given, analyze those; otherwise analyze unscored jobs."""
    job_ids = body.job_ids if body else None
    unscored_only = body.unscored_only if body else True
    resume = db.query(Resume).filter(Resume.id == resume_id).first()
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")

    if job_ids:
        target_jobs = db.query(Job).filter(Job.id.in_(job_ids)).all()
    elif unscored_only:
        target_jobs = db.query(Job).filter(Job.match_score.is_(None)).all()
    else:
        target_jobs = db.query(Job).all()

    results = []
    for job in target_jobs:
        try:
            result = await llm_service.match_analysis(
                resume_json=json.dumps(resume.data, ensure_ascii=False),
                job_description=job.description or "",
            )
            job.match_score = result.get("score", 0)
            job.match_analysis = result
            results.append({"job_id": job.id, "title": job.title, "score": job.match_score, "status": "ok"})
        except Exception as e:
            results.append({"job_id": job.id, "title": job.title, "score": None, "status": f"error: {str(e)}"})

    db.commit()
    return {"analyzed": len(results), "results": results}


@router.post("/suggest-searches", response_model=SuggestSearchesResponse)
async def suggest_searches(payload: SuggestSearchesRequest, db: Session = Depends(get_db)):
    """Use AI to suggest job search profiles based on resume content."""
    resume = db.query(Resume).filter(Resume.id == payload.resume_id).first()
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")

    resume_json = json.dumps(resume.data, ensure_ascii=False)
    raw = await llm_service.suggest_searches(resume_json)

    # Normalize: LLM might return list or dict with a key
    items = raw if isinstance(raw, list) else raw.get("suggestions", raw.get("profiles", []))
    suggestions = []
    for item in items:
        try:
            suggestions.append(SearchSuggestion(**item))
        except Exception:
            continue

    return SuggestSearchesResponse(suggestions=suggestions)


# --- Chat ---

def _parse_action_block(text: str) -> dict | None:
    """Extract seekrefine_action JSON from LLM response."""
    pattern = r"```seekrefine_action\s*\n(.*?)\n```"
    match = re.search(pattern, text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(1).strip())
        except json.JSONDecodeError:
            logger.warning(f"Failed to parse action block: {match.group(1)[:200]}")
    return None


def _clean_reply(text: str) -> str:
    """Remove action block from reply text shown to user."""
    pattern = r"\n*```seekrefine_action\s*\n.*?\n```\s*"
    return re.sub(pattern, "", text, flags=re.DOTALL).strip()


@router.post("/chat", response_model=ChatResponse)
async def chat_with_resume(payload: ChatRequest, db: Session = Depends(get_db)):
    """Chat with AI to update resume content."""
    resume = db.query(Resume).filter(Resume.id == payload.resume_id).first()
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")

    # Build system prompt with current resume data
    from pathlib import Path
    prompt_template = (Path(__file__).parent.parent / "prompts" / "chat_resume.txt").read_text(encoding="utf-8")
    resume_json = json.dumps(resume.data, ensure_ascii=False, indent=2)
    system = prompt_template.replace("{resume_json}", resume_json)

    # Build conversation history
    history_text = ""
    for msg in payload.history[-10:]:  # Keep last 10 messages for context
        role = "User" if msg.role == "user" else "Assistant"
        history_text += f"\n{role}: {msg.content}\n"

    # Build user message
    user_msg = payload.message
    if payload.file_content:
        user_msg += f"\n\n--- Uploaded File: {payload.file_name or 'file'} ---\n{payload.file_content}\n---"

    prompt = f"{history_text}\nUser: {user_msg}\nAssistant:"

    logger.info(f"Chat request: {user_msg[:100]}...")

    # Call LLM
    raw_reply = await llm_service.generate(prompt, system, temperature=0.5)

    # Parse action block if present
    action = _parse_action_block(raw_reply)
    clean_reply = _clean_reply(raw_reply)

    updated_section = None
    updated_data = None

    if action:
        section = action.get("section")
        act = action.get("action")
        data = action.get("data")
        logger.info(f"Chat action: {act} on {section}")

        if section and data:
            try:
                current_data = dict(resume.data)

                if section == "skills" and act == "edit":
                    # Skills: merge into existing
                    current_skills = current_data.get("skills", {})
                    current_skills.update(data)
                    current_data["skills"] = current_skills
                elif section in ("projects", "work_experience", "education", "leadership", "languages"):
                    items = list(current_data.get(section, []))
                    if act == "add":
                        items.append(data)
                    elif act == "edit":
                        # Find by id and replace
                        item_id = data.get("id")
                        replaced = False
                        for i, item in enumerate(items):
                            if item.get("id") == item_id:
                                items[i] = data
                                replaced = True
                                break
                        if not replaced:
                            items.append(data)
                    current_data[section] = items

                # Validate and save
                validated = ResumeData(**current_data)
                resume.data = validated.model_dump()
                db.commit()
                db.refresh(resume)

                updated_section = section
                updated_data = data
                logger.info(f"Resume updated: {act} {section}")
            except Exception as e:
                logger.error(f"Failed to apply chat action: {e}")
                clean_reply += f"\n\n(Note: I tried to update your resume but encountered an error: {e})"

    return ChatResponse(
        reply=clean_reply,
        updated_section=updated_section,
        updated_data=updated_data,
    )


@router.post("/chat/upload")
async def chat_upload_file(
    resume_id: str = Form(...),
    message: str = Form(default=""),
    history: str = Form(default="[]"),
    file: UploadFile = File(...),
):
    """Chat with file upload - parses PDF/Word/images/text and delegates to chat."""
    from app.schemas.generate import ChatMessage
    from app.services.file_parser import parse_file

    content = await file.read()
    filename = file.filename or "uploaded_file"

    # Parse file using appropriate extractor
    logger.info(f"Upload: {filename} ({len(content)} bytes)")
    file_content = parse_file(content, filename)

    # Truncate very large extracted text
    if len(file_content) > 50000:
        file_content = file_content[:50000] + "\n... (truncated)"

    logger.info(f"Extracted {len(file_content)} chars from {filename}")

    history_parsed = json.loads(history) if history else []

    # Delegate to main chat handler
    from app.database import SessionLocal
    db = SessionLocal()
    try:
        request = ChatRequest(
            resume_id=resume_id,
            message=message or "Please analyze this file and extract relevant resume content.",
            history=[ChatMessage(**m) for m in history_parsed],
            file_content=file_content,
            file_name=filename,
        )
        return await chat_with_resume(request, db)
    finally:
        db.close()
