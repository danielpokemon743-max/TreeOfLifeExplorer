import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware
from app.database import init_db
from app.config import settings
from app.routers import auth, progress, admin, ranking

# Evita que navegadores guardem index.html em cache (asset antigo viraria 404 após deploy)
class NoCacheHtmlMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        path = request.url.path
        if path == "/" or path.endswith(".html"):
            response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
        return response

@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield

app = FastAPI(lifespan=lifespan, title="Tree of Life Explorer API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.expected_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(progress.router)
app.include_router(admin.router)
app.include_router(ranking.router)

@app.get("/api/health")
async def health():
    return {"status": "ok"}

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