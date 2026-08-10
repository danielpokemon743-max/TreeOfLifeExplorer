from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func as sa_func

from app.database import get_db
from app.models import User, Achievement, Discovery
from app.routers.progress import level_from_xp

router = APIRouter(prefix="/api/ranking", tags=["Ranking"])

# Ordenações permitidas (query param "sort") + label amigável
SORT_KEYS = {
    "xp": "xp",
    "level": "xp",          # nível deriva do XP — mesmo critério
    "achievements": "achievements_count",
    "hours": "hours",
}

@router.get("")
async def get_ranking(
    sort: str = "xp",
    db: AsyncSession = Depends(get_db),
):
    """Ranking global público: todos os usuários NÃO banidos com nick, XP,
    nível, conquistas, horas de jogo e país, ordenado pelo critério pedido."""
    sort = (sort or "xp").lower()
    if sort not in SORT_KEYS:
        raise HTTPException(status_code=400, detail="sort inválido. Use: xp, level, achievements, hours")

    # Contagem de conquistas e descobertas por usuário (evita N+1)
    ach_rows = (await db.execute(
        select(Achievement.user_id, sa_func.count(Achievement.id))
        .group_by(Achievement.user_id)
    )).all()
    disc_rows = (await db.execute(
        select(Discovery.user_id, sa_func.count(Discovery.id))
        .group_by(Discovery.user_id)
    )).all()
    ach_count = {r[0]: r[1] for r in ach_rows}
    disc_count = {r[0]: r[1] for r in disc_rows}

    result = await db.execute(
        select(User).where(User.is_banned == False)  # noqa: E712
    )
    users = result.scalars().all()

    entries = []
    for u in users:
        xp = u.xp or 0
        hours = (u.total_time_seconds or 0) / 3600.0
        entries.append({
            "display_name": u.display_name,
            "country": u.country or "",
            "xp": xp,
            "level": level_from_xp(xp),
            "achievements_count": ach_count.get(u.id, 0),
            "discoveries_count": disc_count.get(u.id, 0),
            "hours": round(hours, 1),
            "total_time_seconds": u.total_time_seconds or 0,
        })

    # Nível usa o XP; "level" e "xp" ordenam igual. Horas/achievements pelo campo real.
    if sort == "hours":
        entries.sort(key=lambda e: e["hours"], reverse=True)
    elif sort == "achievements":
        entries.sort(key=lambda e: e["achievements_count"], reverse=True)
    else:
        entries.sort(key=lambda e: e["xp"], reverse=True)

    # Posição (emprego) para exibir medalha/ranking
    for i, e in enumerate(entries, start=1):
        e["position"] = i

    return {"ranking": entries, "sort": sort, "total": len(entries)}