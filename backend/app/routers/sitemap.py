from fastapi import APIRouter
from fastapi.responses import Response

router = APIRouter()

@router.get("/sitemap.xml", include_in_schema=False)
async def sitemap():
    base = "https://treeoflifeexplorer-1.onrender.com"
    urls = [
        f"{base}/",
        f"{base}/privacidade.html",
    ]
    # 500 espécies curadas + destaques
    try:
        from frontend.src.daily import SPECIES_OF_DAY  # não existe no backend, fallback
    except Exception:
        pass
    # Lista estática de táxons populares para SEO
    popular = [
        "homo-sapiens","panthera-leo","panthera-tigris","loxodonta-africana","balaenoptera-musculus",
        "gorilla-gorilla","arara-azul","ara-ararauna","pterophyllum-scalare","tyrannosaurus-rex",
        "canis-lupus","felis-catus","equus-caballus","bos-taurus","gallus-gallus",
    ]
    for slug in popular:
        urls.append(f"{base}/especie/{slug}")

    body = '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
    for u in urls:
        body += f"<url><loc>{u}</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>"
    body += "</urlset>"
    return Response(content=body, media_type="application/xml")
