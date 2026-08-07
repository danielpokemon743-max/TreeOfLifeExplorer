from typing import Any, Dict, Optional

from application.interfaces import BiologicalDataConnector
from domain.schemas import TaxonCreate
from infrastructure.connectors.base import BaseHTTPConnector


class NCBIConnector(BaseHTTPConnector, BiologicalDataConnector):
    """Conector para a API de Genomas do NCBI."""

    def __init__(self) -> None:
        # Usando a API do E-utilities (NCBI)
        super().__init__(base_url="https://eutils.ncbi.nlm.nih.gov/entrez/eutils")

    async def fetch_taxon_by_name(self, scientific_name: str) -> Optional[TaxonCreate]:
        """
        O NCBI foca mais na árvore taxonômica ligada a genomas.
        Implementação básica para interface.
        """
        params = {
            "db": "taxonomy",
            "term": scientific_name,
            "retmode": "json"
        }
        data = await self.get("/esearch.fcgi", params=params)

        # Se encontrou resultados, tenta mapear (simplificado para exemplo)
        id_list = data.get("esearchresult", {}).get("idlist", [])
        if not id_list:
            return None

        return TaxonCreate(
            scientific_name=scientific_name,
            common_name=None,
            rank="UNKNOWN",
            parent_id=None
        )

    async def fetch_genome_summary(self, taxon_id: str) -> Dict[str, Any]:
        """Busca dados brutos do genoma para uma espécie usando seu taxid no NCBI."""
        params = {
            "db": "genome",
            "term": f"txid{taxon_id}[Organism]",
            "retmode": "json"
        }
        data = await self.get("/esearch.fcgi", params=params)
        return data

    async def fetch_taxonomy_tree(self, root_id: str) -> Dict[str, Any]:
        return {}
