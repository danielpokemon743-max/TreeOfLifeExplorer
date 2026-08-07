import os

from celery import Celery  # type: ignore

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

celery_app = Celery(
    "treeoflife_worker",
    broker=REDIS_URL,
    backend=REDIS_URL
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
)

@celery_app.task
def sync_species_task(scientific_name: str) -> str:
    """
    Tarefa assíncrona que será executada pelos workers.
    Na versão final, instanciará os conectores (GBIF, NCBI) e atualizará o banco.
    Como o SQLAlchemy é Async e o Celery é Síncrono por padrão, usaremos asyncio.run() internamente.
    """
    return f"Sync scheduled for {scientific_name}"
