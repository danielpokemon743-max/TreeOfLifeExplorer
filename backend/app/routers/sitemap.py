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
        "drosophila-melanogaster","arabidopsis-thaliana","escherichia-coli","saccharomyces-cerevisiae",
        "mus-musculus","rattus-norvegicus","danio-rerio","xenopus-laevis","ginkgo-biloba",
    ]
    for slug in popular:
        urls.append(f"{base}/especie/{slug}")
    # Tenta incluir até 500 espécies do TSV local (se existir)
    try:
        import os, csv
        base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        tsv_candidates = [
            os.path.join(base_dir, "frontend", "public", "Taxon_mini2.tsv"),
            os.path.join(base_dir, "frontend", "dist", "Taxon_mini2.tsv"),
            "/app/frontend/dist/Taxon_mini2.tsv",
            "/app/frontend/public/Taxon_mini2.tsv",
        ]
        tsv_path = next((p for p in tsv_candidates if os.path.isfile(p)), None)
        if tsv_path:
            with open(tsv_path, encoding="utf-8") as f:
                reader = csv.DictReader(f, delimiter="\t")
                cnt = 0
                for row in reader:
                    if cnt >= 500: break
                    sci = (row.get("scientificName") or row.get("canonicalName") or "").strip()
                    if not sci or len(sci) < 3: continue
                    slug = sci.lower().replace(" ", "-").replace("/", "-")
                    # limpa slug
                    slug = "".join(c if c.isalnum() or c=="-" else "" for c in slug)
                    if len(slug) < 3: continue
                    url = f"{base}/especie/{slug}"
                    if url not in urls:
                        urls.append(url)
                        cnt += 1
    except Exception:
        pass

    body = '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
    for u in urls:
        body += f"<url><loc>{u}</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>"
    body += "</urlset>"
    return Response(content=body, media_type="application/xml")
