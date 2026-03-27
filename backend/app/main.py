"""SeekRefine - FastAPI application entry point."""

import logging
import sys
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from app.config import settings
from app.database import init_db
from app.models import followup as _followup_models  # noqa: F401 — ensure table created
from app.routers import generate, jobs, resume

# Configure logging - show LLM activity in console
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    datefmt="%H:%M:%S",
    handlers=[logging.StreamHandler(sys.stdout)],
)
# Set our logger to INFO, reduce noise from other libs
logging.getLogger("seekrefine").setLevel(logging.INFO)
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize database on startup."""
    init_db()
    logging.getLogger("seekrefine").info(
        f"SeekRefine started | Provider: {settings.llm_provider} | "
        f"Model: {_current_model_name()}"
    )
    yield


def _current_model_name() -> str:
    p = settings.llm_provider
    if p == "ollama":
        return settings.ollama_model
    elif p == "openai":
        return settings.openai_model
    elif p == "claude":
        return settings.claude_model
    elif p == "gemini":
        return settings.gemini_model
    elif p == "deepseek":
        return settings.deepseek_model
    return settings.ollama_model


app = FastAPI(
    title=settings.app_name,
    description="AI-powered job search assistant with resume optimization",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS for frontend dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(resume.router, prefix="/api/resumes", tags=["Resumes"])
app.include_router(jobs.router, prefix="/api/jobs", tags=["Jobs"])
app.include_router(generate.router, prefix="/api/generate", tags=["Generate"])


@app.get("/api/health")
async def health_check():
    return {"status": "ok", "app": settings.app_name}


# --- LLM Config API ---

class LLMConfigResponse(BaseModel):
    provider: str
    model: str
    available_providers: list[dict]


class LLMConfigUpdate(BaseModel):
    provider: str | None = None
    model: str | None = None
    api_key: str | None = None
    base_url: str | None = None
    max_tokens: int | None = None


@app.get("/api/llm/config", response_model=LLMConfigResponse)
async def get_llm_config():
    providers = [
        {
            "id": "ollama",
            "name": "Ollama (Local)",
            "model": settings.ollama_model,
            "configured": True,  # always available
        },
        {
            "id": "openai",
            "name": "OpenAI",
            "model": settings.openai_model,
            "configured": bool(settings.openai_api_key),
        },
        {
            "id": "claude",
            "name": "Claude (Anthropic)",
            "model": settings.claude_model,
            "configured": bool(settings.claude_api_key),
        },
        {
            "id": "gemini",
            "name": "Gemini (Google)",
            "model": settings.gemini_model,
            "configured": bool(settings.gemini_api_key),
        },
        {
            "id": "deepseek",
            "name": "DeepSeek",
            "model": settings.deepseek_model,
            "configured": bool(settings.deepseek_api_key),
        },
    ]
    return LLMConfigResponse(
        provider=settings.llm_provider,
        model=_current_model_name(),
        available_providers=providers,
    )


@app.put("/api/llm/config")
async def update_llm_config(payload: LLMConfigUpdate):
    """Update LLM provider settings at runtime (does not persist to .env)."""
    if payload.provider:
        if payload.provider not in ("ollama", "openai", "claude", "gemini", "deepseek"):
            return {"error": f"Unknown provider: {payload.provider}"}
        settings.llm_provider = payload.provider

    if payload.model:
        p = settings.llm_provider
        if p == "ollama":
            settings.ollama_model = payload.model
        elif p == "openai":
            settings.openai_model = payload.model
        elif p == "claude":
            settings.claude_model = payload.model
        elif p == "gemini":
            settings.gemini_model = payload.model
        elif p == "deepseek":
            settings.deepseek_model = payload.model

    if payload.api_key:
        p = settings.llm_provider
        if p == "openai":
            settings.openai_api_key = payload.api_key
        elif p == "claude":
            settings.claude_api_key = payload.api_key
        elif p == "gemini":
            settings.gemini_api_key = payload.api_key
        elif p == "deepseek":
            settings.deepseek_api_key = payload.api_key

    if payload.base_url:
        p = settings.llm_provider
        if p == "openai":
            settings.openai_base_url = payload.base_url
        elif p == "deepseek":
            settings.deepseek_base_url = payload.base_url

    if payload.max_tokens is not None:
        p = settings.llm_provider
        if p == "openai":
            settings.openai_max_tokens = payload.max_tokens
        elif p == "claude":
            settings.claude_max_tokens = payload.max_tokens
        elif p == "gemini":
            settings.gemini_max_tokens = payload.max_tokens
        elif p == "deepseek":
            settings.deepseek_max_tokens = payload.max_tokens

    logging.getLogger("seekrefine").info(
        f"LLM config updated: provider={settings.llm_provider}, model={_current_model_name()}"
    )
    return {"provider": settings.llm_provider, "model": _current_model_name()}
