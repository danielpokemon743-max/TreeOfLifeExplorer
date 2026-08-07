from sqlalchemy import Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from infrastructure.database import Base


class Taxon(Base):
    __tablename__ = "taxons"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    scientific_name: Mapped[str] = mapped_column(String, index=True)
    common_name: Mapped[str | None] = mapped_column(String, nullable=True)
    rank: Mapped[str] = mapped_column(String, index=True)
    parent_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
