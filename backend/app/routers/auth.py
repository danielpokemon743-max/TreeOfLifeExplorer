import uuid
import random
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func as sa_func
from pydantic import BaseModel

from app.database import get_db
from app.models import User, Passkey, Discovery, Favorite, Achievement, IpBan
from app.config import settings
from fastapi.security import HTTPAuthorizationCredentials

from app.security import (
    create_access_token,
    get_current_user_id,
    hash_password,
    revoke_token,
    security,
    verify_password,
    nickname_is_inappropriate,
    MAX_NICK_LENGTH,
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
    # Consentimento para registrar o IP do usuário no cadastro.
    # Sem ele, a conta não pode ser criada (usuário pode jogar como visitante).
    ip_consent: bool = False

class RegisterFinishRequest(BaseModel):
    session_id: str
    display_name: str
    device_name: str
    webauthn_response: dict

class LoginStartRequest(BaseModel):
    display_name: str
    password: str
    # Captcha anti-bot (obrigatório a partir de agora)
    captcha_id: str = ""
    captcha_answer: int | None = None

class LoginFinishRequest(BaseModel):
    session_id: str
    # O passkey aqui é opcional: aparelhos sem a chave de acesso (ex.: criar a conta
    # no desktop e logar no celular) continuam via nick+senha, já validados no start.
    webauthn_response: dict = {}

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

# ─── PROTEÇÃO ANTI BRUTE FORCE (em memória; servidor roda com 1 worker) ──────
import time as _time
from collections import defaultdict, deque

# janela de tentativas por IP, cooldown após excesso de falhas
_LOGIN_WINDOW_SECONDS = 600      # 10 minutos
_LOGIN_MAX_ATTEMPTS = 6          # máximo de falhas por janela
_LOGIN_BLOCK_SECONDS = 900       # bloqueado por 15 minutos
_REGISTER_WINDOW_SECONDS = 600
_REGISTER_MAX_ATTEMPTS = 20      # criações de conta por janela (anti-spam)

# histórico: ip -> deque de (timestamp, sucesso)
_failed_attempts: dict[str, deque] = defaultdict(deque)
_ip_blocked_until: dict[str, float] = {}
_register_counts: dict[str, deque] = defaultdict(deque)

def _prune_window(history: deque, window: int) -> None:
    cutoff = _time.time() - window
    while history and history[0] < cutoff:
        history.popleft()

def _ip_is_blocked(ip: str) -> bool:
    blocked_until = _ip_blocked_until.get(ip, 0)
    if blocked_until > _time.time():
        return True
    if blocked_until:
        _ip_blocked_until.pop(ip, None)
    return False

def _record_failed_login(ip: str) -> None:
    now = _time.time()
    _failed_attempts[ip].append(now)
    _prune_window(_failed_attempts[ip], _LOGIN_WINDOW_SECONDS)
    if len(_failed_attempts[ip]) >= _LOGIN_MAX_ATTEMPTS:
        _ip_blocked_until[ip] = now + _LOGIN_BLOCK_SECONDS
        _failed_attempts[ip].clear()

def _check_login_allowed(ip: str) -> float:
    """Retorna segundos restantes de bloqueio (0 = permite)."""
    if _ip_is_blocked(ip):
        return max(1, int(_ip_blocked_until.get(ip, 0) - _time.time()))
    return 0

def _record_register_attempt(ip: str) -> bool:
    now = _time.time()
    _register_counts[ip].append(now)
    _prune_window(_register_counts[ip], _REGISTER_WINDOW_SECONDS)
    return len(_register_counts[ip]) <= _REGISTER_MAX_ATTEMPTS

# ─── CAPTCHA MATEMÁTICO (anti-bot; em memória, 1 worker) ─────────────────────
_captcha_tokens: dict[str, tuple[float, int]] = {}   # token -> (timestamp_criacao, resposta_certa)
_CAPTCHA_TTL_SECONDS = 300                            # resposta válida por 5 minutos

def _generate_captcha() -> tuple[str, str]:
    """Gera uma conta simples, guarda a resposta esperada e devolve (token, pergunta)."""
    a = random.randint(2, 9)
    b = random.randint(1, 9)
    op = random.choice(["+", "-", "x"])
    if op == "+":
        answer = a + b
    elif op == "-":
        a, b = max(a, b), min(a, b)
        answer = a - b
    else:
        answer = a * b
    token = f"cap_{uuid.uuid4().hex[:12]}"
    now = _time.time()
    # limpa tokens expirados para não crescer sem limite
    expired = [k for k, (ts, _ans) in _captcha_tokens.items() if now - ts > _CAPTCHA_TTL_SECONDS]
    for k in expired:
        _captcha_tokens.pop(k, None)
    _captcha_tokens[token] = (now, answer)
    return token, f"Quanto é {a} {op} {b}?"

def _consume_captcha(token: str | None, answer: int | None) -> bool:
    """Consome um token de captcha (usado uma única vez); True se a resposta confere."""
    if not token:
        return False
    entry = _captcha_tokens.pop(token, None)
    if entry is None:
        return False
    _created, correct = entry
    return answer is not None and int(answer) == correct

def _rp_id(request: Request) -> str:
    """RP ID WebAuthn = domínio que o navegador REALMENTE está usando (sem porta).

    Deriva do header Host da requisição para bater com o domínio da página,
    em vez de depender da env PUBLIC_URL (que pode ficar desatualizada).
    """
    host = request.headers.get("host", "").strip().lower()
    host = host.split(":")[0]  # remove porta
    return host or settings.rp_id

@router.get("/captcha")
async def new_captcha():
    """Público: gera um captcha matemático (token + pergunta)."""
    token, question = _generate_captcha()
    return {"captcha_id": token, "question": question}

@router.get("/detect-ip")
async def detect_ip(request: Request):
    """Público: retorna o IP que será registrado caso o usuário concorde.

    Usado na tela de cadastro para mostrar ao visitante o IP que será
    armazenado antes de pedir o consentimento.
    """
    return {"ip": client_ip(request)}

@router.post("/register/start")
async def register_start(body: RegisterStartRequest, request: Request, db: AsyncSession = Depends(get_db)):
    nick = body.display_name.strip()
    ip = client_ip(request)

    # Anti spam: limites de tentativas por IP também no cadastro
    if not _record_register_attempt(ip):
        raise HTTPException(status_code=429, detail="Muitas tentativas de cadastro. Aguarde alguns minutos.")

    # 1. Tamanho máximo do apelido
    if len(nick) > MAX_NICK_LENGTH:
        raise HTTPException(status_code=400, detail=f"O apelido pode ter no máximo {MAX_NICK_LENGTH} caracteres.")
    nick = nick[:MAX_NICK_LENGTH]

    # 2. Filtro de apelidos impróprios
    if nickname_is_inappropriate(nick):
        raise HTTPException(status_code=400, detail="Este apelido não é permitido.")

    if not body.password:
        raise HTTPException(status_code=400, detail="Você precisa definir uma senha.")

    # Consentimento explícito para capturar e armazenar o IP do usuário.
    # Se negado, não é possível criar conta (apenas jogar sem conta).
    if not body.ip_consent:
        raise HTTPException(
            status_code=403,
            detail="Para criar uma conta você precisa autorizar o registro do seu endereço IP. Sem isso, você pode usar o site como visitante.",
        )

    # IP banido não pode criar conta (mas pode usar o site sem logar)
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

    # Unicidade do nick (sem diferenciar maiúsculas: "Nutellinha" == "nutellinha")
    existing = await db.execute(select(User).where(sa_func.lower(User.display_name) == nick.lower()))
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

    ip = client_ip(request)

    # Anti brute force: IP com muitas falhas recentes é bloqueado temporariamente
    remaining = _check_login_allowed(ip)
    if remaining:
        raise HTTPException(
            status_code=429,
            detail=f"Muitas tentativas de login. Tente novamente em {remaining} segundos.",
        )

    # Captcha anti-bot: resposta errada/vazia = recusa (sem revelar se a senha existe)
    if not _consume_captcha(body.captcha_id, body.captcha_answer):
        raise HTTPException(status_code=400, detail="Captcha inválido ou resposta incorreta. Tente novamente.")

    result = await db.execute(select(User).where(sa_func.lower(User.display_name) == nick.lower()))
    user = result.scalar_one_or_none()
    if not user or not user.password_hash or not verify_password(body.password, user.password_hash):
        _record_failed_login(ip)
        raise HTTPException(status_code=401, detail="Nick ou senha incorretos.")

    # IP banido não pode logar; conta banida também não
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
async def get_me(request: Request, current_user_id: uuid.UUID = Depends(get_current_user_id), db: AsyncSession = Depends(get_db)):
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

    # Estado de banimento (conta OU IP atual) — usado pelo frontend para
    # deslogar automaticamente quem foi banido.
    ip_banned = await is_ip_banned(client_ip(request), db)
    banned = bool(user.is_banned) or ip_banned
    ban_detail = None
    if user.is_banned:
        ban_detail = "Sua conta foi banida pela administração."
    elif ip_banned:
        ban_detail = "Seu endereço de IP foi banido pela administração."

    return {
        "id": str(user.id),
        "display_name": user.display_name,
        "last_login": user.last_login.isoformat() if user.last_login else None,
        "discoveries_count": disc_count or 0,
        "favorites_count": fav_count or 0,
        "achievements_count": ach_count or 0,
        "passkeys": passkeys_list,
        "country": user.country,
        "is_admin": is_admin_user(user),
        "is_banned": bool(user.is_banned),
        "ip_banned": ip_banned,
        "banned": banned,
        "banned_detail": ban_detail,
    }

@router.post("/logout")
async def logout(credentials: HTTPAuthorizationCredentials | None = Depends(security)):
    if credentials is not None:
        try:
            revoke_token(credentials.credentials)
        except Exception:
            pass
    return {"status": "logged_out"}
