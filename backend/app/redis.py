# redis.py
import redis.asyncio as aioredis
from .config import settings

redis_client = aioredis.from_url(settings.REDIS_URL, decode_responses=True)

async def store_challenge(session_id: str, challenge: str, ttl: int = 300):
    await redis_client.setex(f"webauthn_challenge:{session_id}", ttl, challenge)

async def get_and_delete_challenge(session_id: str) -> str | None:
    key = f"webauthn_challenge:{session_id}"
    challenge = await redis_client.get(key)
    if challenge:
        await redis_client.delete(key)
    return challenge