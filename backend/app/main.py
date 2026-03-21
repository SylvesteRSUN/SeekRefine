"""SeekRefine - FastAPI application entry point."""

import logging
import sys
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import init_db
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
        f"SeekRefine started | Model: {settings.ollama_model} | "
        f"num_ctx: {settings.ollama_num_ctx} | num_predict: {settings.ollama_num_predict}"
    )
    yield


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
