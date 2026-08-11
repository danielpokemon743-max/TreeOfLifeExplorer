import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func as sa_func
from pydantic import BaseModel

from app.database import get_db
from app.models import User, Passkey, Discovery, Favorite, Achievement, IpBan
from app.config import settings
from app.security import (
    create_access_token,
    get_current_user_id,
    hash_password,
    verify_password,
    nickname_is_inappropriate,
)

router = APIRouter(prefix="/api/auth", tags=["Auth"])

def client_ip(request: Request) -> str:
    """IP real do cliente, respeitando X-Forwarded-For (proxy do Render)."""
    fwd = request.headers.get("x-forwarded-for", "")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"

async def is_ip_banned(ip: str, db: AsyncSession) -> bool:
    if not ip or ip == "unknown":
        return False
    return await db.scalar(select(IpBan).where(IpBan.ip == ip)) is not None

def is_admin_user(user) -> bool:
    """É admin se marcado no banco OU listado em ADMIN_NICKS (env)."""
    if not user:
        return False
    return bool(user.is_admin) or user.display_name in settings.admin_nicks

class RegisterStartRequest(BaseModel):
    display_name: str
    password: str
    device_name: str
    country: str = ""

class RegisterFinishRequest(BaseModel):
    session_id: str
    display_name: str
    device_name: str
    webauthn_response: dict

class LoginStartRequest(BaseModel):
    display_name: str
    password: str

class LoginFinishRequest(BaseModel):
    session_id: str
    webauthn_response: dict

class PasskeyAddStartRequest(BaseModel):
    device_name: str

class PasskeyAddFinishRequest(BaseModel):
    session_id: str
    display_name: str = ""
    device_name: str
    webauthn_response: dict

# Guarda temporariamente o usuário identificado no "start" para o "finish" encontrar
# a conta correta (como o WebAuthn aqui é simulado, guardamos o user_id por sessão).
_pending_register = {}
_pending_login = {}

def _rp_id(request: Request) -> str:
    """RP ID WebAuthn = domínio que o navegador REALMENTE está usando (sem porta).

    Deriva do header Host da requisição para bater com o domínio da página,
    em vez de depender da env PUBLIC_URL (que pode ficar desatualizada).
    """
    host = request.headers.get("host", "").strip().lower()
    host = host.split(":")[0]  # remove porta
    return host or settings.rp_id

@router.post("/register/start")
async def register_start(body: RegisterStartRequest, request: Request, db: AsyncSession = Depends(get_db)):
    nick = body.display_name.strip()

    # 1. Filtro de apelidos impróprios
    if nickname_is_inappropriate(nick):
        raise HTTPException(status_code=400, detail="Este apelido não é permitido.")

    if not body.password:
        raise HTTPException(status_code=400, detail="Você precisa definir uma senha.")

    # IP banido não pode criar conta (mas pode usar o site sem logar)
    ip = client_ip(request)
    if await is_ip_banned(ip, db):
        raise HTTPException(status_code=403, detail="Este endereço IP está banido do cadastro e login.")

    session_id = f"sessao_{uuid.uuid4().hex[:12]}"
    _pending_register[session_id] = {
        "display_name": nick,
        "password_hash": hash_password(body.password),
        "device_name": body.device_name or "Navegador Web",
        "country": (body.country or "").strip()[:100],
        "ip": ip,
    }

    return {
        "session_id": session_id,
        "options": {
            "rp": {"name": settings.RP_NAME, "id": _rp_id(request)},
            "user": {
                "id": "dXNlcl8xMjM",
                "name": nick or "usuario",
                "displayName": nick or "Explorador"
            },
            "challenge": "dGVzdGVfY2hhbGxlbmdlXzEyMw",
            "pubKeyCredParams": [{"type": "public-key", "alg": -7}],
            "timeout": 60000,
            "attestation": "none"
        }
    }

@router.post("/register/finish")
async def register_finish(body: RegisterFinishRequest, db: AsyncSession = Depends(get_db)):
    pending = _pending_register.pop(body.session_id, None)
    if not pending:
        raise HTTPException(status_code=400, detail="Sessão de registro expirada ou inválida.")

    nick = pending["display_name"]

    # Unicidade do nick (duas pessoas não podem ter o mesmo nome)
    existing = await db.execute(select(User).where(User.display_name == nick))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Este nome de usuário já está em uso.")

    user = User(
        display_name=nick,
        password_hash=pending["password_hash"],
        last_login=datetime.now(timezone.utc),
        country=pending.get("country") or None,
        last_ip=pending.get("ip") or None,
    )
    db.add(user)
    await db.flush()

    passkey = Passkey(
        user_id=user.id,
        credential_id=f"cred_{uuid.uuid4().hex}",
        public_key=b"mock_public_key",
        sign_count=0,
        transports=[],
        device_name=pending["device_name"] or "Navegador Web"
    )
    db.add(passkey)
    await db.commit()

    token = create_access_token(user.id)
    return {"access_token": token, "token_type": "bearer"}

@router.post("/login/start")
async def login_start(body: LoginStartRequest, request: Request, db: AsyncSession = Depends(get_db)):
    nick = body.display_name.strip()
    if not nick or not body.password:
        raise HTTPException(status_code=400, detail="Informe o nick e a senha.")

    result = await db.execute(select(User).where(User.display_name == nick))
    user = result.scalar_one_or_none()
    if not user or not user.password_hash or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Nick ou senha incorretos.")

    # IP banido não pode logar; conta banida também não
    ip = client_ip(request)
    if await is_ip_banned(ip, db):
        raise HTTPException(status_code=403, detail="Este endereço IP está banido do cadastro e login.")
    if user.is_banned:
        raise HTTPException(status_code=403, detail="Esta conta foi banida pela administração.")

    user.last_ip = ip
    session_id = f"sessao_{uuid.uuid4().hex[:12]}"
    _pending_login[session_id] = {"user_id": user.id}

    return {
        "session_id": session_id,
        "options": {
            "challenge": "dGVzdGVfY2hhbGxlbmdlX2xvZ2lu",
            "timeout": 60000,
            "rpId": _rp_id(request)
        }
    }

@router.post("/login/finish")
async def login_finish(body: LoginFinishRequest, db: AsyncSession = Depends(get_db)):
    pending = _pending_login.pop(body.session_id, None)
    if not pending:
        raise HTTPException(status_code=400, detail="Sessão de login expirada ou inválida.")

    user = await db.get(User, pending["user_id"])
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")

    # Passkey deve pertencer ao usuário do nick/senha validados
    result = await db.execute(select(Passkey).where(Passkey.user_id == user.id).limit(1))
    passkey_obj = result.scalar_one_or_none()
    if not passkey_obj:
        raise HTTPException(status_code=404, detail="Nenhum dispositivo cadastrado para esta conta")

    user.last_login = datetime.now(timezone.utc)
    await db.commit()

    token = create_access_token(user.id)
    return {"access_token": token, "token_type": "bearer"}

@router.post("/passkeys/add/start")
async def add_passkey_start(body: PasskeyAddStartRequest, request: Request, current_user_id: uuid.UUID = Depends(get_current_user_id)):
    return {
        "session_id": f"sessao_{uuid.uuid4().hex[:12]}",
        "options": {
            "challenge": "dGVzdGVfY2hhbGxlbmdlX2FkZA",
            "rp": {"name": settings.RP_NAME, "id": _rp_id(request)},
            "user": {"id": "dXNlcl8xMjM", "name": "usuario", "displayName": "Explorador"},
            "pubKeyCredParams": [{"type": "public-key", "alg": -7}],
            "timeout": 60000
        }
    }

@router.post("/passkeys/add/finish")
async def add_passkey_finish(body: PasskeyAddFinishRequest, db: AsyncSession = Depends(get_db), current_user_id: uuid.UUID = Depends(get_current_user_id)):
    passkey_obj = Passkey(
        user_id=current_user_id,
        credential_id=f"cred_{uuid.uuid4().hex}",
        public_key=b"mock_public_key",
        sign_count=0,
        transports=[],
        device_name=body.device_name or "Novo Dispositivo"
    )
    db.add(passkey_obj)
    await db.commit()
    return {"status": "success", "message": "Dispositivo adicionado"}

@router.get("/me")
async def get_me(current_user_id: uuid.UUID = Depends(get_current_user_id), db: AsyncSession = Depends(get_db)):
    user = await db.get(User, current_user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")

    disc_count = await db.scalar(select(sa_func.count()).select_from(Discovery).where(Discovery.user_id == current_user_id))
    fav_count = await db.scalar(select(sa_func.count()).select_from(Favorite).where(Favorite.user_id == current_user_id))
    ach_count = await db.scalar(select(sa_func.count()).select_from(Achievement).where(Achievement.user_id == current_user_id))

    passkeys_result = await db.execute(
        select(Passkey).where(Passkey.user_id == current_user_id)
    )
    passkeys_list = [{"device_name": p.device_name, "created_at": p.created_at.isoformat()} for p in passkeys_result.scalars().all()]

    return {
        "display_name": user.display_name,
        "last_login": user.last_login.isoformat() if user.last_login else None,
        "discoveries_count": disc_count or 0,
        "favorites_count": fav_count or 0,
        "achievements_count": ach_count or 0,
        "passkeys": passkeys_list,
        "country": user.country,
        "is_admin": is_admin_user(user),
        "is_banned": bool(user.is_banned),
    }

@router.post("/logout")
async def logout():
    return {"status": "logged_out"}
