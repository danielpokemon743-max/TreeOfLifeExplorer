import secrets
import uuid
import random
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func as sa_func
from pydantic import BaseModel
from slowapi import Limiter
from slowapi.util import get_remote_address
from app.config import settings as _slowapi_settings
try:
    _limiter = Limiter(key_func=get_remote_address, storage_uri=_slowapi_settings.REDIS_URL if _slowapi_settings.REDIS_URL else "memory://")
except Exception:
    _limiter = Limiter(key_func=get_remote_address)
limiter = _limiter

from app.database import get_db
from app.models import User, Passkey, Discovery, Favorite, Achievement, IpBan, ChatMessage, BanRequest
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
    # Turnstile (quando TURNSTILE_SECRET estiver configurado, este campo é exigido)
    turnstile_token: str | None = None

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

# ─── Rate-limit distribuído via Redis (P1) com fallback em memória ────────────
try:
    from app.redis import redis_client, incr_with_ttl, get_ttl
except Exception:
    redis_client = None
    async def incr_with_ttl(*_a, **_k):  # type: ignore
        return None
    async def get_ttl(*_a, **_k):  # type: ignore
        return 0

async def _check_login_allowed_redis(ip: str) -> int:
    if redis_client is not None:
        try:
            ttl = await get_ttl(f"login:block:{ip}")
            if ttl and ttl > 0:
                return int(ttl)
        except Exception:
            pass
    return _check_login_allowed(ip)

async def _record_failed_login_redis(ip: str) -> None:
    if redis_client is not None:
        try:
            cnt = await incr_with_ttl(f"login:fail:{ip}", _LOGIN_WINDOW_SECONDS)
            if cnt is not None and cnt >= _LOGIN_MAX_ATTEMPTS:
                await redis_client.setex(f"login:block:{ip}", _LOGIN_BLOCK_SECONDS, "1")
                await redis_client.delete(f"login:fail:{ip}")
                return
            if cnt is not None:
                return
        except Exception:
            pass
    _record_failed_login(ip)

async def _record_register_attempt_redis(ip: str) -> bool:
    if redis_client is not None:
        try:
            cnt = await incr_with_ttl(f"register:cnt:{ip}", _REGISTER_WINDOW_SECONDS)
            if cnt is not None:
                return cnt <= _REGISTER_MAX_ATTEMPTS
        except Exception:
            pass
    return _record_register_attempt(ip)

async def _store_webauthn_challenge(session_id: str, challenge: str) -> None:
    try:
        from app.redis import store_challenge
        await store_challenge(session_id, challenge, ttl=300)
    except Exception:
        pass

def _gen_challenge() -> str:
    # base64url sem padding, 32 bytes
    return secrets.token_urlsafe(32)

def _b64url_decode(s: str) -> bytes:
    import base64
    # adiciona padding se necessário
    s = s.strip()
    s += "=" * (-len(s) % 4)
    return base64.urlsafe_b64decode(s.encode())

def _verify_webauthn_client_data(webauthn_response: dict, expected_challenge: str, expected_origin: str, expected_rp_id: str) -> bool:
    """Verifica challenge/origin/type do clientDataJSON (sem verificar assinatura completa).
    Retorna True se parece válido ou se não há dados para verificar (fallback mock)."""
    try:
        if not webauthn_response or not isinstance(webauthn_response, dict):
            return True  # mock fallback
        r = webauthn_response.get("response") or {}
        cjd_b64 = r.get("clientDataJSON")
        if not cjd_b64 or not isinstance(cjd_b64, str):
            return True
        raw = _b64url_decode(cjd_b64).decode("utf-8", errors="ignore")
        import json
        data = json.loads(raw)
        # challenge deve bater
        chal = data.get("challenge") or ""
        # challenge no clientDataJSON é base64url do challenge original
        # nosso expected_challenge já é base64url, então compara direto (com e sem padding)
        def _norm(s: str) -> str:
            return s.rstrip("=")
        if _norm(chal) != _norm(expected_challenge):
            return False
        # origin deve conter expected_origin ou rp_id
        origin = (data.get("origin") or "").lower()
        if expected_origin.lower() not in origin and expected_rp_id.lower() not in origin:
            # permite localhost vs 127.0.0.1
            if "localhost" not in origin and "127.0.0.1" not in origin:
                return False
        typ = data.get("type") or ""
        if typ not in ("webauthn.create", "webauthn.get"):
            return False
        return True
    except Exception:
        return True

async def _verify_turnstile(token: str | None, ip: str) -> bool:
    if not settings.TURNSTILE_SECRET or not token:
        return False
    try:
        import httpx
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.post(
                "https://challenges.cloudflare.com/turnstile/v0/siteverify",
                data={"secret": settings.TURNSTILE_SECRET, "response": token, "remoteip": ip},
            )
            data = resp.json()
            return bool(data.get("success"))
    except Exception:
        return False

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

@router.get("/turnstile-config")
async def turnstile_config():
    """Retorna sitekey do Turnstile se configurado."""
    return {"sitekey": settings.TURNSTILE_SITEKEY or None, "enabled": bool(settings.TURNSTILE_SITEKEY)}

@router.get("/detect-ip")
async def detect_ip(request: Request):
    """Público: retorna o IP que será registrado caso o usuário concorde.

    Usado na tela de cadastro para mostrar ao visitante o IP que será
    armazenado antes de pedir o consentimento.
    """
    return {"ip": client_ip(request)}

@router.post("/register/start")
@limiter.limit("10/minute")
async def register_start(request: Request, body: RegisterStartRequest, db: AsyncSession = Depends(get_db)):
    nick = body.display_name.strip()
    ip = client_ip(request)

    # Anti spam: limites de tentativas por IP também no cadastro (Redis com fallback)
    if not await _record_register_attempt_redis(ip):
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
    challenge = _gen_challenge()
    _pending_register[session_id] = {
        "display_name": nick,
        "password_hash": hash_password(body.password),
        "device_name": body.device_name or "Navegador Web",
        "country": (body.country or "").strip()[:100],
        "ip": ip,
        "challenge": challenge,
    }
    await _store_webauthn_challenge(session_id, challenge)

    return {
        "session_id": session_id,
        "options": {
            "rp": {"name": settings.RP_NAME, "id": _rp_id(request)},
            "user": {
                "id": "dXNlcl8xMjM",
                "name": nick or "usuario",
                "displayName": nick or "Explorador"
            },
            "challenge": challenge,
            "pubKeyCredParams": [{"type": "public-key", "alg": -7}, {"type": "public-key", "alg": -257}],
            "authenticatorSelection": {"residentKey": "preferred", "requireResidentKey": False, "userVerification": "preferred"},
            "extensions": {"credProps": True},
            "timeout": 60000,
            "attestation": "none"
        }
    }

@router.post("/register/finish")
async def register_finish(body: RegisterFinishRequest, request: Request, db: AsyncSession = Depends(get_db)):
    pending = _pending_register.pop(body.session_id, None)
    if not pending:
        raise HTTPException(status_code=400, detail="Sessão de registro expirada ou inválida.")

    # Verifica challenge WebAuthn se houver resposta real
    if body.webauthn_response and pending.get("challenge"):
        if not _verify_webauthn_client_data(body.webauthn_response, pending["challenge"], settings.expected_origin, _rp_id(request)):
            raise HTTPException(status_code=400, detail="Falha na verificação da biometria. Tente novamente.")

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

    # Tenta salvar a credencial real vinda do navegador; fallback para mock
    resp = body.webauthn_response or {}
    cred_id = resp.get("id") or resp.get("rawId") or f"cred_{uuid.uuid4().hex}"
    # normaliza para string
    if not isinstance(cred_id, str):
        cred_id = str(cred_id)
    pub_key = b"mock_public_key"
    transports = []
    try:
        r = resp.get("response") or {}
        att = r.get("attestationObject")
        if att and isinstance(att, str):
            import base64
            b64 = att + "=" * (-len(att) % 4)
            pub_key = base64.urlsafe_b64decode(b64.encode())
        elif resp.get("rawId"):
            pub_key = str(resp.get("rawId")).encode()[:512]
        transports = r.get("transports") or resp.get("transports") or []
        if not isinstance(transports, list):
            transports = []
    except Exception:
        pub_key = b"mock_public_key"

    passkey = Passkey(
        user_id=user.id,
        credential_id=cred_id[:512],
        public_key=pub_key[:2048] if isinstance(pub_key, (bytes, bytearray)) else b"mock_public_key",
        sign_count=0,
        transports=transports[:10],
        device_name=pending["device_name"] or "Navegador Web"
    )
    db.add(passkey)
    await db.commit()

    token = create_access_token(user.id)
    return {"access_token": token, "token_type": "bearer"}

@router.post("/login/start")
@limiter.limit("5/minute")
async def login_start(request: Request, body: LoginStartRequest, db: AsyncSession = Depends(get_db)):
    nick = body.display_name.strip()
    if not nick or not body.password:
        raise HTTPException(status_code=400, detail="Informe o nick e a senha.")

    ip = client_ip(request)

    # Anti brute force: IP com muitas falhas recentes é bloqueado temporariamente (Redis com fallback)
    remaining = await _check_login_allowed_redis(ip)
    if remaining:
        raise HTTPException(
            status_code=429,
            detail=f"Muitas tentativas de login. Tente novamente em {remaining} segundos.",
        )

    # Anti-bot: tenta Turnstile se configurado, com fallback para captcha matemático
    if settings.TURNSTILE_SECRET:
        turnstile_ok = False
        if body.turnstile_token:
            turnstile_ok = await _verify_turnstile(body.turnstile_token, ip)
        if turnstile_ok:
            pass
        else:
            # fallback: tenta captcha matemático se Turnstile não foi resolvido (widget não carregou, localhost, etc.)
            if body.captcha_id and body.captcha_answer is not None:
                if not _consume_captcha(body.captcha_id, body.captcha_answer):
                    raise HTTPException(status_code=400, detail="Captcha inválido e Turnstile não resolvido. Tente novamente.")
            else:
                raise HTTPException(status_code=400, detail="Resolva o Turnstile antes de entrar. Se o widget não apareceu, adicione localhost ao domínio no Cloudflare Dashboard → Turnstile → seu site → Domains, ou aguarde 2s e tente novamente.")
    else:
        if not _consume_captcha(body.captcha_id, body.captcha_answer):
            raise HTTPException(status_code=400, detail="Captcha inválido ou resposta incorreta. Tente novamente.")

    result = await db.execute(select(User).where(sa_func.lower(User.display_name) == nick.lower()))
    user = result.scalar_one_or_none()
    if not user or not user.password_hash or not verify_password(body.password, user.password_hash):
        await _record_failed_login_redis(ip)
        raise HTTPException(status_code=401, detail="Nick ou senha incorretos.")

    # IP banido não pode logar; conta banida também não
    if await is_ip_banned(ip, db):
        raise HTTPException(status_code=403, detail="Este endereço IP está banido do cadastro e login.")
    if user.is_banned:
        raise HTTPException(status_code=403, detail="Esta conta foi banida pela administração.")

    user.last_ip = ip
    session_id = f"sessao_{uuid.uuid4().hex[:12]}"
    challenge = _gen_challenge()
    _pending_login[session_id] = {"user_id": user.id, "challenge": challenge}
    await _store_webauthn_challenge(session_id, challenge)

    # allowCredentials: informa ao navegador quais chaves oferecer (evita "nenhuma chave disponível" genérico)
    passkeys = (await db.execute(select(Passkey).where(Passkey.user_id == user.id))).scalars().all()
    allow_creds = [{"id": p.credential_id, "type": "public-key", "transports": p.transports or ["internal", "hybrid"]} for p in passkeys]

    return {
        "session_id": session_id,
        "options": {
            "challenge": challenge,
            "timeout": 60000,
            "rpId": _rp_id(request),
            "allowCredentials": allow_creds,
            "userVerification": "preferred"
        }
    }

@router.post("/login/finish")
async def login_finish(body: LoginFinishRequest, request: Request, db: AsyncSession = Depends(get_db)):
    pending = _pending_login.pop(body.session_id, None)
    if not pending:
        raise HTTPException(status_code=400, detail="Sessão de login expirada ou inválida.")

    # Verifica challenge se houver resposta WebAuthn
    if body.webauthn_response and pending.get("challenge"):
        if not _verify_webauthn_client_data(body.webauthn_response, pending["challenge"], settings.expected_origin, _rp_id(request)):
            raise HTTPException(status_code=400, detail="Falha na verificação da biometria.")

    user = await db.get(User, pending["user_id"])
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")

    # Passkey deve pertencer ao usuário do nick/senha validados
    result = await db.execute(select(Passkey).where(Passkey.user_id == user.id).limit(1))
    passkey_obj = result.scalar_one_or_none()
    if not passkey_obj:
        raise HTTPException(status_code=404, detail="Nenhum dispositivo cadastrado para esta conta")

    # Se enviou assertion, verifica se o ID corresponde a uma chave do usuário (quando não é mock vazio)
    if body.webauthn_response and isinstance(body.webauthn_response, dict) and body.webauthn_response.get("id"):
        cred_id = str(body.webauthn_response.get("id"))
        has = any(p.credential_id == cred_id for p in (await db.execute(select(Passkey).where(Passkey.user_id == user.id))).scalars().all())
        # Se enviou ID e não bate com nenhuma chave, mas é o mesmo device mock, permite fallback para senha
        # (não bloqueia login por senha)
        if not has:
            pass

    user.last_login = datetime.now(timezone.utc)
    await db.commit()

    token = create_access_token(user.id)
    return {"access_token": token, "token_type": "bearer"}

@router.post("/passkeys/add/start")
async def add_passkey_start(body: PasskeyAddStartRequest, request: Request, current_user_id: uuid.UUID = Depends(get_current_user_id)):
    session_id = f"sessao_{uuid.uuid4().hex[:12]}"
    challenge = _gen_challenge()
    await _store_webauthn_challenge(session_id, challenge)
    return {
        "session_id": session_id,
        "options": {
            "challenge": challenge,
            "rp": {"name": settings.RP_NAME, "id": _rp_id(request)},
            "user": {"id": "dXNlcl8xMjM", "name": "usuario", "displayName": "Explorador"},
            "pubKeyCredParams": [{"type": "public-key", "alg": -7}, {"type": "public-key", "alg": -257}],
            "authenticatorSelection": {"residentKey": "preferred", "requireResidentKey": False, "userVerification": "preferred"},
            "extensions": {"credProps": True},
            "timeout": 60000,
            "attestation": "none"
        }
    }

@router.post("/passkeys/add/finish")
async def add_passkey_finish(body: PasskeyAddFinishRequest, db: AsyncSession = Depends(get_db), current_user_id: uuid.UUID = Depends(get_current_user_id)):
    resp = body.webauthn_response or {}
    cred_id = resp.get("id") or resp.get("rawId") or f"cred_{uuid.uuid4().hex}"
    if not isinstance(cred_id, str):
        cred_id = str(cred_id)
    pub_key = b"mock_public_key"
    transports = []
    try:
        r = resp.get("response") or {}
        att = r.get("attestationObject")
        if att and isinstance(att, str):
            import base64
            b64 = att + "=" * (-len(att) % 4)
            pub_key = base64.urlsafe_b64decode(b64.encode())
        elif resp.get("rawId"):
            pub_key = str(resp.get("rawId")).encode()[:512]
        transports = r.get("transports") or resp.get("transports") or []
        if not isinstance(transports, list):
            transports = []
    except Exception:
        pub_key = b"mock_public_key"
    passkey_obj = Passkey(
        user_id=current_user_id,
        credential_id=cred_id[:512],
        public_key=pub_key[:2048] if isinstance(pub_key, (bytes, bytearray)) else b"mock_public_key",
        sign_count=0,
        transports=transports[:10],
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

@router.get("/export")
async def export_data(current_user_id: uuid.UUID = Depends(get_current_user_id), db: AsyncSession = Depends(get_db)):
    """LGPD - Portabilidade: retorna todos os dados do titular em JSON."""
    user = await db.get(User, current_user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    discs = (await db.execute(select(Discovery).where(Discovery.user_id == current_user_id))).scalars().all()
    favs = (await db.execute(select(Favorite).where(Favorite.user_id == current_user_id))).scalars().all()
    achs = (await db.execute(select(Achievement).where(Achievement.user_id == current_user_id))).scalars().all()
    msgs = (await db.execute(select(ChatMessage).where(ChatMessage.user_id == current_user_id).order_by(ChatMessage.created_at.desc()).limit(500))).scalars().all()
    bans = (await db.execute(select(BanRequest).where(BanRequest.target_user_id == current_user_id))).scalars().all()
    return {
        "user": {
            "id": str(user.id),
            "display_name": user.display_name,
            "country": user.country,
            "created_at": user.created_at.isoformat() if user.created_at else None,
            "last_login": user.last_login.isoformat() if user.last_login else None,
            "last_ip": user.last_ip,
            "is_banned": bool(user.is_banned),
            "xp": user.xp,
            "total_time_seconds": user.total_time_seconds,
        },
        "passkeys": [{"device_name": p.device_name, "created_at": p.created_at.isoformat()} for p in (await db.execute(select(Passkey).where(Passkey.user_id == current_user_id))).scalars().all()],
        "discoveries": [{"species_id": d.species_id, "kingdom": d.kingdom, "discovered_at": d.discovered_at.isoformat()} for d in discs],
        "favorites": [{"item_type": f.item_type, "item_id": f.item_id, "created_at": f.created_at.isoformat()} for f in favs],
        "achievements": [{"code": a.code, "unlocked_at": a.unlocked_at.isoformat()} for a in achs],
        "chat_messages": [{"channel": m.channel, "content": m.content, "created_at": m.created_at.isoformat()} for m in msgs],
        "ban_requests": [{"id": str(b.id), "reason": b.reason, "status": b.status, "created_at": b.created_at.isoformat()} for b in bans],
    }

@router.delete("/me")
async def delete_me(request: Request, current_user_id: uuid.UUID = Depends(get_current_user_id), db: AsyncSession = Depends(get_db), credentials: HTTPAuthorizationCredentials | None = Depends(security)):
    """LGPD - Direito ao esquecimento: apaga a conta e todos os dados vinculados."""
    user = await db.get(User, current_user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    # Revoga o token atual
    if credentials is not None:
        try:
            revoke_token(credentials.credentials)
        except Exception:
            pass
    # Cascade delete-orphan cuida de passkeys, achievements, favorites, discoveries, settings, chat_messages
    await db.delete(user)
    await db.commit()
    return {"status": "deleted"}

@router.post("/logout")
async def logout(credentials: HTTPAuthorizationCredentials | None = Depends(security)):
    if credentials is not None:
        try:
            revoke_token(credentials.credentials)
        except Exception:
            pass
    return {"status": "logged_out"}
