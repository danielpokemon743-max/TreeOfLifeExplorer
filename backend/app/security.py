import uuid
import unicodedata
import bcrypt
from datetime import datetime, timedelta, timezone
from jose import JWTError, jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.config import settings

SECRET_KEY = settings.JWT_SECRET
ALGORITHM = settings.JWT_ALGORITHM
ACCESS_TOKEN_EXPIRE_DAYS = settings.JWT_EXPIRE_DAYS

security = HTTPBearer(auto_error=False)

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

def verify_password(password: str, password_hash: str) -> bool:
    if not password_hash:
        return False
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except ValueError:
        return False

# Palavras bloqueadas em nomes inapropriados (comparadas de forma normalizada)
BANNED_WORDS = [
    # Português
    "puta", "puto", "porra", "caralho", "foda", "foder", "merda", "bosta",
    "cagar", "cacete", "pau", "piroca", "buceta", "xota", "cu", "rola",
    "filhodaputa", "filhodaputa", "arrombado", "viado", "bixa", "pederasta",
    "escroto", "idiota", "burro", "macaco", "negrada", "preta", "crioulo",
    "nazista", "hitler", "ku klux", "kllux",
    # Inglês (comuns em usernames)
    "fuck", "fucking", "shit", "bitch", "dick", "cock", "pussy", "asshole",
    "nigger", "faggot", "retard", "rape", "rapist", "kill", "murder",
    "hitler", "nazi", "sex", "sexual",
]

def _normalize(text: str) -> str:
    """Remove acentos e coloca tudo em minúsculas para comparação."""
    text = unicodedata.normalize("NFKD", text)
    text = "".join(c for c in text if not unicodedata.combining(c))
    return text.lower()

def nickname_is_inappropriate(nick: str) -> bool:
    """Retorna True se o nick contém termos impróprios."""
    normalized = _normalize(nick or "")
    for word in BANNED_WORDS:
        # evita bloqueio de palavras curtas/parciais (ex.: "pau" dentro de "paulo")
        if word in normalized:
            return True
    return False

def create_access_token(user_id: uuid.UUID) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=ACCESS_TOKEN_EXPIRE_DAYS)
    to_encode = {"sub": str(user_id), "exp": expire}
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def verify_token(token: str) -> uuid.UUID | None:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        if user_id is None:
            return None
        return uuid.UUID(user_id)
    except (JWTError, ValueError):
        return None

async def get_current_user_id(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
) -> uuid.UUID:
    if credentials is None:
        raise HTTPException(status_code=401, detail="Não autenticado")
    user_id = verify_token(credentials.credentials)
    if user_id is None:
        raise HTTPException(status_code=401, detail="Token inválido")
    return user_id
