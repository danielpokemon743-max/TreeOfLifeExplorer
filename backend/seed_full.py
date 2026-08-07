import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parent))

import asyncio
import httpx
from infrastructure.database import engine, Base, async_session_maker
from domain.models import Taxon

# URL correta da API de Taxonomia do NCBI (eSummary para detalhes em JSON)
NCBI_SUMMARY_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi"

async def fetch_taxa_from_ncbi(tax_ids: list):
    """
    Busca informações detalhadas de táxons na NCBI pelos IDs taxonômicos.
    Exemplo de IDs: ['9606' (Homo sapiens), ['2' (Bacteria)]
    """
    params = {
        "db": "taxonomy",
        "id": ",".join(tax_ids),
        "retmode": "json"
    }
    
    async with httpx.AsyncClient() as client:
        response = await client.get(NCBI_SUMMARY_URL, params=params)
        response.raise_for_status()
        data = response.json()
        return data.get("result", {})

async def seed_from_api():
    # 1. Garante que as tabelas existem no banco local
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Lista de TaxIDs da NCBI que você deseja buscar (exemplo: Humanos, Bactérias, etc.)
    ids_para_buscar = ["9606", "2", "2157", "2759"]  # Humanos, Bacteria, Archaea, Eukaryota

    print("Buscando dados da API da NCBI...")
    ncbi_data = await fetch_taxa_from_ncbi(ids_para_buscar)

    async with async_session_maker() as session:
        for tax_id in ids_para_buscar:
            if tax_id in ncbi_data:
                item = ncbi_data[tax_id]
                
                # Mapeia os dados retornados pela NCBI para o modelo Taxon
                taxon = Taxon(
                    scientific_name=item.get("scientificname", "Desconhecido"),
                    common_name=item.get("commonname", None),
                    rank=item.get("rank", "no rank")
                )
                session.add(taxon)
        
        await session.commit()
        print("Sucesso! Táxons salvos no banco local.")

if __name__ == "__main__":
    asyncio.run(seed_from_api())