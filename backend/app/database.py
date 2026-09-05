from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import settings
from app.models import Base, SiteView


# Usa DATABASE_URL do ambiente. Local: SQLite. Produção (Render): PostgreSQL via env.
def _async_url(url: str) -> str:
    from urllib.parse import urlparse, urlunparse, parse_qsl, urlencode
    parsed = urlparse(url)
    if parsed.scheme == "postgresql":
        # asyncpg lida com ssl via connect_args, não via sslmode na query
        qsl = parse_qsl(parsed.query, keep_blank_values=True)
        new_qsl = [(k, v) for k, v in qsl if k != "sslmode"]
        new_query = urlencode(new_qsl)
        parsed = parsed._replace(scheme="postgresql+asyncpg", query=new_query)
    return urlunparse(parsed)

def _connect_args(url: str) -> dict:
    from urllib.parse import urlparse, parse_qsl
    parsed = urlparse(url)
    qsl = parse_qsl(parsed.query, keep_blank_values=True)
    for k, v in qsl:
        if k == "sslmode" and v in ("require", "verify-ca", "verify-full"):
            return {"ssl": True}
    return {}

DATABASE_URL = _async_url(settings.DATABASE_URL)

engine = create_async_engine(
    DATABASE_URL,
    echo=False,
    pool_pre_ping=True,
    pool_size=20,
    max_overflow=10,
    pool_timeout=30,
    pool_recycle=1800,
    connect_args=_connect_args(settings.DATABASE_URL),
)
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
