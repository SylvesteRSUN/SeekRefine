# SeekRefine

Local AI-powered job search assistant. Uses a local LLM (Ollama) to automate LinkedIn job scraping, resume-job matching, resume tailoring, and cover letter generation — all through a web UI.

## Features

- **Resume Management** — Structured JSON editor mapped to moderncv LaTeX format. Import from LaTeX source, PDF, or Word files. Export as `.tex` for Overleaf.
- **AI Chat Assistant** — Natural language resume editing with file upload support. Describe a project and the AI adds it to the right section.
- **LinkedIn Job Scraping** — Playwright-based scraper with cookie persistence. AI generates search profiles from your resume; you pick location and run.
- **Match Analysis** — LLM scores each job against your resume, highlighting matching points and gaps.
- **Resume Tailoring** — Automatically selects relevant projects and rewrites descriptions for a target job. Side-by-side diff view.
- **Cover Letter Generation** — Multiple styles (professional / enthusiastic / concise). LaTeX export.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + Vite + TailwindCSS v4 |
| Backend | FastAPI + SQLAlchemy + SQLite |
| LLM | Ollama REST API (default: Qwen3.5 9B) |
| Scraper | Playwright (Chromium) |
| LaTeX | Jinja2 templates → moderncv `.tex` output |

## Prerequisites

- **Python 3.11+**
- **Node.js 18+**
- **Ollama** running locally with a model pulled:
  ```bash
  ollama pull qwen3.5:9b
  ```
- **Playwright browsers** (installed automatically on first run, or manually):
  ```bash
  python -m playwright install chromium
  ```

## Quick Start

### Windows
```
start.bat
```

### Linux / macOS
```bash
chmod +x start.sh
./start.sh
```

The script will:
1. Create a Python virtual environment (if not exists)
2. Install backend & frontend dependencies
3. Start backend (http://localhost:8000) and frontend (http://localhost:5173)
4. Open the browser automatically

## Configuration

Create `backend/.env` to override defaults:

```env
SEEKREFINE_OLLAMA_MODEL=qwen3.5:9b
SEEKREFINE_OLLAMA_BASE_URL=http://localhost:11434
SEEKREFINE_OLLAMA_NUM_CTX=32768
SEEKREFINE_OLLAMA_NUM_PREDICT=16384
SEEKREFINE_OLLAMA_TIMEOUT=600
```

## Project Structure

```
SeekRefine/
├── backend/
│   └── app/
│       ├── main.py              # FastAPI app entry
│       ├── config.py            # Settings (env vars)
│       ├── database.py          # SQLAlchemy + SQLite
│       ├── models/              # ORM models (Resume, Job, CoverLetter, etc.)
│       ├── schemas/             # Pydantic request/response schemas
│       ├── routers/             # API routes
│       │   ├── resume.py        # CRUD, import (LaTeX/PDF/Word), export
│       │   ├── jobs.py          # Search profiles, scraping, job management
│       │   └── generate.py      # LLM: match analysis, tailor, cover letter, chat
│       ├── services/            # Business logic
│       │   ├── llm_service.py   # Ollama API wrapper with streaming
│       │   ├── scraper.py       # Playwright LinkedIn scraper
│       │   ├── resume_service.py
│       │   ├── latex_service.py # JSON → LaTeX (Jinja2)
│       │   └── file_parser.py   # PDF/Word/image text extraction
│       ├── prompts/             # LLM prompt templates
│       └── templates/           # LaTeX Jinja2 templates (moderncv)
├── frontend/
│   └── src/
│       ├── pages/               # Dashboard, ResumeEditor, JobList, JobDetail
│       ├── components/          # ChatPanel, UI primitives
│       ├── services/api.ts      # Typed API client
│       └── stores/              # Zustand state management
├── start.bat                    # Windows one-click start
└── start.sh                     # Linux/macOS one-click start
```

## Usage Workflow

1. **Import your resume** — Paste LaTeX source or upload PDF/Word
2. **Go to Jobs** — Click "AI Generate" to create search profiles from your resume
3. **Set location** — Fill in your preferred location, select profiles, click "Run Selected"
4. **Log in to LinkedIn** — First time only; Chromium opens for manual login, cookies are saved
5. **Review scraped jobs** — Filter, search, check match scores
6. **Tailor & apply** — Generate tailored resume + cover letter, export as LaTeX for Overleaf

## API Documentation

With the backend running, visit http://localhost:8000/docs for the interactive Swagger UI.

## License

MIT
