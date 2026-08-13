import time as _time
import uuid
from collections import defaultdict, deque
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.geolocation import flag_emoji, geo_lookup, haversine_km
from app.models import ChatMessage, ChatReport, IpBan, User
from app.routers.auth import client_ip, is_admin_user, is_ip_banned
from app.routers.progress import level_from_xp
from app.security import get_current_user_id, text_contains_bad_words, verify_token

router = APIRouter(prefix="/api/chat", tags=["Chat"])

ALLOWED_CHANNELS = ("global", "local")
MAX_MESSAGE_LENGTH = 500
# Raio (~km) usado no chat local: só vê quem estiver geograficamente perto.
LOCAL_RADIUS_KM = 200.0
# Quantidade de mensagens recentes do canal "local" analisadas por aproximação.
LOCAL_SCAN_LIMIT = 1000

# ─── Anti spam: limite de envios por usuário (memória; servidor tem 1 worker) ─
_SEND_WINDOW_SECONDS = 15
_SEND_MAX_PER_WINDOW = 5
_send_history: dict[uuid.UUID, deque] = defaultdict(deque)


def _prune_send(history: deque) -> None:
    cutoff = _time.time() - _SEND_WINDOW_SECONDS
    while history and history[0] < cutoff:
        history.popleft()


def _hit_rate_limit(user_id: uuid.UUID) -> bool:
    """Registra o envio e retorna True se o usuário estourou o limite."""
    now = _time.time()
    history = _send_history[user_id]
    history.append(now)
    _prune_send(history)
    return len(history) > _SEND_MAX_PER_WINDOW


# ─── Auth opcional (ler chat não exige login; enviar exige) ───────────────────
_bearer = HTTPBearer(auto_error=False)


async def _optional_user_id(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> Optional[uuid.UUID]:
    if credentials is None:
        return None
    return verify_token(credentials.credentials)


def _serialize(msg: ChatMessage, user: User | None, include_ip: bool = False) -> dict:
    level = 1
    hours = 0.0
    if user is not None:
        level = level_from_xp(user.xp or 0)
        hours = round((user.total_time_seconds or 0) / 3600.0, 1)
    out = {
        "id": str(msg.id),
        "user_id": str(msg.user_id),
        "nick": user.display_name if user else "Usuário removido",
        "level": level,
        "hours": hours,
        "flag": flag_emoji(msg.country_code or ""),
        "country": msg.country or "",
        "content": msg.content,
        "channel": msg.channel,
        "created_at": msg.created_at.isoformat() if msg.created_at else None,
        "is_mine": False,
        "is_admin_user": bool(user and is_admin_user(user)),
    }
    if include_ip:
        out["ip"] = msg.ip or ""
    return out


def _is_near(requester_geo: dict, msg: ChatMessage) -> bool:
    """Define se uma mensagem está "local" para quem consulta.

    Estado com coordenadas: distância <= raio. Sem coordenadas: cai para
    país + região iguais (aproximação quando o IP não tem lat/lon).
    """
    rlat, rlon = requester_geo.get("lat"), requester_geo.get("lon")
    mlat, mlon = msg.latitude, msg.longitude
    if rlat is not None and rlon is not None and mlat is not None and mlon is not None:
        dist_km = haversine_km(float(rlat), float(rlon), float(mlat), float(mlon))
        return dist_km <= LOCAL_RADIUS_KM
    # Sem coordenadas: aproxima por país + região
    if requester_geo.get("country_code") and msg.country_code:
        return (
            requester_geo["country_code"] == msg.country_code
            and (requester_geo.get("region") or "") == (msg.region or "")
            and bool(requester_geo.get("region"))
        )
    return False


@router.get("/messages")
async def get_messages(
    request: Request,
    channel: str = "global",
    limit: int = 50,
    requester_id: Optional[uuid.UUID] = Depends(_optional_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Público (sem login): lista de mensagens de um canal.

    - global: todos os usuários logados, de qualquer país.
    - local: só quem estiver geograficamente perto do IP de quem consulta.
    """
    channel = (channel or "").strip().lower()
    if channel not in ALLOWED_CHANNELS:
        raise HTTPException(status_code=400, detail="Canal inválido.")
    limit = max(1, min(100, int(limit or 50)))

    requester = None
    if requester_id:
        requester = await db.get(User, requester_id)
    include_ip = bool(requester and is_admin_user(requester))

    stmt = (
        select(ChatMessage)
        .options(selectinload(ChatMessage.user))
        .where(ChatMessage.channel == channel)
        .order_by(ChatMessage.created_at.desc())
    )

    localization_ok = True
    hint = None
    if channel == "global":
        rows = (await db.execute(stmt.limit(limit))).scalars().all()
    else:
        requester_geo = await geo_lookup(client_ip(request))
        if requester_geo is None:
            return {
                "messages": [],
                "channel": channel,
                "localization_ok": False,
                "hint": ("Não foi possível determinar sua localização. "
                         "O chat local está indisponível para você."),
            }
        all_rows = (await db.execute(stmt.limit(LOCAL_SCAN_LIMIT))).scalars().all()
        rows = [m for m in all_rows if _is_near(requester_geo, m)][:limit]
        if not rows:
            hint = "Nenhuma mensagem de pessoas perto de você por enquanto."

    # Remove mensagens de contas banidas ou de IPs banidos (leitura barata).
    banned_acc_rows = await db.execute(select(User.id).where(User.is_banned == True))  # noqa: E712
    banned_acc = set(banned_acc_rows.scalars().all())
    banned_ips = set((await db.execute(select(IpBan.ip))).scalars().all())
    rows = [m for m in rows if m.user_id not in banned_acc and m.ip not in banned_ips]

    # ordem cronológica para exibição (do mais antigo ao mais novo)
    rows = list(reversed(rows))

    messages = [
        _serialize(m, m.user, include_ip=include_ip)
        for m in rows
        if m.user_id not in banned_acc
    ]

    for m in messages:
        m["is_mine"] = requester_id is not None and (m["user_id"] == str(requester_id))

    return {
        "messages": messages,
        "channel": channel,
        "localization_ok": localization_ok,
        "hint": hint,
    }


class SendRequest(BaseModel):
    channel: str = "global"
    content: str = ""


@router.post("/send")
async def send_message(
    body: SendRequest,
    request: Request,
    current_user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Envia uma mensagem. Exige login e seriedade (filtro de ofensas)."""
    channel = (body.channel or "").strip().lower()
    if channel not in ALLOWED_CHANNELS:
        raise HTTPException(status_code=400, detail="Canal inválido.")

    content = (body.content or "").strip()
    if not content:
        raise HTTPException(status_code=400, detail="Mensagem vazia.")
    if len(content) > MAX_MESSAGE_LENGTH:
        detail_max = f"Limite de {MAX_MESSAGE_LENGTH} caracteres."
        raise HTTPException(status_code=400, detail=detail_max)

    user = await db.get(User, current_user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado.")

    ip = client_ip(request)
    if user.is_banned or await is_ip_banned(ip, db):
        raise HTTPException(
            status_code=403,
            detail="Você está banido e não pode enviar mensagens.",
        )

    # Filtro de língua ofensiva: BLOQUEIA o envio E avisa o admin (chat_reports).
    if text_contains_bad_words(content):
        db.add(ChatReport(
            user_id=current_user_id,
            content_attempted=content[:MAX_MESSAGE_LENGTH],
            ip=ip or None,
        ))
        await db.commit()
        raise HTTPException(
            status_code=400,
            detail="Sua mensagem foi bloqueada por conter linguagem inapropriada.",
        )

    if _hit_rate_limit(current_user_id):
        raise HTTPException(
            status_code=429,
            detail="Aguarde alguns segundos antes de enviar outra mensagem.",
        )

    geo = await geo_lookup(ip) if ip else None
    msg = ChatMessage(
        user_id=current_user_id,
        channel=channel,
        content=content,
        ip=ip or "unknown",
        country_code=(geo or {}).get("country_code"),
        country=(geo or {}).get("country"),
        region=(geo or {}).get("region"),
        latitude=(geo or {}).get("lat"),
        longitude=(geo or {}).get("lon"),
    )
    db.add(msg)
    await db.commit()
    await db.refresh(msg)

    out = _serialize(msg, user, include_ip=False)
    out["is_mine"] = True
    return out


# ─── Alertas de mensagens ofensivas (visíveis só para o admin) ──────────────
@router.get("/reports")
async def list_reports(
    current_user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    user = await db.get(User, current_user_id)
    if not is_admin_user(user):
        raise HTTPException(status_code=403, detail="Acesso restrito à administração.")

    result = await db.execute(
        select(ChatReport)
        .options(selectinload(ChatReport.user))
        .order_by(ChatReport.created_at.desc())
        .limit(100)
    )
    reports = result.scalars().all()
    return {"reports": [
        {
            "id": str(r.id),
            "user_id": str(r.user_id) if r.user_id else None,
            "nick": r.user.display_name if r.user else "Usuário removido",
            "content": r.content_attempted,
            "ip": r.ip or "",
            "resolved": bool(r.resolved),
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in reports
    ]}


class ResolveReportRequest(BaseModel):
    report_id: str


@router.post("/reports/resolve")
async def resolve_report(
    body: ResolveReportRequest,
    current_user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    user = await db.get(User, current_user_id)
    if not is_admin_user(user):
        raise HTTPException(status_code=403, detail="Acesso restrito à administração.")

    try:
        rid = uuid.UUID(body.report_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="report_id inválido.")

    report = await db.get(ChatReport, rid)
    if not report:
        raise HTTPException(status_code=404, detail="Alerta não encontrado.")

    report.resolved = True
    await db.commit()
    return {"status": "resolved", "report_id": body.report_id}
