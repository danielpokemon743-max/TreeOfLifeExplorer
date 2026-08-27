# config.py
import warnings

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
    JWT_EXPIRE_DAYS: int = 7

    # Em produção (true), desliga comandos de desenvolvimento (ex.: /level-dev)
    PRODUCTION: bool = False

    # Redis para rate-limit e challenges WebAuthn (opcional; fallback em memória se vazio)
    REDIS_URL: str = ""

    # URI para relatórios CSP (Report-Only). Se vazio, não envia report-uri
    CSP_REPORT_URI: str = ""

    # Cloudflare Turnstile (bot protection) — demo keys sempre passam, troque em produção
    # Demo sitekey/secret da Cloudflare (sempre validam). Defina suas chaves reais no Render.
    TURNSTILE_SECRET: str = "1x0000000000000000000000000000000AA"
    TURNSTILE_SITEKEY: str = "1x00000000000000000000AA"

    # Nicks (separados por vírgula) que têm acesso ao painel de administração
    # (banir contas/IPs e ver o ranking). Ex: "Nutelloso" ou "Nutelloso,Admin"
    ADMIN_NICKS: str = ""

    @property
    def admin_nicks(self) -> list[str]:
        return [n.strip() for n in (self.ADMIN_NICKS or "").split(",") if n.strip()]

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

# Flag segura = env informada e diferente do default do código-fonte.
# Um JWT_SECRET conhecido publicamente permite forjar tokens (inclusive de admin).
_INSECURE_JWT_SECRET = "SEU_SECRET_SUPER_SEGURO_AQUI_32_BYTES"


def _jwt_secret_is_safe() -> bool:
    return bool(settings.JWT_SECRET) and settings.JWT_SECRET != _INSECURE_JWT_SECRET


if settings.PRODUCTION and not _jwt_secret_is_safe():
    raise RuntimeError(
        "PRODUCTION=True exige um JWT_SECRET seguro. Defina a variável de ambiente "
        "JWT_SECRET (ex.: `openssl rand -hex 32`) antes de subir em produção."
    )
if settings.PRODUCTION and not settings.PUBLIC_URL.startswith("https://"):
    raise RuntimeError(
        "PRODUCTION=True exige PUBLIC_URL com https:// (ex.: https://seu-app.onrender.com). "
        f"Atual: {settings.PUBLIC_URL}"
    )
if not _jwt_secret_is_safe():
    warnings.warn(
        "AVISO: usando o JWT_SECRET padrão (inseguro). Defina a variável de ambiente "
        "JWT_SECRET antes de publicar o site.",
        RuntimeWarning,
        stacklevel=2,
    )