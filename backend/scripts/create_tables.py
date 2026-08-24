"""
Initial database schema creation script.

Run this to create all tables directly without Alembic.
Usage: python -m scripts.create_tables
"""

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sqlalchemy import create_engine, text
from app.config import get_settings
from app.db.database import Base
from app.db.models import *  # noqa — import all models

settings = get_settings()


def create_tables():
    """Create all tables and extensions."""
    engine = create_engine(settings.database_url_sync, echo=True)

    with engine.connect() as conn:
        # Enable pgvector extension
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        conn.commit()

    # Create all tables
    Base.metadata.create_all(bind=engine)
    print("✅ All tables created successfully!")

    # Create additional indexes that SQLAlchemy doesn't handle well
    with engine.connect() as conn:
        # Full-text search trigger for auto-updating search_vector
        conn.execute(text("""
            CREATE OR REPLACE FUNCTION update_search_vector()
            RETURNS trigger AS $$
            BEGIN
                NEW.search_vector := to_tsvector('english', coalesce(NEW.title, '') || ' ' || coalesce(NEW.content, ''));
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;
        """))

        conn.execute(text("""
            DROP TRIGGER IF EXISTS trg_update_search_vector ON engineering_documents;
        """))

        conn.execute(text("""
            CREATE TRIGGER trg_update_search_vector
            BEFORE INSERT OR UPDATE OF title, content ON engineering_documents
            FOR EACH ROW
            EXECUTE FUNCTION update_search_vector();
        """))

        conn.commit()
    print("✅ Triggers and indexes created!")


if __name__ == "__main__":
    create_tables()
