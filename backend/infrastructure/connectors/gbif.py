from typing import Any, Dict, Optional

from application.interfaces import BiologicalDataConnector
from domain.schemas import TaxonCreate
from infrastructure.connectors.base import BaseHTTPConnector


class GBIFConnector(BaseHTTPConnector, BiologicalDataConnector):
    """Conector para a API do Global Biodiversity Information Facility (GBIF)."""

    def __init__(self) -> None:
        super().__init__(base_url="https://api.gbif.org/v1")

    async def fetch_taxon_by_name(self, scientific_name: str) -> Optional[TaxonCreate]:
        """Busca a espécie no GBIF e retorna um objeto TaxonCreate padronizado."""
        data = await self.get("/species/match", params={"name": scientific_name})

        if data.get("matchType") == "NONE" or "scientificName" not in data:
            return None

        return TaxonCreate(
            scientific_name=data.get("scientificName", ""),
            common_name=data.get("canonicalName"),  # Aproximação se commonName não existir
            rank=data.get("rank", "UNKNOWN").upper(),
            parent_id=None # Será resolvido pelo Scheduler
        )

    async def fetch_taxonomy_tree(self, root_id: str) -> Dict[str, Any]:
        # Implementação futura para baixar sub-árvores inteiras
        return {}
