from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import settings
from app.models import Base, SiteView


# Usa DATABASE_URL do ambiente. Local: SQLite. Produção (Render): PostgreSQL via env.
def _async_url(url: str) -> str:
    from urllib.parse import urlparse, urlunparse, parse_qsl, urlencode
    parsed = urlparse(url)
    if parsed.scheme == "postgresql":
        # asyncpg não aceita sslmode como query param, converte para ssl
        qsl = parse_qsl(parsed.query, keep_blank_values=True)
        new_qsl = []
        use_ssl = False
        for k, v in qsl:
            if k == "sslmode":
                if v in ("require", "verify-ca", "verify-full"):
                    use_ssl = True
                # descarta sslmode da query para asyncpg
                continue
            new_qsl.append((k, v))
        if use_ssl and not any(k == "ssl" for k, _ in new_qsl):
            new_qsl.append(("ssl", "true"))
        new_query = urlencode(new_qsl)
        parsed = parsed._replace(scheme="postgresql+asyncpg", query=new_query)
    return urlunparse(parsed)

DATABASE_URL = _async_url(settings.DATABASE_URL)

engine = create_async_engine(
    DATABASE_URL,
    echo=False,
    pool_pre_ping=True,
    pool_size=20,
    max_overflow=10,
    pool_timeout=30,
    pool_recycle=1800,
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
