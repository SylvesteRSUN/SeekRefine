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


def init_db():
    """Create all tables and run migrations."""
    Base.metadata.create_all(bind=engine)
    _migrate_add_columns()
