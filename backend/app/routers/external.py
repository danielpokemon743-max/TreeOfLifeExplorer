import httpx
from fastapi import APIRouter, Query

router = APIRouter(prefix="/api/external", tags=["External"])

# O NCBI E-utilities não envia Access-Control-Allow-Origin, então o navegador
# não consegue chamá-lo direto. Este proxy roda no servidor (sem CORS) e repassa
# a resposta JSON do NCBI para o frontend.
_EUTILS = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"
_TIMEOUT = httpx.Timeout(20.0)


@router.get("/ncbi/esearch")
async def ncbi_esearch(
    db: str = Query("taxonomy"),
    term: str = Query(...),
    retmode: str = Query("json"),
):
    params = {"db": db, "term": term, "retmode": retmode}
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        resp = await client.get(f"{_EUTILS}/esearch.fcgi", params=params)
    return resp.json()


@router.get("/ncbi/esummary")
async def ncbi_esummary(
    db: str = Query("taxonomy"),
    id: str = Query(...),
    retmode: str = Query("json"),
):
    params = {"db": db, "id": id, "retmode": retmode}
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        resp = await client.get(f"{_EUTILS}/esummary.fcgi", params=params)
    return resp.json()
