import re
import httpx
from fastapi import APIRouter, HTTPException, Query

router = APIRouter(prefix="/api/external", tags=["External"])

# O NCBI E-utilities não envia Access-Control-Allow-Origin, então o navegador
# não consegue chamá-lo direto. Este proxy roda no servidor (sem CORS) e repassa
# a resposta JSON do NCBI para o frontend.
_EUTILS = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"
_TIMEOUT = httpx.Timeout(20.0)

_ALLOWED_DBS = {"taxonomy", "nucleotide", "pubmed", "protein", "gene", "genome"}
_ALLOWED_RETMODE = {"json", "xml"}
_TERM_RE = re.compile(r"^[\w\s\.\-\(\)\[\]\"\'\*:,]+$", re.UNICODE)
_ID_RE = re.compile(r"^[0-9,\s]+$")


@router.get("/ncbi/esearch")
async def ncbi_esearch(
    db: str = Query("taxonomy"),
    term: str = Query(..., min_length=1, max_length=200),
    retmode: str = Query("json"),
):
    if db not in _ALLOWED_DBS:
        raise HTTPException(status_code=400, detail="db não permitido")
    if retmode not in _ALLOWED_RETMODE:
        raise HTTPException(status_code=400, detail="retmode não permitido")
    if not _TERM_RE.match(term):
        raise HTTPException(status_code=400, detail="term contém caracteres inválidos")
    params = {"db": db, "term": term, "retmode": retmode}
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        resp = await client.get(f"{_EUTILS}/esearch.fcgi", params=params)
    return resp.json()


@router.get("/ncbi/esummary")
async def ncbi_esummary(
    db: str = Query("taxonomy"),
    id: str = Query(..., min_length=1, max_length=200),
    retmode: str = Query("json"),
):
    if db not in _ALLOWED_DBS:
        raise HTTPException(status_code=400, detail="db não permitido")
    if retmode not in _ALLOWED_RETMODE:
        raise HTTPException(status_code=400, detail="retmode não permitido")
    if not _ID_RE.match(id):
        raise HTTPException(status_code=400, detail="id contém caracteres inválidos")
    params = {"db": db, "id": id, "retmode": retmode}
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        resp = await client.get(f"{_EUTILS}/esummary.fcgi", params=params)
    return resp.json()
