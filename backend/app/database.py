"""Database setup with SQLAlchemy."""

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.config import settings

engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False},  # SQLite specific
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    """Dependency for FastAPI routes."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _migrate_add_columns():
    """Add new columns to existing tables if they don't exist (SQLite)."""
    import logging
    from sqlalchemy import inspect, text

    logger = logging.getLogger("seekrefine.db")
    inspector = inspect(engine)

    # Map: table_name -> list of (column_name, column_type_sql)
    migrations = {
        "jobs": [
            ("linkedin_job_id", "VARCHAR(50)"),
            ("applicant_count", "INTEGER"),
        ],
        "search_profiles": [
            ("date_posted", "VARCHAR(20)"),
            ("sort_by", "VARCHAR(20)"),
            ("max_applicants", "INTEGER"),
            ("exclude_keywords", "TEXT"),
        ],
    }

    with engine.begin() as conn:
        for table, columns in migrations.items():
            if table not in inspector.get_table_names():
                continue
            existing = {c["name"] for c in inspector.get_columns(table)}
            for col_name, col_type in columns:
                if col_name not in existing:
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col_name} {col_type}"))
                    logger.info(f"Migration: added {table}.{col_name} ({col_type})")


def _backfill_job_urls():
    """One-time cleanup: canonicalize existing job URLs and populate missing
    linkedin_job_id. Safe to run repeatedly — only updates rows that need it.
    Then drops any duplicate jobs that collapse to the same canonical URL.
    """
    import logging
    import re

    logger = logging.getLogger("seekrefine.db")

    def _extract_id(url):
        if not url:
            return None
        m = re.search(r"/jobs/view/(\d+)", url)
        if m: return m.group(1)
        m = re.search(r"[?&]currentJobId=(\d+)", url)
        if m: return m.group(1)
        m = re.search(r"[?&]referenceJobId=(\d+)", url)
        if m: return m.group(1)
        return None

    def _canon(url):
        jid = _extract_id(url)
        if jid:
            return f"https://www.linkedin.com/jobs/view/{jid}/"
        if url:
            return url.split("?")[0].split("#")[0]
        return None

    from sqlalchemy import text
    with engine.begin() as conn:
        rows = list(conn.execute(text("SELECT id, url, linkedin_job_id FROM jobs")))
        updated = 0
        for row in rows:
            job_id, url, lid = row
            new_url = _canon(url)
            new_lid = lid or _extract_id(url)
            if (new_url and new_url != url) or (new_lid and new_lid != lid):
                conn.execute(
                    text("UPDATE jobs SET url = :url, linkedin_job_id = :lid WHERE id = :id"),
                    {"url": new_url, "lid": new_lid, "id": job_id},
                )
                updated += 1

        if updated > 0:
            logger.info(f"Backfilled {updated} job URLs to canonical form")

        # Collapse duplicates that now share the same linkedin_job_id (keep oldest)
        dupes = conn.execute(text("""
            SELECT linkedin_job_id, COUNT(*) AS c
            FROM jobs WHERE linkedin_job_id IS NOT NULL
            GROUP BY linkedin_job_id HAVING c > 1
        """)).fetchall()
        dropped = 0
        for lid, _ in dupes:
            ids = [r[0] for r in conn.execute(
                text("SELECT id FROM jobs WHERE linkedin_job_id = :lid ORDER BY scraped_at ASC"),
                {"lid": lid},
            )]
            for dup_id in ids[1:]:
                conn.execute(text("DELETE FROM jobs WHERE id = :id"), {"id": dup_id})
                dropped += 1
        if dropped > 0:
            logger.info(f"Dropped {dropped} duplicate jobs sharing the same linkedin_job_id")


def init_db():
    """Create all tables and run migrations."""
    Base.metadata.create_all(bind=engine)
    _migrate_add_columns()
    _backfill_job_urls()
