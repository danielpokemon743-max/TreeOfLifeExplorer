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

# Palavras bloqueadas em nomes inapropriados (comparadas de forma normalizada:
# sem acentos e tudo minúsculo).

# Termos fortes/inequívocos: bloqueiam por SUBSTRING (pegam "xputax", "putaria",
# "estuprador", variações compostas etc.).
BANNED_WORDS_SUBSTRING = [
    # Português
    "puta", "puto", "porra", "caralho", "foda", "foder", "merda", "bosta",
    "cagar", "cacete", "piroca", "buceta", "xota", "arrombado", "arrombada",
    "viado", "bixa", "pederasta", "escroto", "idiota", "macaco", "negrada",
    "crioulo", "nazista", "hitler", "nazi",
    # Composições
    "filhodaputa", "filha da puta", "fdp", "ku klux", "kllux", "kkk",
    "vai tomar no cu", "vtnc", "ptnc", "pqp", "tnc", "sequestr", "trafica",
    "genocida", "pedofil", "estuprad", "suicid",
    # Inglês (comuns em usernames)
    "fuck", "fucking", "shit", "bitch", "dick", "cock", "pussy", "asshole",
    "nigger", "faggot", "retard", "rape", "rapist", "murder",
]

# Palavras curtas/ambíguas: só bloqueiam como palavra INTEIRA, para não barrar
# nomes legítimos como "paulo", "cubo", "sexy".
BANNED_WORDS_BOUNDARY = [
    "pau", "cu", "rola", "sex", "sexual", "kill",
]

MAX_NICK_LENGTH = 20

def _blocked_token_regex() -> object:
    """Compila a regex de borda de palavra uma única vez (cache)."""
    import re
    if not hasattr(_blocked_token_regex, "_cache"):
        _blocked_token_regex._cache = re.compile(
            r"(?:^|[^a-z0-9])(" + "|".join(re.escape(w) for w in BANNED_WORDS_BOUNDARY) + r")(?:$|[^a-z0-9])"
        )
    return _blocked_token_regex._cache

def _normalize(text: str) -> str:
    """Remove acentos e coloca tudo em minúsculas para comparação."""
    text = unicodedata.normalize("NFKD", text)
    text = "".join(c for c in text if not unicodedata.combining(c))
    return text.lower()

def nickname_is_inappropriate(nick: str) -> bool:
    """Retorna True se o nick contém termos impróprios."""
    normalized = _normalize(nick or "")
    if not normalized:
        return False
    # 1) Termos fortes por substring (pega "xputax", "putaria" etc.)
    if any(w in normalized for w in BANNED_WORDS_SUBSTRING):
        return True
    # 2) Palavras curtas/ambíguas apenas como palavra inteira
    if _blocked_token_regex().search(normalized):
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
