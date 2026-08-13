from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import sys
from pathlib import Path
sys.path.append(str(Path(__file__).resolve().parent.parent))

from presentation.api import router as taxon_router
from app.routers.auth import router as auth_router
from app.routers.progress import router as progress_router
from app.routers.chat import router as chat_router
from app.database import init_db

@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield

app = FastAPI(
    title="Tree of Life Explorer",
    description="API para explorar a evolução da vida na Terra",
    version="0.1.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(taxon_router)
app.include_router(auth_router)
app.include_router(progress_router)
app.include_router(chat_router)

@app.get("/")
async def root() -> dict[str, str]:
    return {"message": "Bem-vindo ao Tree of Life Explorer"}
