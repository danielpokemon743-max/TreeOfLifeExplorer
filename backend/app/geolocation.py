# geolocation.py
# Geolocalização aproximada por IP usando ip-api.com (gratuito, sem chave).
# As respostas são cacheadas em memória para respeitar o limite do serviço.
import math
import time

import httpx

# Cache em memória: ip -> (timestamp_da_consulta, dados_geo_ou_None)
_GEO_CACHE: dict[str, tuple[float, dict | None]] = {}
_GEO_CACHE_TTL_SECONDS = 24 * 3600   # mantém por 24h
_GEO_HTTP_TIMEOUT = 5.0
_IP_API_URL = (
    "http://ip-api.com/json/{ip}"
    "?fields=status,countryCode,country,regionName,lat,lon"
)
# IPs que nunca serão consultados (localhost / inválidos)
_PRIVATE_IPS = {"", "unknown", "127.0.0.1", "::1", "localhost"}


def _cache_cleanup() -> None:
    now = time.time()
    expired = [
        k for k, (ts, _v) in _GEO_CACHE.items()
        if now - ts > _GEO_CACHE_TTL_SECONDS
    ]
    for k in expired:
        _GEO_CACHE.pop(k, None)


async def geo_lookup(ip: str) -> dict | None:
    """Geolocaliza um IP. Retorna dict com country_code, country, region,
    lat, lon; ou None se não foi possível (IP privado, fora do país, falha)."""
    ip = (ip or "").strip()
    if ip in _PRIVATE_IPS:
        return None

    _cache_cleanup()
    cached = _GEO_CACHE.get(ip)
    if cached is not None:
        return cached[1]

    geo = None
    try:
        async with httpx.AsyncClient(
            timeout=_GEO_HTTP_TIMEOUT, follow_redirects=True
        ) as client:
            resp = await client.get(_IP_API_URL.format(ip=ip))
            data = resp.json()
        if data.get("status") == "success" and data.get("lat") is not None:
            geo = {
                "country_code": (data.get("countryCode") or "")[:8] or None,
                "country": (data.get("country") or "")[:100] or None,
                "region": (data.get("regionName") or "")[:100] or None,
                "lat": float(data["lat"]),
                "lon": float(data["lon"]),
            }
    except Exception:
        geo = None

    # Guarda mesmo quando falha (para não repetir consultas seguidas).
    _GEO_CACHE[ip] = (time.time(), geo)
    return geo


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Distância em km entre dois pontos (fórmula de Haversine)."""
    r_earth = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return r_earth * 2 * math.asin(math.sqrt(a))


def flag_emoji(country_code: str) -> str:
    """Converte um código ISO-3166 de 2 letras na bandeira do país (emoji)."""
    code = (country_code or "").strip().upper()
    if len(code) != 2:
        return ""
    return "".join(chr(ord(c) + 127397) for c in code)
