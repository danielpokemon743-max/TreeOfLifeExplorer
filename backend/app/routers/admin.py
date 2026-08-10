import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func as sa_func

from app.database import get_db
from app.models import User, IpBan, Achievement, Discovery
from app.security import get_current_user_id
from app.routers.auth import is_admin_user, client_ip
from app.routers.progress import level_from_xp

router = APIRouter(prefix="/api/admin", tags=["Admin"])

async def _require_admin(db: AsyncSession, current_user_id: uuid.UUID) -> User:
    user = await db.get(User, current_user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    if not is_admin_user(user):
        raise HTTPException(status_code=403, detail="Acesso restrito à administração.")
    return user

@router.get("/check")
async def check_admin(
    current_user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Informa se o usuário logado é admin (sem expor dados)."""
    user = await db.get(User, current_user_id)
    return {"is_admin": is_admin_user(user)}

@router.get("/my-ip")
async def my_ip(
    request: Request,
    current_user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Retorna o IP atual do admin logado (para banir sem digitar manualmente)."""
    await _require_admin(db, current_user_id)
    return {"ip": client_ip(request)}

@router.get("/users")
async def list_users(
    current_user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    await _require_admin(db, current_user_id)

    ach_rows = (await db.execute(
        select(Achievement.user_id, sa_func.count(Achievement.id)).group_by(Achievement.user_id)
    )).all()
    disc_rows = (await db.execute(
        select(Discovery.user_id, sa_func.count(Discovery.id)).group_by(Discovery.user_id)
    )).all()
    ach_count = {r[0]: r[1] for r in ach_rows}
    disc_count = {r[0]: r[1] for r in disc_rows}

    result = await db.execute(select(User).order_by(User.created_at))
    users = result.scalars().all()

    out = []
    for u in users:
        xp = u.xp or 0
        out.append({
            "id": str(u.id),
            "display_name": u.display_name,
            "country": u.country or "",
            "last_ip": u.last_ip or "",
            "is_banned": bool(u.is_banned),
            "is_admin": is_admin_user(u),
            "xp": xp,
            "level": level_from_xp(xp),
            "achievements_count": ach_count.get(u.id, 0),
            "discoveries_count": disc_count.get(u.id, 0),
            "total_time_seconds": u.total_time_seconds or 0,
            "created_at": u.created_at.isoformat() if u.created_at else None,
            "last_login": u.last_login.isoformat() if u.last_login else None,
        })
    return {"users": out}

class BanAccountRequest(BaseModel):
    user_id: str

@router.post("/ban")
async def ban_account(
    body: BanAccountRequest,
    current_user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Bane uma conta específica (impede login daquela conta)."""
    await _require_admin(db, current_user_id)

    try:
        uid = uuid.UUID(body.user_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="user_id inválido.")

    user = await db.get(User, uid)
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado.")

    if is_admin_user(user):
        raise HTTPException(status_code=400, detail="Não é possível banir outro administrador.")

    user.is_banned = True
    await db.commit()
    return {"status": "banned", "user_id": str(user.id)}

class UnbanAccountRequest(BaseModel):
    user_id: str

@router.post("/unban")
async def unban_account(
    body: UnbanAccountRequest,
    current_user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    await _require_admin(db, current_user_id)

    try:
        uid = uuid.UUID(body.user_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="user_id inválido.")

    user = await db.get(User, uid)
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado.")

    user.is_banned = False
    await db.commit()
    return {"status": "unbanned", "user_id": str(user.id)}

class BanIpRequest(BaseModel):
    ip: str
    reason: str = ""

@router.post("/ip-bans")
async def ban_ip(
    body: BanIpRequest,
    current_user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Bane um IP: ele não poderá criar conta nem logar, mas ainda usa o site anônimo."""
    await _require_admin(db, current_user_id)

    ip = (body.ip or "").strip()
    if not ip:
        raise HTTPException(status_code=400, detail="Informe um IP.")

    existing = await db.execute(select(IpBan).where(IpBan.ip == ip))
    if existing.scalar_one_or_none():
        return {"status": "already_banned"}

    db.add(IpBan(ip=ip, reason=(body.reason or "").strip()[:255] or None))
    await db.commit()
    return {"status": "banned", "ip": ip}

@router.get("/ip-bans")
async def list_ip_bans(
    current_user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    await _require_admin(db, current_user_id)
    result = await db.execute(select(IpBan).order_by(IpBan.banned_at.desc()))
    bans = result.scalars().all()
    return {"ip_bans": [
        {
            "id": str(b.id),
            "ip": b.ip,
            "reason": b.reason or "",
            "banned_at": b.banned_at.isoformat() if b.banned_at else None,
        }
        for b in bans
    ]}

class UnbanIpRequest(BaseModel):
    ip: str

@router.post("/ip-bans/unban")
async def unban_ip(
    body: UnbanIpRequest,
    current_user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    await _require_admin(db, current_user_id)
    ip = (body.ip or "").strip()
    if not ip:
        raise HTTPException(status_code=400, detail="Informe um IP.")

    result = await db.execute(select(IpBan).where(IpBan.ip == ip))
    ban = result.scalar_one_or_none()
    if ban:
        await db.delete(ban)
        await db.commit()
        return {"status": "unbanned", "ip": ip}
    return {"status": "not_found", "ip": ip}