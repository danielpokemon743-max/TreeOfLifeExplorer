# config.py
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    # Domínio/URL da aplicação. No Render, use a env RENDER_EXTERNAL_URL
    # (o Render preenche sozinho) ou defina PUBLIC_URL manualmente.
    PUBLIC_URL: str = "http://localhost:5173"

    # RP_ID do WebAuthn = domínio sem "https://" e sem porta.
    # Derivamos automaticamente de PUBLIC_URL se não for informado.
    RP_ID: str = ""

    RP_NAME: str = "Tree of Life Explorer"
    EXPECTED_ORIGIN: str = ""

    # Banco de dados. Em prod: postgresql+asyncpg://...  Em local: sqlite.
    DATABASE_URL: str = "sqlite+aiosqlite:///./tree_of_life.db"

    # JWT
    JWT_SECRET: str = "SEU_SECRET_SUPER_SEGURO_AQUI_32_BYTES"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_DAYS: int = 30

    # Em produção (true), desliga comandos de desenvolvimento (ex.: /level-dev)
    PRODUCTION: bool = False

    @property
    def jwt_secret_or_default(self) -> str:
        return self.JWT_SECRET

    @property
    def rp_id(self) -> str:
        if self.RP_ID:
            return self.RP_ID
        from urllib.parse import urlparse
        host = urlparse(self.PUBLIC_URL).hostname or "localhost"
        return host

    @property
    def expected_origin(self) -> str:
        if self.EXPECTED_ORIGIN:
            return self.EXPECTED_ORIGIN
        return self.PUBLIC_URL.rstrip("/")

    class Config:
        env_file = ".env"
        extra = "ignore"

settings = Settings()