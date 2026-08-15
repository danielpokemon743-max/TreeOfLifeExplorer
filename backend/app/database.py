from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import settings
from app.models import Base, SiteView


# Usa DATABASE_URL do ambiente. Local: SQLite. Produção (Render): PostgreSQL via env.
def _async_url(url: str) -> str:
    # Neon/Supabase entregam "postgresql://..."; o SQLAlchemy async precisa do driver.
    clean = url.split("?")[0]  # descarta params tipo "?sslmode=require" (asyncpg usa SSL por padrão)
    if clean.startswith("postgresql://"):
        return clean.replace("postgresql://", "postgresql+asyncpg://", 1)
    return clean

DATABASE_URL = _async_url(settings.DATABASE_URL)

engine = create_async_engine(DATABASE_URL, echo=False, pool_pre_ping=True)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # Migração idempotente: garante colunas que create_all não adiciona
        # em tabelas já existentes.
        await conn.execute(text(
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin "
            "BOOLEAN NOT NULL DEFAULT FALSE"
        ))
        # site_views: a versão antiga era chaveada por IP; a nova é por
        # dispositivo (device_id). Se a tabela ainda estiver no formato antigo,
        # recria — são estatísticas transitórias, perder a contagem é aceitável.
        def _migrate_site_views(sync_conn) -> None:
            from sqlalchemy import inspect
            insp = inspect(sync_conn)
            if insp.has_table("site_views"):
                cols = {c["name"] for c in insp.get_columns("site_views")}
                if "device_id" not in cols:
                    SiteView.__table__.drop(sync_conn)
        await conn.run_sync(_migrate_site_views)
        await conn.run_sync(Base.metadata.create_all)
        await conn.commit()

async def get_db():
    async with async_session() as session:
        yield session
