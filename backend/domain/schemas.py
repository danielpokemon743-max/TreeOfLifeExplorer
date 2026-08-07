from typing import List, Optional

from pydantic import BaseModel, ConfigDict


class TaxonBase(BaseModel):
    scientific_name: str
    common_name: Optional[str] = None
    rank: str
    parent_id: Optional[int] = None

class TaxonCreate(TaxonBase):
    pass

class TaxonResponse(TaxonBase):
    id: int
    model_config = ConfigDict(from_attributes=True)

class TaxonTree(TaxonResponse):
    children: List['TaxonTree'] = []

class SearchQuery(BaseModel):
    query: str
    limit: int = 50
    offset: int = 0
