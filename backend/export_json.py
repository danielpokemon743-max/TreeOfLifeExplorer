import sys
from pathlib import Path

# Garante o carregamento do caminho raiz do backend
sys.path.append(str(Path(__file__).resolve().parent))

import asyncio
import json
from sqlalchemy import select
from infrastructure.database import engine, Base, async_session_maker
from domain.models import Taxon

async def export_tree_to_json():
    # 1. Garante que as tabelas existem no banco
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # 2. Faz a leitura e exportação
    async with async_session_maker() as session:
        result = await session.execute(select(Taxon))
        taxa = result.scalars().all()
        
        data = [
            {
                "id": t.id,
                "parent_id": t.parent_id,
                "scientific_name": t.scientific_name,
                "common_name": t.common_name,
                "rank": t.rank
            }
            for t in taxa
        ]
        
        # Salva o arquivo JSON no diretório do frontend
        output_path = Path("../frontend/public/tree_data.json")
        output_path.parent.mkdir(parents=True, exist_ok=True)
        
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
            
        print(f"Sucesso! {len(data)} táxon(s) exportado(s) para {output_path.resolve()}")

if __name__ == "__main__":
    asyncio.run(export_tree_to_json())