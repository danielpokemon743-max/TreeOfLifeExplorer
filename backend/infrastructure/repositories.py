from typing import List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from domain.models import Taxon
from domain.schemas import TaxonCreate


class TaxonRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_by_id(self, taxon_id: int) -> Optional[Taxon]:
        result = await self.session.execute(
            select(Taxon).where(Taxon.id == taxon_id)
        )
        return result.scalars().first()

    async def search(self, query: str, limit: int = 50, offset: int = 0) -> List[Taxon]:
        result = await self.session.execute(
            select(Taxon)
            .where(
                Taxon.scientific_name.ilike(f"%{query}%") |
                Taxon.common_name.ilike(f"%{query}%")
            )
            .limit(limit)
            .offset(offset)
        )
        return list(result.scalars().all())

    async def create(self, taxon_data: TaxonCreate) -> Taxon:
        new_taxon = Taxon(**taxon_data.model_dump())
        self.session.add(new_taxon)
        await self.session.flush()
        return new_taxon
