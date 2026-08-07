from typing import Any, Dict, Optional, Protocol

from domain.schemas import TaxonCreate


class BiologicalDataConnector(Protocol):
    """Interface padrão para todos os conectores de bancos de dados biológicos."""

    async def fetch_taxon_by_name(self, scientific_name: str) -> Optional[TaxonCreate]:
        """Busca informações de um taxon pelo nome científico."""
        ...

    async def fetch_taxonomy_tree(self, root_id: str) -> Dict[str, Any]:
        """Busca a árvore taxonômica a partir de um nó raiz."""
        ...
