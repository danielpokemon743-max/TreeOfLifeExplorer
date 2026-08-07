from typing import List, Optional

from domain.models import Taxon
from infrastructure.repositories import TaxonRepository


class PhylogenyService:
    def __init__(self, repo: TaxonRepository):
        self.repo = repo

    async def get_lineage(self, taxon_id: int) -> List[Taxon]:
        """Retorna a linhagem completa de um taxon subindo até a raiz."""
        lineage = []
        current_id: Optional[int] = taxon_id

        # Previne loops infinitos ou queries gigantes por segurança
        max_depth = 50
        depth = 0

        while current_id is not None and depth < max_depth:
            taxon = await self.repo.get_by_id(current_id)
            if not taxon:
                break
            lineage.append(taxon)
            current_id = taxon.parent_id
            depth += 1

        # Retorna da raiz para a folha
        return lineage[::-1]

    async def find_common_ancestor(self, taxon_id_1: int, taxon_id_2: int) -> Optional[Taxon]:
        """Calcula o ancestral comum mais recente (LCA) entre duas espécies."""
        lineage_1 = await self.get_lineage(taxon_id_1)
        lineage_2 = await self.get_lineage(taxon_id_2)

        common_ancestor = None
        for t1, t2 in zip(lineage_1, lineage_2):
            if t1.id == t2.id:
                common_ancestor = t1
            else:
                break

        return common_ancestor
