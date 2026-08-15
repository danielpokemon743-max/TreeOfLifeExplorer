from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import SiteView
from app.routers.auth import client_ip

router = APIRouter(prefix="/api/views", tags=["Views"])


@router.post("/record")
async def record_view(request: Request, db: AsyncSession = Depends(get_db)):
    """Registra a primeira visita de um IP (visualizações únicas).

    Um IP só conta uma vez: chamadas repetidas do mesmo endereço não
    incrementam a contagem (as estatísticas mostram IPs distintos).
    """
    ip = client_ip(request)
    if not ip or ip == "unknown":
        return {"recorded": False, "is_new": False}

    existing = await db.execute(select(SiteView.id).where(SiteView.ip == ip))
    if existing.scalar_one_or_none() is not None:
        return {"recorded": False, "is_new": False}

    try:
        db.add(SiteView(ip=ip))
        await db.commit()
    except IntegrityError:
        # Corrida de duas requisições simultâneas do mesmo IP: a outra venceu.
        await db.rollback()
        return {"recorded": False, "is_new": False}

    return {"recorded": True, "is_new": True}
