# SeekRefine

AI-powered job search assistant. Supports multiple LLM providers (Ollama, OpenAI, Claude, Gemini, DeepSeek) to automate LinkedIn job scraping, resume-job matching, resume tailoring, and cover letter generation — all through a web UI.

## Features

- **Resume Management** — Structured JSON editor mapped to moderncv LaTeX format. Import from LaTeX source, PDF, or Word files. Export as `.tex` for Overleaf.
- **AI Chat Assistant** — Natural language resume editing with file upload support. Describe a project and the AI adds it to the right section.
- **LinkedIn Job Scraping** — Playwright-based scraper with cookie persistence. AI generates search profiles from your resume with advanced filters (date posted, applicant count, keyword exclusion). Deduplication prevents re-adding the same jobs.
- **Match Analysis** — LLM scores each job against your resume, highlighting matching points and gaps.
- **Resume Tailoring** — Automatically selects relevant projects and rewrites descriptions for a target job.
- **Cover Letter Generation** — Multiple styles (professional / enthusiastic / concise). LaTeX export.
- **Multi-LLM Support** — Switch between Ollama (local), OpenAI, Claude, Gemini, and DeepSeek at runtime from the Dashboard.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + Vite + TailwindCSS v4 |
| Backend | FastAPI + SQLAlchemy + SQLite |
| LLM | Ollama / OpenAI / Claude / Gemini / DeepSeek (configurable) |
| Scraper | Playwright (Chromium) |
| LaTeX | Jinja2 templates → moderncv `.tex` output |

## Prerequisites

- **Python 3.11+**
- **Node.js 18+**
- **At least one LLM provider**:
  - **Ollama** (local, free): `ollama pull qwen3.5:9b`
  - Or an API key for OpenAI / Claude / Gemini / DeepSeek
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
# LLM Provider: ollama | openai | claude | gemini | deepseek
SEEKREFINE_LLM_PROVIDER=ollama

# Ollama (local)
SEEKREFINE_OLLAMA_MODEL=qwen3.5:9b
SEEKREFINE_OLLAMA_BASE_URL=http://localhost:11434
SEEKREFINE_OLLAMA_NUM_CTX=32768
SEEKREFINE_OLLAMA_NUM_PREDICT=16384
SEEKREFINE_OLLAMA_TIMEOUT=600

# OpenAI
SEEKREFINE_OPENAI_API_KEY=sk-xxx
SEEKREFINE_OPENAI_MODEL=gpt-4o

# Claude (Anthropic)
SEEKREFINE_CLAUDE_API_KEY=sk-ant-xxx
SEEKREFINE_CLAUDE_MODEL=claude-sonnet-4-20250514

# Gemini (Google)
SEEKREFINE_GEMINI_API_KEY=xxx
SEEKREFINE_GEMINI_MODEL=gemini-2.0-flash

# DeepSeek
SEEKREFINE_DEEPSEEK_API_KEY=sk-xxx
SEEKREFINE_DEEPSEEK_MODEL=deepseek-chat
```

You can also switch providers at runtime from the Dashboard without restarting.

## Project Structure

```
SeekRefine/
├── backend/
│   └── app/
│       ├── main.py              # FastAPI app + LLM config API
│       ├── config.py            # Settings (env vars, multi-provider)
│       ├── database.py          # SQLAlchemy + SQLite + auto-migration
│       ├── models/              # ORM models (Resume, Job, CoverLetter, etc.)
│       ├── schemas/             # Pydantic request/response schemas
│       ├── routers/             # API routes
│       │   ├── resume.py        # CRUD, import (LaTeX/PDF/Word), export
│       │   ├── jobs.py          # Search profiles, scraping, filtering, dedup
│       │   └── generate.py      # LLM: match analysis, tailor, cover letter, chat
│       ├── services/            # Business logic
│       │   ├── llm_service.py   # Multi-provider LLM (Ollama/OpenAI/Claude/Gemini/DeepSeek)
│       │   ├── scraper.py       # Playwright LinkedIn scraper with filters
│       │   ├── resume_service.py
│       │   ├── latex_service.py # JSON → LaTeX (Jinja2)
│       │   └── file_parser.py   # PDF/Word/image text extraction
│       ├── prompts/             # LLM prompt templates
│       └── templates/           # LaTeX Jinja2 templates (moderncv)
├── frontend/
│   └── src/
│       ├── pages/               # Dashboard, ResumeEditor, JobList, JobDetail
│       ├── components/          # ChatPanel, LLMSettings, UI primitives
│       ├── services/api.ts      # Typed API client
│       └── stores/              # Zustand state management
├── start.bat                    # Windows one-click start
└── start.sh                     # Linux/macOS one-click start
```

## Usage Workflow

1. **Configure LLM** — On the Dashboard, pick your LLM provider and enter API key (or use Ollama locally)
2. **Import your resume** — Paste LaTeX source or upload PDF/Word
3. **Go to Jobs** — Click "AI Generate" to create search profiles from your resume
4. **Set filters** — Location, date posted, max applicants, exclude keywords (e.g., "Swedish")
5. **Run search** — Select profiles, click "Run Selected"; first time opens Chromium for LinkedIn login
6. **Review scraped jobs** — Filter, search, delete unwanted jobs, check match scores
7. **Tailor & apply** — Generate tailored resume + cover letter, export as LaTeX for Overleaf

## API Documentation

With the backend running, visit http://localhost:8000/docs for the interactive Swagger UI.

## License

MIT
