import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func as sa_func
from pydantic import BaseModel

from ..database import get_db
from ..models import User, Discovery, Favorite, Achievement
from ..security import get_current_user_id
from ..config import settings

router = APIRouter(prefix="/api/progress", tags=["Progress"])

# ─── SISTEMA DE XP E NÍVEIS ────────────────────────────────────────────────────
# XP ganho por ação do usuário
XP_DISCOVERY   = 3    # descobrir um táxon novo
XP_FAVORITE    = 10   # favoritar um táxon novo
XP_ACHIEVEMENT = 40   # desbloquear uma conquista

def level_from_xp(xp: int) -> int:
    """Nível derivado do XP: cada nível exige 100 * nível pontos a mais."""
    level = 1
    remaining = xp
    while remaining >= 100 * level:
        remaining -= 100 * level
        level += 1
    return level

def xp_progress(level: int) -> int:
    """XP acumulado ao atingir um nível (para cálculo de barra de progresso)."""
    return 100 * level * (level - 1) // 2

def xp_needed_for_next(level: int) -> int:
    """Quantos XP são necessários para sair deste nível ao próximo."""
    return 100 * level

async def add_xp(user_id: uuid.UUID, amount: int, db: AsyncSession) -> dict:
    """Soma XP ao usuário e retorna se houve up de nível (e para qual nível)."""
    user = await db.get(User, user_id)
    if not user:
        return {"leveled_up": False, "new_level": None}

    old_level = level_from_xp(user.xp or 0)
    user.xp = (user.xp or 0) + amount
    new_level = level_from_xp(user.xp)
    leveled_up = new_level > old_level

    await db.commit()
    return {"leveled_up": leveled_up, "new_level": new_level if leveled_up else None}

ACHIEVEMENT_DEFINITIONS = {
    "PRIMEIRA_DESCOBERTA": "Primeira Descoberta — Explore seu primeiro táxon!",
    "CINCO_DESCOBERTAS": "Colecionador Iniciante — Descubra 5 táxons diferentes.",
    "DEZ_DESCOBERTAS": "Naturalista — Descubra 10 táxons diferentes.",
    "VINTE_CINCO_DESCOBERTAS": "Explorador Dedicado — Descubra 25 táxons.",
    "CINQUENTA_DESCOBERTAS": "Biólogo de Campo — Descubra 50 táxons.",
    "CEM_DESCOBERTAS": "Mestre da Biodiversidade — Descubra 100 táxons!",
    "DUZENTAS_DESCOBERTAS": "Enciclopédia Viva — Descubra 200 táxons.",
    "QUINHENTAS_DESCOBERTAS": "Guardião da Vida — Descubra 500 táxons!",
    "MIL_DESCOBERTAS": "Lenda da Taxonomia — Descubra 1.000 táxons!",
    "PRIMEIRO_FAVORITO": "Favorito — Salve seu primeiro táxon favorito.",
    "CINCO_FAVORITOS": "Curador — Tenha 5 táxons favoritos.",
    "DEZ_FAVORITOS": "Colecionador de Espécies — Tenha 10 favoritos.",
    "VINTE_CINCO_FAVORITOS": "Arquivista — Tenha 25 favoritos.",
    "CINQUENTA_FAVORITOS": "Bibliotecário da Vida — Tenha 50 favoritos!",
    "TREINTA_MINUTOS": "Dedicação — Fique 30 minutos explorando.",
    "UMA_HORA": "Devoto — Fique 1 hora explorando.",
    "DUAS_HORAS": "Viciado em Descobertas — Fique 2 horas explorando.",
    "CINCO_HORAS": "Cientista Dedicado — Fique 5 horas explorando.",
    "DEZ_HORAS": "O Explorador Incansável — Fique 10 horas explorando!",
    "TODOS_REINOS": "Pan-biológico — Descubra táxons dos 4 reinos (Animalia, Plantae, Fungi, Bacteria).",
    "KONAMI": "Código Secreto — Digite o código Konami no teclado.",
    "QUINZE_MINUTOS": "Curiosidade — Fique 15 minutos explorando.",
    "QUARENTA_CINCO_MINUTOS": "Foco — Fique 45 minutos explorando.",
    "TRES_HORAS": "Determinação — Fique 3 horas explorando.",
    "QUARENTA_FAVORITOS": "Colecionador Sênior — Tenha 40 favoritos.",
    "CEM_FAVORITOS": "Arquivo de Vida — Tenha 100 favoritos!",
    "TREZENTAS_DESCOBERTAS": "Investigador — Descubra 300 táxons.",
    "SETECENTAS_DESCOBERTAS": "Explorador Extremo — Descubra 700 táxons.",
    "NIVEL_TRES": "Explorador em Ascensão — Alcance o nível 3.",
    "NIVEL_CINCO": "Taxonomista Expert — Alcance o nível 5.",
    "NIVEL_DEZ": "Mestre da Árvore — Alcance o nível 10."
}

# XP concedido por conquista (individual — mais rara = mais XP)
ACHIEVEMENT_XP = {
    "PRIMEIRA_DESCOBERTA": 25,
    "CINCO_DESCOBERTAS": 35,
    "DEZ_DESCOBERTAS": 50,
    "VINTE_CINCO_DESCOBERTAS": 70,
    "CINQUENTA_DESCOBERTAS": 90,
    "CEM_DESCOBERTAS": 120,
    "DUZENTAS_DESCOBERTAS": 160,
    "QUINHENTAS_DESCOBERTAS": 250,
    "MIL_DESCOBERTAS": 400,
    "PRIMEIRO_FAVORITO": 20,
    "CINCO_FAVORITOS": 30,
    "DEZ_FAVORITOS": 45,
    "VINTE_CINCO_FAVORITOS": 60,
    "CINQUENTA_FAVORITOS": 100,
    "TREINTA_MINUTOS": 25,
    "UMA_HORA": 40,
    "DUAS_HORAS": 60,
    "CINCO_HORAS": 100,
    "DEZ_HORAS": 200,
    "TODOS_REINOS": 150,
    "KONAMI": 500,
    "QUINZE_MINUTOS": 15,
    "QUARENTA_CINCO_MINUTOS": 30,
    "TRES_HORAS": 80,
    "QUARENTA_FAVORITOS": 55,
    "CEM_FAVORITOS": 120,
    "TREZENTAS_DESCOBERTAS": 180,
    "SETECENTAS_DESCOBERTAS": 300,
    "NIVEL_TRES": 75,
    "NIVEL_CINCO": 150,
    "NIVEL_DEZ": 300,
}

async def check_and_award_achievements(user_id: uuid.UUID, db: AsyncSession):
    disc_count = await db.scalar(select(sa_func.count(Discovery.id)).where(Discovery.user_id == user_id))
    fav_count = await db.scalar(select(sa_func.count(Favorite.id)).where(Favorite.user_id == user_id))

    existing = await db.execute(select(Achievement.code).where(Achievement.user_id == user_id))
    existing_codes = {row[0] for row in existing.all()}

    user = await db.get(User, user_id)

    dc = disc_count or 0
    fc = fav_count or 0
    # Tempo ativo real no site (segundos) — base das conquistas de tempo
    active_minutes = ((user.total_time_seconds or 0) / 60.0) if user else 0
    effective_minutes = active_minutes
    user_level = level_from_xp(user.xp or 0) if user else 1

    # Reino distintas destacadas — verifica se o usuário cobriu os reinos exigidos
    kingdom_result = await db.execute(
        select(Discovery.kingdom).distinct().where(Discovery.user_id == user_id)
    )
    discovered_kingdoms = {k for k in kingdom_result.all() if k and k[0]}
    all_required_kingdoms = not (REQUIRED_KINGDOMS - discovered_kingdoms)

    thresholds = [
        ("PRIMEIRA_DESCOBERTA", dc >= 1),
        ("CINCO_DESCOBERTAS", dc >= 5),
        ("DEZ_DESCOBERTAS", dc >= 10),
        ("VINTE_CINCO_DESCOBERTAS", dc >= 25),
        ("CINQUENTA_DESCOBERTAS", dc >= 50),
        ("CEM_DESCOBERTAS", dc >= 100),
        ("DUZENTAS_DESCOBERTAS", dc >= 200),
        ("QUINHENTAS_DESCOBERTAS", dc >= 500),
        ("MIL_DESCOBERTAS", dc >= 1000),
        ("TREZENTAS_DESCOBERTAS", dc >= 300),
        ("SETECENTAS_DESCOBERTAS", dc >= 700),
        ("PRIMEIRO_FAVORITO", fc >= 1),
        ("CINCO_FAVORITOS", fc >= 5),
        ("DEZ_FAVORITOS", fc >= 10),
        ("VINTE_CINCO_FAVORITOS", fc >= 25),
        ("CINQUENTA_FAVORITOS", fc >= 50),
        ("QUARENTA_FAVORITOS", fc >= 40),
        ("CEM_FAVORITOS", fc >= 100),
        ("TREINTA_MINUTOS", effective_minutes >= 30),
        ("UMA_HORA", effective_minutes >= 60),
        ("DUAS_HORAS", effective_minutes >= 120),
        ("CINCO_HORAS", effective_minutes >= 300),
        ("DEZ_HORAS", effective_minutes >= 600),
        ("QUINZE_MINUTOS", effective_minutes >= 15),
        ("QUARENTA_CINCO_MINUTOS", effective_minutes >= 45),
        ("TRES_HORAS", effective_minutes >= 180),
        ("TODOS_REINOS", all_required_kingdoms),
        ("NIVEL_TRES", user_level >= 3),
        ("NIVEL_CINCO", user_level >= 5),
        ("NIVEL_DEZ", user_level >= 10),
    ]

    new_achievements = []
    total_xp = 0
    for code, earned in thresholds:
        if earned and code not in existing_codes:
            ach = Achievement(user_id=user_id, code=code)
            db.add(ach)
            new_achievements.append(code)
            total_xp += ACHIEVEMENT_XP.get(code, XP_ACHIEVEMENT)
            existing_codes.add(code)

    if new_achievements:
        await db.commit()
        await add_xp(user_id, total_xp, db)

    return new_achievements

class DiscoveryRequest(BaseModel):
    species_id: str
    kingdom: str = ""

# Conquista "Pan-biológico": exige descobertas em cada um destes reinos
REQUIRED_KINGDOMS = {"animalia", "plantae", "fungi", "bacteria", "protozoa"}

class FavoriteRequest(BaseModel):
    item_type: str
    item_id: str

@router.post("/discoveries")
async def add_discovery(
    body: DiscoveryRequest,
    current_user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(Discovery).where(
        Discovery.user_id == current_user_id,
        Discovery.species_id == body.species_id
    )
    existing = await db.execute(stmt)
    if existing.scalar_one_or_none():
        new_achs = await check_and_award_achievements(current_user_id, db)
        return {"status": "already_exists", "new_achievements": new_achs}

    kingdom = (body.kingdom or "").strip().lower()
    discovery = Discovery(user_id=current_user_id, species_id=body.species_id, kingdom=kingdom or None)
    db.add(discovery)
    await db.commit()

    new_achs = await check_and_award_achievements(current_user_id, db)
    xp_res = await add_xp(current_user_id, XP_DISCOVERY, db)
    return {
        "status": "success",
        "new_achievements": new_achs,
        "xp_gained": XP_DISCOVERY,
        "level": xp_res,
    }

@router.post("/discoveries/batch")
async def add_discoveries_batch(
    body: dict,
    current_user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
):
    species_ids = body.get("species_ids", [])
    new_count = 0
    for sid in species_ids:
        stmt = select(Discovery).where(
            Discovery.user_id == current_user_id,
            Discovery.species_id == sid
        )
        existing = await db.execute(stmt)
        if not existing.scalar_one_or_none():
            db.add(Discovery(user_id=current_user_id, species_id=sid))
            new_count += 1

    await db.commit()
    new_achs = await check_and_award_achievements(current_user_id, db)
    xp_res = await add_xp(current_user_id, new_count * XP_DISCOVERY, db)
    return {
        "status": "success",
        "new_discoveries": new_count,
        "new_achievements": new_achs,
        "xp_gained": new_count * XP_DISCOVERY,
        "level": xp_res,
    }

@router.post("/favorites")
async def add_favorite(
    body: FavoriteRequest,
    current_user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(Favorite).where(
        Favorite.user_id == current_user_id,
        Favorite.item_id == body.item_id
    )
    existing = await db.execute(stmt)
    if existing.scalar_one_or_none():
        return {"status": "already_exists"}

    fav = Favorite(user_id=current_user_id, item_type=body.item_type, item_id=body.item_id)
    db.add(fav)
    await db.commit()

    new_achs = await check_and_award_achievements(current_user_id, db)
    xp_res = await add_xp(current_user_id, XP_FAVORITE, db)
    return {
        "status": "success",
        "new_achievements": new_achs,
        "xp_gained": XP_FAVORITE,
        "level": xp_res,
    }

@router.get("/favorites")
async def list_favorites(
    current_user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(Favorite).where(Favorite.user_id == current_user_id).order_by(Favorite.created_at.desc())
    )
    favs = result.scalars().all()
    return [{"item_type": f.item_type, "item_id": f.item_id, "created_at": f.created_at.isoformat()} for f in favs]

@router.delete("/favorites/{item_id}")
async def remove_favorite(
    item_id: str,
    current_user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(Favorite).where(
        Favorite.user_id == current_user_id,
        Favorite.item_id == item_id
    )
    result = await db.execute(stmt)
    fav = result.scalar_one_or_none()
    if fav:
        await db.delete(fav)
        await db.commit()
    return {"status": "deleted"}

@router.get("/achievements")
async def list_achievements(
    current_user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(Achievement).where(Achievement.user_id == current_user_id).order_by(Achievement.unlocked_at)
    )
    achs = result.scalars().all()
    earned_codes = {a.code for a in achs}
    all_achs = []
    for code, description in ACHIEVEMENT_DEFINITIONS.items():
        all_achs.append({
            "code": code,
            "description": description,
            "unlocked": code in earned_codes,
            "unlocked_at": next((a.unlocked_at.isoformat() for a in achs if a.code == code), None)
        })
    return all_achs

# Conquistas secretas que só podem ser desbloqueadas por ação específica no site
SECRET_ACHIEVEMENTS = {"KONAMI"}

class AchievementUnlockRequest(BaseModel):
    code: str

@router.post("/achievements/unlock")
async def unlock_achievement(
    body: AchievementUnlockRequest,
    current_user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
):
    code = body.code.strip().upper()
    if code not in SECRET_ACHIEVEMENTS:
        return {"status": "invalid"}

    existing = await db.execute(
        select(Achievement).where(
            Achievement.user_id == current_user_id,
            Achievement.code == code
        )
    )
    if existing.scalar_one_or_none():
        return {"status": "already_unlocked", "new_achievements": []}

    ach = Achievement(user_id=current_user_id, code=code)
    db.add(ach)
    await db.commit()
    xp_gained = ACHIEVEMENT_XP.get(code, XP_ACHIEVEMENT)
    xp_res = await add_xp(current_user_id, xp_gained, db)
    return {"status": "success", "new_achievements": [code], "xp_gained": xp_gained, "level": xp_res}

@router.get("/discoveries/count")
async def get_discoveries_count(
    current_user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
):
    count = await db.scalar(select(sa_func.count()).select_from(Discovery).where(Discovery.user_id == current_user_id))
    return {"count": count or 0}

class SessionTimeRequest(BaseModel):
    seconds: int = 0

@router.post("/session-time")
async def add_session_time(
    body: SessionTimeRequest,
    current_user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
):
    """Acumula o tempo ativo no site (segundos) e re-checa conquistas de tempo."""
    seconds = max(0, int(body.seconds or 0))
    if seconds == 0:
        return {"status": "noop", "total_seconds": None, "new_achievements": []}

    user = await db.get(User, current_user_id)
    if not user:
        return {"status": "error", "total_seconds": None, "new_achievements": []}

    user.total_time_seconds = (user.total_time_seconds or 0) + seconds
    await db.commit()

    new_achs = await check_and_award_achievements(current_user_id, db)
    return {
        "status": "success",
        "total_seconds": user.total_time_seconds,
        "new_achievements": new_achs,
    }

# ─── DEV: subir níveis (comando "0909") ──────────────────────────────────────
class DevLevelUpRequest(BaseModel):
    levels: int = 1

@router.post("/level-dev")
async def dev_level_up(
    body: DevLevelUpRequest,
    current_user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
):
    """Aumenta o nível do usuário somando o XP necessário para subir N níveis.
    Disponível apenas fora de produção (PRODUCTION=false)."""
    if settings.PRODUCTION:
        raise HTTPException(status_code=404, detail="Endpoint não disponível")

    user = await db.get(User, current_user_id)
    if not user:
        return {"status": "error", "level": None, "xp": None}

    levels = max(0, int(body.levels or 0))
    if levels == 0:
        return {"status": "noop", "level": level_from_xp(user.xp or 0), "xp": user.xp or 0}

    current = user.xp or 0
    current_level = level_from_xp(current)
    target_level = current_level + levels
    target_xp = xp_progress(target_level)  # XP necessário para atingir o nível alvo
    gained = max(0, target_xp - current)

    old_level = level_from_xp(current)
    user.xp = target_xp
    await db.commit()
    new_achs = await check_and_award_achievements(current_user_id, db)

    return {
        "status": "success",
        "old_level": old_level,
        "new_level": level_from_xp(target_xp),
        "xp_gained": gained,
        "total_xp": target_xp,
        "new_achievements": new_achs,
    }

@router.get("/profile")
async def get_profile(
    current_user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
):
    """Retorna dados de progresso + XP/nível atuais do usuário."""
    user = await db.get(User, current_user_id)
    if not user:
        return {"error": "not_found"}

    disc_count = await db.scalar(select(sa_func.count()).select_from(Discovery).where(Discovery.user_id == current_user_id))
    fav_count = await db.scalar(select(sa_func.count()).select_from(Favorite).where(Favorite.user_id == current_user_id))
    ach_count = await db.scalar(select(sa_func.count()).select_from(Achievement).where(Achievement.user_id == current_user_id))

    xp = user.xp or 0
    level = level_from_xp(xp)
    progress_xp = xp_progress(level)
    next_xp_needed = xp_needed_for_next(level)
    xp_into_level = xp - progress_xp

    return {
        "display_name": user.display_name,
        "xp": xp,
        "level": level,
        "total_time_seconds": user.total_time_seconds or 0,
        "xp_into_level": xp_into_level,
        "xp_needed_for_next": next_xp_needed,
        "level_progress": round(min(1.0, xp_into_level / max(1, next_xp_needed)) * 100),
        "discoveries_count": disc_count or 0,
        "favorites_count": fav_count or 0,
        "achievements_count": ach_count or 0,
    }
