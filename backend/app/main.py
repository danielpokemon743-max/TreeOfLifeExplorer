import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from app.database import init_db
from app.config import settings
from app.routers import auth, progress, admin, ranking, chat, views, external, moderation, sitemap

# Evita que navegadores guardem index.html em cache (asset antigo viraria 404 após deploy)
class NoCacheHtmlMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        path = request.url.path
        if path == "/" or path.endswith(".html"):
            response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
        return response


# Headers de segurança e Content-Security-Policy.
# O frontend foi ajustado para não usar scripts inline, então o CSP pode ser
# estrito em script-src. 'unsafe-eval' é necessário: o bundle do PixiJS v7 usa
# new Function internamente no systemCheck (sem isso o PIXI recusa inicializar).
class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["X-Permitted-Cross-Domain-Policies"] = "none"
        response.headers["Cross-Origin-Opener-Policy"] = "same-origin"
        response.headers["Cross-Origin-Resource-Policy"] = "cross-origin"
        response.headers["X-DNS-Prefetch-Control"] = "off"
        response.headers["Permissions-Policy"] = (
            "geolocation=(), microphone=(), camera=(), payment=(), usb=(), gyroscope=(), accelerometer=()"
        )
        if settings.PRODUCTION:
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains; preload"

        csp_parts = [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://challenges.cloudflare.com",
            "script-src-elem 'self' 'unsafe-inline' https://challenges.cloudflare.com",
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
            "font-src 'self' https://fonts.gstatic.com",
            "img-src 'self' data: blob: https:",
            "media-src 'self' data: blob: https:",
            "connect-src 'self' https://api.opentreeoflife.org https://*.wikipedia.org https://www.wikidata.org https://commons.wikimedia.org https://api.gbif.org https://api.inaturalist.org https://www.inaturalist.org https://api.checklistbank.org https://challenges.cloudflare.com",
            "frame-src 'self' https://challenges.cloudflare.com",
            "object-src 'none'",
            "base-uri 'self'",
            "form-action 'self'",
            "frame-ancestors 'none'",
            "upgrade-insecure-requests",
        ]
        if settings.CSP_REPORT_URI:
            csp_parts.append(f"report-uri {settings.CSP_REPORT_URI}")
            csp_parts.append(f"report-to {settings.CSP_REPORT_URI}")
        csp = "; ".join(csp_parts)
        response.headers["Content-Security-Policy"] = csp
        return response

@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield

app = FastAPI(lifespan=lifespan, title="Tree of Life Explorer API")

limiter = Limiter(key_func=get_remote_address, storage_uri=settings.REDIS_URL if settings.REDIS_URL else "memory://")
app.state.limiter = limiter

@app.exception_handler(RateLimitExceeded)
async def _rate_limit_handler(request: Request, exc: RateLimitExceeded):
    return JSONResponse(status_code=429, content={"detail": f"Rate limit excedido. Tente novamente em {exc.detail}"})

app.add_middleware(NoCacheHtmlMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.expected_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(SecurityHeadersMiddleware)

app.include_router(auth.router)
app.include_router(progress.router)
app.include_router(admin.router)
app.include_router(ranking.router)
app.include_router(chat.router)
app.include_router(moderation.router)
app.include_router(views.router)
app.include_router(external.router)
app.include_router(sitemap.router)

@app.get("/api/health")
async def health():
    return {"status": "ok"}

# SEO deep-links: /especie/* e /reino/* servem o SPA (index.html) para indexação
@app.get("/especie/{slug}", include_in_schema=False)
async def especie_fallback(slug: str):
    import os as _os
    from fastapi.responses import FileResponse
    base = _os.path.dirname(_os.path.dirname(os.path.abspath(__file__)))
    for c in [os.environ.get("FRONTEND_DIST"), _os.path.join(base, "frontend", "dist"), _os.path.join(base.replace("/backend",""), "frontend", "dist")]:
        if c and _os.path.isdir(c):
            idx = _os.path.join(c, "index.html")
            if _os.path.isfile(idx):
                return FileResponse(idx)
    from fastapi import HTTPException
    raise HTTPException(status_code=404)

@app.get("/reino/{slug}", include_in_schema=False)
async def reino_fallback(slug: str):
    import os as _os
    from fastapi.responses import FileResponse
    base = _os.path.dirname(_os.path.dirname(os.path.abspath(__file__)))
    for c in [os.environ.get("FRONTEND_DIST"), _os.path.join(base, "frontend", "dist"), _os.path.join(base.replace("/backend",""), "frontend", "dist")]:
        if c and _os.path.isdir(c):
            idx = _os.path.join(c, "index.html")
            if _os.path.isfile(idx):
                return FileResponse(idx)
    from fastapi import HTTPException
    raise HTTPException(status_code=404)

# Servir o frontend compilado (se existir). Deve ficar DEPOIS dos routers /API.
try:
    def _candidate_dists() -> list[str]:
        env = os.environ.get("FRONTEND_DIST")
        base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # /app/backend
        candidates = []
        if env:
            candidates.append(env)
        candidates += [
            os.path.join(base, "frontend", "dist"),   # /app/backend/frontend/dist
            os.path.join(base.replace("/backend", ""), "frontend", "dist"),  # /app/frontend/dist
            os.path.join(os.path.dirname(base), "frontend", "dist"),          # /frontend/dist
        ]
        seen = set()
        return [c for c in candidates if not (c in seen or seen.add(c))]

    frontend_dist = next((c for c in _candidate_dists() if os.path.isdir(c)), None)
    if frontend_dist:
        print(f"[main] Servindo frontend de: {frontend_dist}")
        app.mount("/", StaticFiles(directory=frontend_dist, html=True), name="splash")
    else:
        print("[main] AVISO: frontend/dist não encontrado em: " + str(_candidate_dists()))
        @app.get("/")
        async def root():
            return {"message": "API do Tree of Life Explorer. Frontend não compilado."}
except Exception as e:
    print(f"[main] Erro ao montar frontend: {e}")
    @app.get("/")
    async def root():
        return {"message": "API do Tree of Life Explorer."}