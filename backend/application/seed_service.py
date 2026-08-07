from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.domain.taxon import Taxon

async def seed_initial_taxonomy(session: AsyncSession):
    """Verifica se a base está vazia e insere os nós ancestrais raiz."""
    result = await session.execute(select(Taxon).limit(1))
    if result.scalars().first():
        return # Já existem dados, não faz nada

    print("[Seeder] Banco vazio detectado. Inserindo nós ancestrais raiz...")

    # 1. LUCA (Raiz absoluta)
    luca = Taxon(
        scientific_name="LUCA",
        common_name="Último Ancestral Comum Universal",
        rank="root",
        habitat={"description": "Hydrothermal vents"},
        conservation_status="Extinct"
    )
    session.add(luca)
    await session.flush() # Gera o ID do LUCA

    # 2. Os Três Domínios da Vida
    domains = [
        Taxon(scientific_name="Bacteria", common_name="Bactérias", rank="domain", parent_id=luca.id),
        Taxon(scientific_name="Archaea", common_name="Arqueias", rank="domain", parent_id=luca.id),
        Taxon(scientific_name="Eukaryota", common_name="Eucariontes", rank="domain", parent_id=luca.id)
    ]
    session.add_all(domains)
    await session.commit()
    print("[Seeder] Raízes da Árvore da Vida carregadas com sucesso!")