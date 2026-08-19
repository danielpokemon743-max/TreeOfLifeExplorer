import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models import BanRequest, BanRequestMessage, ChatMessage, User
from app.routers.admin import _require_admin
from app.routers.auth import is_admin_user
from app.security import get_current_user_id

router = APIRouter(prefix="/api/moderation", tags=["Moderação"])

MAX_REASON = 300
MAX_MSG = 500


async def _get_request(db: AsyncSession, request_id: uuid.UUID) -> BanRequest:
    row = await db.execute(
        select(BanRequest)
        .options(selectinload(BanRequest.target), selectinload(BanRequest.requester))
        .where(BanRequest.id == request_id)
    )
    req = row.scalar_one_or_none()
    if not req:
        raise HTTPException(status_code=404, detail="Solicitação não encontrada.")
    return req


async def _get_thread(db: AsyncSession, ban_request_id: uuid.UUID) -> list[dict]:
    rows = await db.execute(
        select(BanRequestMessage)
        .options(selectinload(BanRequestMessage.sender))
        .where(BanRequestMessage.ban_request_id == ban_request_id)
        .order_by(BanRequestMessage.created_at.asc())
    )
    return [
        {
            "id": str(m.id),
            "sender_user_id": str(m.sender_user_id),
            "receiver_user_id": str(m.receiver_user_id),
            "is_admin": bool(m.sender and is_admin_user(m.sender)),
            "content": m.content,
            "read": bool(m.read),
            "created_at": m.created_at.isoformat() if m.created_at else None,
        }
        for m in rows.scalars().all()
    ]


async def _serialize_request(db: AsyncSession, req: BanRequest, include_messages: bool = False) -> dict:
    last_row = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.user_id == req.target_user_id)
        .order_by(ChatMessage.created_at.desc())
        .limit(1)
    )
    last_msg = last_row.scalar_one_or_none()

    target = await db.get(User, req.target_user_id)
    requester = await db.get(User, req.requester_user_id) if req.requester_user_id else None

    out = {
        "id": str(req.id),
        "target_user_id": str(req.target_user_id),
        "target_name": target.display_name if target else "Usuário removido",
        "requester_user_id": str(req.requester_user_id) if req.requester_user_id else None,
        "requester_name": requester.display_name if requester else "Usuário removido",
        "reason": req.reason,
        "status": req.status,
        "created_at": req.created_at.isoformat() if req.created_at else None,
        "resolved_at": req.resolved_at.isoformat() if req.resolved_at else None,
        "last_message": last_msg.content if last_msg else None,
        "last_message_at": last_msg.created_at.isoformat() if last_msg else None,
    }
    if include_messages:
        out["messages"] = await _get_thread(db, req.id)
    return out


async def _pick_admin_receiver(db: AsyncSession, req: BanRequest) -> User | None:
    """Devolve o admin que respondeu por último no tópico (ou qualquer admin)."""
    rows = await db.execute(
        select(BanRequestMessage)
        .options(selectinload(BanRequestMessage.sender))
        .where(BanRequestMessage.ban_request_id == req.id)
        .order_by(BanRequestMessage.created_at.desc())
        .limit(10)
    )
    for m in rows.scalars().all():
        if m.sender and is_admin_user(m.sender):
            return m.sender
    admin_rows = await db.execute(select(User).where(User.is_admin == True).limit(1))  # noqa: E712
    return admin_rows.scalar_one_or_none()


# ─── Denúncia de usuário (qualquer usuário logado) ───────────────────────────
class ReportUserRequest(BaseModel):
    target_user_id: str
    reason: str = ""


@router.post("/report-user")
async def report_user(
    body: ReportUserRequest,
    current_user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Usuário solicita o banimento de outro usuário do chat."""
    try:
        target_id = uuid.UUID(body.target_user_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Usuário inválido.")

    if target_id == current_user_id:
        raise HTTPException(status_code=400, detail="Você não pode denunciar a si mesmo.")

    reason = (body.reason or "").strip()
    if len(reason) < 5:
        raise HTTPException(status_code=400, detail="Descreva o motivo (mínimo de 5 caracteres).")
    reason = reason[:MAX_REASON]

    target = await db.get(User, target_id)
    if not target:
        raise HTTPException(status_code=404, detail="Usuário não encontrado.")

    # Uma solicitação pendente por alvo — evita spam de denúncias.
    existing = await db.execute(
        select(BanRequest).where(
            BanRequest.target_user_id == target_id,
            BanRequest.status == "pending",
        )
    )
    current = existing.scalar_one_or_none()
    if current:
        return {**(await _serialize_request(db, current)), "existing": True}

    req = BanRequest(
        requester_user_id=current_user_id,
        target_user_id=target_id,
        reason=reason,
        status="pending",
    )
    db.add(req)
    await db.commit()
    await db.refresh(req)
    return {**(await _serialize_request(db, req)), "existing": False}


# ─── Tópicos do admin ────────────────────────────────────────────────────────
class ResolveRequestRequest(BaseModel):
    outcome: str = "resolved"  # resolved | dismissed


class ReplyAdminRequest(BaseModel):
    content: str = ""


@router.get("/ban-requests")
async def list_ban_requests(
    status: str = "pending",
    current_user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Admin: lista as solicitações de ban com a última mensagem do alvo."""
    await _require_admin(db, current_user_id)
    status = (status or "pending").strip()
    if status not in ("pending", "resolved", "dismissed", "all"):
        raise HTTPException(status_code=400, detail="Status inválido.")

    stmt = (
        select(BanRequest)
        .options(selectinload(BanRequest.target), selectinload(BanRequest.requester))
        .order_by(BanRequest.created_at.desc())
    )
    if status != "all":
        stmt = stmt.where(BanRequest.status == status)
    rows = (await db.execute(stmt.limit(200))).scalars().all()
    return {"requests": [await _serialize_request(db, r) for r in rows]}


@router.get("/ban-requests/{request_id}")
async def get_ban_request(
    request_id: uuid.UUID,
    current_user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Admin: abre um tópico (solicitação + conversa admin <-> alvo)."""
    await _require_admin(db, current_user_id)
    req = await _get_request(db, request_id)
    return await _serialize_request(db, req, include_messages=True)


@router.post("/ban-requests/{request_id}/reply")
async def admin_reply(
    request_id: uuid.UUID,
    body: ReplyAdminRequest,
    current_user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Admin: envia mensagem para a pessoa com banimento solicitado."""
    admin = await _require_admin(db, current_user_id)
    req = await _get_request(db, request_id)
    if req.status != "pending":
        raise HTTPException(status_code=400, detail="Esta solicitação já foi resolvida.")

    content = (body.content or "").strip()
    if not content or len(content) > MAX_MSG:
        raise HTTPException(status_code=400, detail="Mensagem vazia ou longa demais.")

    msg = BanRequestMessage(
        ban_request_id=req.id,
        sender_user_id=admin.id,
        receiver_user_id=req.target_user_id,
        content=content,
        read=False,
    )
    db.add(msg)
    await db.commit()
    await db.refresh(msg)
    return {"id": str(msg.id), "status": "sent"}


@router.post("/ban-requests/{request_id}/resolve")
async def resolve_ban_request(
    request_id: uuid.UUID,
    body: ResolveRequestRequest,
    current_user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Admin: encerra a solicitação (resolved = tratada, dismissed = sem ação)."""
    await _require_admin(db, current_user_id)
    req = await _get_request(db, request_id)
    if body.outcome not in ("resolved", "dismissed"):
        raise HTTPException(status_code=400, detail="Outcome inválido.")
    req.status = body.outcome
    req.resolved_at = datetime.now(timezone.utc)
    await db.commit()
    return {"status": "resolved", "request_id": str(req.id), "outcome": body.outcome}


# ─── Caixa de notificações da pessoa denunciada ──────────────────────────────
@router.get("/inbox/unread")
async def inbox_unread(
    current_user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Quantas mensagens do admin a pessoa ainda não leu."""
    from sqlalchemy import func as sa_func
    n = await db.scalar(
        select(sa_func.count()).select_from(BanRequestMessage).where(
            BanRequestMessage.receiver_user_id == current_user_id,
            BanRequestMessage.read == False,  # noqa: E712
        )
    )
    return {"unread": n or 0}


@router.get("/inbox")
async def inbox(
    current_user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Pessoa denunciada: tópicos com o admin + mensagens (marca como lidas)."""
    rows = await db.execute(
        select(BanRequest)
        .options(selectinload(BanRequest.target), selectinload(BanRequest.requester))
        .where(BanRequest.target_user_id == current_user_id)
        .order_by(BanRequest.created_at.desc())
        .limit(50)
    )
    requests = rows.scalars().all()

    # Marca as mensagens do admin (recebidas por mim) como lidas.
    unseen = await db.execute(
        update(BanRequestMessage)
        .where(
            BanRequestMessage.receiver_user_id == current_user_id,
            BanRequestMessage.read == False,  # noqa: E712
        )
        .values(read=True)
        .returning(BanRequestMessage.id)
    )
    marked = len(unseen.all() or [])
    await db.commit()

    return {
        "threads": [await _serialize_request(db, r, include_messages=True) for r in requests],
        "unread_now": marked,
    }


class InboxReplyRequest(BaseModel):
    content: str = ""


@router.post("/inbox/{request_id}/reply")
async def inbox_reply(
    request_id: uuid.UUID,
    body: InboxReplyRequest,
    current_user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Pessoa denunciada responde ao admin dentro do tópico."""
    req = await _get_request(db, request_id)
    if req.target_user_id != current_user_id:
        raise HTTPException(status_code=403, detail="Este tópico não é seu.")
    if req.status != "pending":
        raise HTTPException(status_code=400, detail="Esta solicitação já foi resolvida.")

    content = (body.content or "").strip()
    if not content or len(content) > MAX_MSG:
        raise HTTPException(status_code=400, detail="Mensagem vazia ou longa demais.")

    receiver = await _pick_admin_receiver(db, req)
    if receiver is None:
        raise HTTPException(status_code=400, detail="Nenhum admin disponível para receber mensagens.")

    msg = BanRequestMessage(
        ban_request_id=req.id,
        sender_user_id=current_user_id,
        receiver_user_id=receiver.id,
        content=content,
        read=False,
    )
    db.add(msg)
    await db.commit()
    await db.refresh(msg)
    return {"id": str(msg.id), "status": "sent"}