# redis.py
import redis.asyncio as aioredis
from .config import settings

_redis_url = (settings.REDIS_URL or "").strip()
redis_client = None
if _redis_url:
    try:
        redis_client = aioredis.from_url(_redis_url, decode_responses=True)
    except Exception:
        redis_client = None

async def _redis_available() -> bool:
    if redis_client is None:
        return False
    try:
        await redis_client.ping()
        return True
    except Exception:
        return False

async def store_challenge(session_id: str, challenge: str, ttl: int = 300):
    if redis_client is None:
        return
    try:
        await redis_client.setex(f"webauthn_challenge:{session_id}", ttl, challenge)
    except Exception:
        pass

async def get_and_delete_challenge(session_id: str) -> str | None:
    if redis_client is None:
        return None
    try:
        key = f"webauthn_challenge:{session_id}"
        challenge = await redis_client.get(key)
        if challenge:
            await redis_client.delete(key)
        return challenge
    except Exception:
        return None

# Helpers genéricos para rate-limit distribuído
async def incr_with_ttl(key: str, ttl: int) -> int | None:
    if redis_client is None:
        return None
    try:
        v = await redis_client.incr(key)
        if v == 1:
            await redis_client.expire(key, ttl)
        return int(v)
    except Exception:
        return None

async def get_ttl(key: str) -> int:
    if redis_client is None:
        return 0
    try:
        return await redis_client.ttl(key)
    except Exception:
        return 0