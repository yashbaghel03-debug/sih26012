"""Phase 8 — round-by-round spatial processing."""
from __future__ import annotations
from dataclasses import dataclass,field
from datetime import datetime,timezone
from typing import Iterable,Optional
from .engine_v2 import DEFAULT_BASE_URL,retrieve_parcel
from ..spatial_indexing.lattice import Cell,ancestor_1km
ROUND_LEVELS=("1km","100m","10m","1m","0.1m2")
def _now():return datetime.now(timezone.utc).isoformat()
@dataclass
class RoundCell:
    cell:Cell
    parcel_id:str
    processed:bool=False
    usable_count:Optional[int]=None
    color:str="white"
    processed_at:Optional[str]=None
    def to_dict(self):return {"cell_id":self.cell.id,"level":self.cell.level,"parcel_id":self.parcel_id,"ancestor_1km":ancestor_1km(self.cell).id,"processed":self.processed,"usable_count":self.usable_count,"color":self.color,"processed_at":self.processed_at}
@dataclass
class RoundResult:
    level:str
    cells:list[RoundCell]=field(default_factory=list)
    completed:bool=False
    completed_at:Optional[str]=None
    @property
    def processed_count(self):return sum(c.processed for c in self.cells)
    def to_dict(self):return {"level":self.level,"total_cells":len(self.cells),"processed_cells":self.processed_count,"completed":self.completed,"completed_at":self.completed_at,"cells":[c.to_dict() for c in self.cells]}
class RoundProcessor:
    def __init__(self,base_url=DEFAULT_BASE_URL):self.base_url=base_url;self.history=[]
    def process_round(self,level:str,targets:Iterable[RoundCell])->RoundResult:
        if level not in ROUND_LEVELS:raise ValueError(f"Unsupported round level: {level}")
        result=RoundResult(level=level,cells=list(targets))
        for item in result.cells:
            assignment=retrieve_parcel(item.parcel_id,base_url=self.base_url)
            item.usable_count=assignment.usable_count;item.color=assignment.color;item.processed=True;item.processed_at=_now()
        result.completed=all(c.processed for c in result.cells);result.completed_at=_now() if result.completed else None;self.history.append(result);return result
    def process_all_levels(self,targets_by_level:dict[str,Iterable[RoundCell]]):
        return [self.process_round(level,targets_by_level[level]) for level in ROUND_LEVELS if level in targets_by_level]
