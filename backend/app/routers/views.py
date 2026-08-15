from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import SiteView
from app.routers.auth import client_ip

router = APIRouter(prefix="/api/views", tags=["Views"])


class RecordViewRequest(BaseModel):
    # Id persistente do dispositivo, gerado uma vez pelo navegador do cliente.
    device_id: str = ""


@router.post("/record")
async def record_view(
    body: RecordViewRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Registra a primeira visita de um dispositivo (visualizações únicas).

    Um mesmo dispositivo (device_id) só conta uma vez, mesmo mudando de IP;
    o IP de origem fica apenas como referência informativa.
    """
    device_id = (body.device_id or "").strip()
    if not device_id or len(device_id) > 64:
        return {"recorded": False, "is_new": False}

    existing = await db.execute(
        select(SiteView.id).where(SiteView.device_id == device_id)
    )
    if existing.scalar_one_or_none() is not None:
        return {"recorded": False, "is_new": False}

    ip = client_ip(request)
    try:
        db.add(SiteView(device_id=device_id, first_ip=ip or None))
        await db.commit()
    except IntegrityError:
        # Corrida de duas requisições simultâneas do mesmo dispositivo: a outra venceu.
        await db.rollback()
        return {"recorded": False, "is_new": False}

    return {"recorded": True, "is_new": True}
