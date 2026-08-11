from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy import text
from app.models import Base
from app.config import settings

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
        await conn.commit()

async def get_db():
    async with async_session() as session:
        yield session