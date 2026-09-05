import asyncio
from logging.config import fileConfig

from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

from alembic import context

# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

import os
import sys
from urllib.parse import urlparse

# Usa a Base real do app (app.models) e a DATABASE_URL do settings
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from app.config import settings as _settings
from app.models import Base as _AppBase

# Converte DATABASE_URL para o formato esperado pelo Alembic (lida com sslmode para asyncpg)
def _alembic_sync_url(url: str) -> str:
    from urllib.parse import urlparse, urlunparse, parse_qsl, urlencode
    parsed = urlparse(url)
    # Para async (asyncpg), converte sslmode -> ssl
    if parsed.scheme in ("postgresql", "postgresql+asyncpg"):
        qsl = parse_qsl(parsed.query, keep_blank_values=True)
        new_qsl = []
        use_ssl = False
        for k, v in qsl:
            if k == "sslmode":
                if v in ("require", "verify-ca", "verify-full"):
                    use_ssl = True
                continue
            new_qsl.append((k, v))
        if use_ssl and not any(k == "ssl" for k, _ in new_qsl):
            new_qsl.append(("ssl", "true"))
        # Alembic offline usa sync (psycopg2) que aceita sslmode, mas online usa async (asyncpg) que precisa ssl
        # Mantém async para online, sync para offline será convertido pelo próprio Alembic se necessário
        # Por padrão, deixa async para o online
        if parsed.scheme == "postgresql":
            parsed = parsed._replace(scheme="postgresql+asyncpg")
        new_query = urlencode(new_qsl)
        parsed = parsed._replace(query=new_query)
        return urlunparse(parsed)
    if url.startswith("sqlite+aiosqlite://"):
        return url.replace("sqlite+aiosqlite://", "sqlite://", 1)
    return url

config.set_main_option("sqlalchemy.url", _alembic_sync_url(_settings.DATABASE_URL))

# Interpret the config file for Python logging.
# This line sets up loggers basically.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# add your model's MetaData object here
# for 'autogenerate' support
target_metadata = _AppBase.metadata

# other values from the config, defined by the needs of env.py,
# can be acquired:
# my_important_option = config.get_main_option("my_important_option")
# ... etc.


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode.

    This configures the context with just a URL
    and not an Engine, though an Engine is acceptable
    here as well.  By skipping the Engine creation
    we don't even need a DBAPI to be available.

    Calls to context.execute() here emit the given string to the
    script output.

    """
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    context.configure(connection=connection, target_metadata=target_metadata)

    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    """In this scenario we need to create an Engine
    and associate a connection with the context.

    """

    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)

    await connectable.dispose()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode."""

    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
