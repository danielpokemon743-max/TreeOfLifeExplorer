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
    # Português — xingamentos/insultos
    "puta", "puto", "putaria", "porra", "caralho", "carai", "caraio", "foda",
    "foder", "fude", "fudid", "merda", "bosta", "bost", "cagar", "cagad",
    "cagao", "cagona", "cacete", "cacet", "piroca", "buceta", "bucetinha",
    "xota", "xoxota", "xereca", "pepeca", "ppk", "bilola", "piru", "punheta",
    "arrombado", "arrombada", "arromb", "viado", "viadao", "viadagem", "viadinh",
    "bixa", "bicha", "bichas", "pederasta", "escroto", "escrot", "idiota",
    "imbecil", "imbeci", "otario", "otaria", "burro", "burra", "estupid",
    "cretino", "cretin", "ignorant", "babaca", "babaquinha", "canalha",
    "palhac", "trouxa", "pilantra", "semvergonha", "sem-vergonha", "safado",
    "safada", "vagabund", "prostitut", "maconheir",
    "cracud", "desgrac", "fedid", "fedorent", "nojento", "nojenta",
    "nojent", "asqueros", "cachaceir", "bocarra", "corno", "cornudo", "chifrud",
    "maluq", "maluco", "maluca", "maluquinho", "verme", "escoria", "lixo humano",
    "monstro", "aberrac", "aleijad", "mongol", "mongoloide",
    # Português — ofensas a grupos/ódio
    "nazista", "nazi", "hitler", "holoca", "racist", "racismo", "racista",
    "homofob", "xenofob", "fascist", "fascis", "supremac", "skinhead",
    "whitepower", "white power", "ku klux", "kllux", "kuklux", "negrada",
    "crioulo", "criola", "macaco", "macaca", "favelad", "favelada", "cafezin",
    "preto vagabundo",
    # Português — crimes/sexual
    "estuprad", "estuprador", "estupro", "pedofil", "pedofilo", "genocid",
    "genocida", "sequestr", "sequestro", "sequestrad", "trafica", "trafico",
    "trafi", "traficant", "traficante", "suicid", "suicida", "tortur", "tortura",
    "terror", "terrorist", "explorac", "assassin", "assassino", "esfaque",
    "decepa", "carboniz", "machad", "20comer70correr", "six seven", "6seven",
    # Português — siglas e abreviações
    "fdp", "vtnc", "ptnc", "pqp", "tnc", "vsf", "vdm", "krl", "krlh", "kct",
    "kcth", "crl", "crlh", "tung", "sahur", "tungtungsahur",
    "vai tomar no cu",
    # Composições e variações leetspeak (p0rra, c4r4lh0, f4ck etc.)
    "filhodaputa", "filha da puta", "filhodeuma",
    "p0rra", "p0rr4", "p0r4", "c4r4lh0", "caralh0", "c4ralho", "m3rd4",
    "m3rda", "m3rd", "b0st4", "b0sta", "f0d4", "f0da", "f0der", "f0d3r",
    "f0dida", "f4ck", "fvck", "fuk", "fuq", "phuck", "fuxk", "fck",
    "5hit", "sh1t", "sh17", "b1tch", "b1ch", "d1ck", "d1k", "c0ck", "c0k",
    "p4ssy", "puss1", "a55hole", "a55 hol", "n1gger", "n1gg3r", "nigg4",
    "f4ggot", "r4pe", "r4p1st", "naz1", "wh0re", "cun7", "cu7",
    "cuzao", "cuzona", "cuzinho", "cuzin", "vcq", "sua mae",
    # Inglês — xingamentos
    "fuck", "fucking", "fucker", "motherfuck", "shit", "shite", "bitch",
    "bastard", "bollocks", "dick", "dickhead", "cock", "cocksuck", "pussy",
    "asshole", "arsehole", "nigger", "nigga", "faggot", "fagot",
    "retard", "retarted", "rape", "rapist", "murder", "slut", "whore", "twat",
    "wanker", "wank", "prick", "suck my", "eat shit", "cunt",
    "pervert", "perv", "bimbo", "douche", "loser", "moron", "stupid",
    "idiot", "tranny", "tramry", "kkk",
]

# Palavras curtas/ambíguas: só bloqueiam como palavra INTEIRA, para não barrar
# nomes legítimos como "paulo", "cubo", "sexy".
BANNED_WORDS_BOUNDARY = [
    "pau", "cu", "rola", "sex", "sexual", "sexo", "kill", "sixseven", "penis",
    "kkk", "k3k", "tungtungsahur", "ass", "fag", "fds", "cuz", "cuzin", "pus",
    "piss", "fck", "fuk", "fuq", "c0ck", "prrrr",
]

# ─── Bloqueio de links no chat ──────────────────────────────────────────────
# TLDs (domínio.extensão) usados para pegar URLs "peladas" (sem http://),
# ex.: "youtube.com/watch", "site.com.br", "bit.ly/abc".
_LINK_TLDS = frozenset(
    "com net org info biz io co gg xyz tv me cc mobi tel name pro top xin vip "
    "club site online store shop blog tech app dev link click live fun fans "
    "money loan work cool email cloud world group space digital website "
    "solutions ad ae af ag ai al am an ao aq ar as at au aw ax az ba bb bd be "
    "bf bg bh bi bj bl bm bn bo bq br bs bt bv bw by bz ca cd cf cg ch ci ck "
    "cl cm cn cr cu cv cw cx cy cz de dj dk dm do dz ec ee eg eh er es et eu "
    "fi fj fk fm fo fr ga gb gd ge gf gg gh gi gl gm gn gp gq gr gs gt gu gw "
    "gy hk hm hn hr ht hu id ie il im in io iq ir is it je jm jo jp ke kg kh "
    "ki km kn kp kr kw ky kz la lb lc li lk lr ls lt lu lv ly ma mc md me mf "
    "mg mh mk ml mm mn mo mp mq mr ms mt mu mv mw mx my mz na nc ne nf ng ni "
    "nl no np nr nu nz om pa pe pf pg ph pk pl pm pn pr ps pt pw py qa re ro "
    "rs ru rw sa sb sc sd se sg sh si sj sk sl sm sn so sr ss st su sv sx sy "
    "sz tc td tf tg th tj tk tl tm tn to tr tt tv tw tz ua ug uk um us uy uz "
    "va vc ve vg vi vn vu wf ws ye yt za zm zw".split()
)
_LINK_REGEX_CACHE = None

def get_link_regex():
    """Reconhece http://, https://, www. ou domínio com extensão conhecida."""
    import re
    global _LINK_REGEX_CACHE
    if _LINK_REGEX_CACHE is None:
        tlds = "|".join(sorted(_LINK_TLDS))
        _LINK_REGEX_CACHE = re.compile(
            # esquema (http://, ftp:// ...)
            r"(?:[a-z][a-z0-9+.-]{0,30}://"
            # www.sem tubo
            r"|www\.)"
            # domínio pelado: algo.com, sub.exemplo.com.br, bit.ly/xyz
            r"|(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:" + tlds + r")(?:[/?#]\S*)?",
            re.IGNORECASE,
        )
    return _LINK_REGEX_CACHE

def text_contains_link(text: str) -> bool:
    """True se o texto contém um link (http, www ou domínio com TLD conhecido)."""
    return bool(text and get_link_regex().search(text))

# Sequências de "k" repetido (kkkk...) usadas para zombar/referenciar o KKK
# mesmo quando não formam uma palavra inteira (ex.: "kkkkkk").
_K_RUN_REGEX_CACHE = None

def get_k_run_regex():
    import re
    global _K_RUN_REGEX_CACHE
    if _K_RUN_REGEX_CACHE is None:
        _K_RUN_REGEX_CACHE = re.compile(r"(?:^|[^a-z0-9])(k{3,})(?:$|[^a-z0-9])", re.IGNORECASE)
    return _K_RUN_REGEX_CACHE

MAX_NICK_LENGTH = 20

_BOUNDARY_REGEX_CACHE = None

def _blocked_token_regex():
    """Compila a regex de borda de palavra uma única vez (cache)."""
    import re
    global _BOUNDARY_REGEX_CACHE
    if _BOUNDARY_REGEX_CACHE is None:
        _BOUNDARY_REGEX_CACHE = re.compile(
            r"(?:^|[^a-z0-9])(" + "|".join(re.escape(w) for w in BANNED_WORDS_BOUNDARY) + r")(?:$|[^a-z0-9])"
        )
    return _BOUNDARY_REGEX_CACHE

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
    # 3) Sequências de 'k' repetido (KKK / kkkk...)
    if get_k_run_regex().search(normalized):
        return True
    return False

def text_contains_bad_words(text: str) -> bool:
    """True se o texto contém termos impróprios (mesma base do filtro de nicks).

    Usado no chat para bloquear mensagens ofensivas antes do envio.
    """
    return nickname_is_inappropriate(text)

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
