import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from app.database import init_db
from app.config import settings
from app.routers import auth, progress

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

@app.get("/api/health")
async def health():
    return {"status": "ok"}

# Servir o frontend compilado (se existir). Deve ficar DEPOIS dos routers /API.
try:
    frontend_dist = os.environ.get(
        "FRONTEND_DIST",
        os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "frontend", "dist"),
    )
    if os.path.isdir(frontend_dist):
        app.mount("/", StaticFiles(directory=frontend_dist, html=True), name="splash")
    else:
        @app.get("/")
        async def root():
            return {"message": "API do Tree of Life Explorer. Frontend não compilado."}
except Exception:
    @app.get("/")
    async def root():
        return {"message": "API do Tree of Life Explorer."}