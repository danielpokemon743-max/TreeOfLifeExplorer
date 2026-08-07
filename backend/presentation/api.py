from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from application.services import PhylogenyService
from domain.schemas import TaxonCreate, TaxonResponse
from infrastructure.database import get_db_session
from infrastructure.repositories import TaxonRepository

router = APIRouter(prefix="/api/v1/taxons", tags=["Taxonomy"])

async def get_taxon_repo(
    session: AsyncSession = Depends(get_db_session)
) -> TaxonRepository:
    return TaxonRepository(session)

async def get_phylogeny_service(
    repo: TaxonRepository = Depends(get_taxon_repo)
) -> PhylogenyService:
    return PhylogenyService(repo)

@router.post("/", response_model=TaxonResponse)
async def create_taxon(
    taxon: TaxonCreate,
    repo: TaxonRepository = Depends(get_taxon_repo)
) -> TaxonResponse:
    # mypy requires type ignore or specific conversion if repo returns Taxon instead of TaxonResponse
    return await repo.create(taxon)  # type: ignore

@router.get("/search", response_model=List[TaxonResponse])
async def search_taxons(
    q: str = Query(..., min_length=2),
    limit: int = 50,
    offset: int = 0,
    repo: TaxonRepository = Depends(get_taxon_repo)
) -> List[TaxonResponse]:
    return await repo.search(q, limit, offset)  # type: ignore

@router.get("/{taxon_id}", response_model=TaxonResponse)
async def get_taxon(
    taxon_id: int,
    repo: TaxonRepository = Depends(get_taxon_repo)
) -> TaxonResponse:
    taxon = await repo.get_by_id(taxon_id)
    if not taxon:
        raise HTTPException(status_code=404, detail="Taxon not found")
    return taxon  # type: ignore

@router.get("/{taxon_id}/lineage", response_model=List[TaxonResponse])
async def get_taxon_lineage(
    taxon_id: int,
    service: PhylogenyService = Depends(get_phylogeny_service)
) -> List[TaxonResponse]:
    lineage = await service.get_lineage(taxon_id)
    if not lineage:
        raise HTTPException(
            status_code=404,
            detail="Taxon not found or has no lineage"
        )
    return lineage  # type: ignore

@router.get("/compare/common_ancestor")
async def get_common_ancestor(
    taxon1: int = Query(...),
    taxon2: int = Query(...),
    service: PhylogenyService = Depends(get_phylogeny_service)
) -> TaxonResponse:
    ancestor = await service.find_common_ancestor(taxon1, taxon2)
    if not ancestor:
        raise HTTPException(status_code=404, detail="Common ancestor not found")
    return ancestor  # type: ignore
