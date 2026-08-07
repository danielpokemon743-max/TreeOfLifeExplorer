from typing import Any, Dict, Optional

import httpx


class BaseHTTPConnector:
    """Classe base para conectores HTTP assíncronos."""

    def __init__(self, base_url: str) -> None:
        self.base_url = base_url
        self.client = httpx.AsyncClient(base_url=base_url, timeout=10.0)

    async def get(self, endpoint: str, params: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        response = await self.client.get(endpoint, params=params)
        response.raise_for_status()
        data = response.json()
        return data if isinstance(data, dict) else {}

    async def close(self) -> None:
        await self.client.aclose()
