"""Phase 7 — deterministic spatial indexing math.

The 0.1 m² unit is represented as a fixed-offset 0.1 m × 1.0 m rectangle.
A 1 m² square cannot be divided into ten equal squares; sqrt(0.1) m would
not divide the 1 m parent cleanly. Ten rectangles preserve exact area and
an exact 10-child final hierarchy.
"""
from __future__ import annotations
from dataclasses import dataclass
from typing import Iterator
LEVEL_SPECS={"1km":(1000.0,1000.0,100),"100m":(100.0,100.0,100),"10m":(10.0,10.0,100),"1m":(1.0,1.0,10),"0.1m2":(0.1,1.0,10)}
_PARENT_LEVEL={"100m":"1km","10m":"100m","1m":"10m","0.1m2":"1m"}
def _validate(level):
    if level not in LEVEL_SPECS:raise ValueError(f"Unknown ALU level: {level}")
def cell_id(level,ix,iy):
    _validate(level)
    def enc(v):return ("p" if v>=0 else "n")+str(abs(v))
    return f"ALU-{level}-x{enc(ix)}-y{enc(iy)}"
@dataclass(frozen=True)
class Cell:
    level:str;ix:int;iy:int
    @property
    def id(self):return cell_id(self.level,self.ix,self.iy)
    @property
    def width_m(self):return LEVEL_SPECS[self.level][0]
    @property
    def height_m(self):return LEVEL_SPECS[self.level][1]
    @property
    def area_m2(self):return self.width_m*self.height_m
def cell_from_id(value):
    parts=value.split("-")
    if len(parts)!=4 or parts[0]!="ALU" or not parts[2].startswith("x") or not parts[3].startswith("y"):raise ValueError(f"Invalid ALU cell ID: {value}")
    _validate(parts[1])
    def dec(token):
        sign=1 if token[1]=="p" else -1 if token[1]=="n" else None
        if sign is None or len(token)<3:raise ValueError(f"Invalid coordinate token: {token}")
        return sign*int(token[2:])
    return Cell(parts[1],dec(parts[2]),dec(parts[3]))
def parent(cell):
    p_level=_PARENT_LEVEL.get(cell.level)
    if p_level is None:return None
    cw,ch,_=LEVEL_SPECS[cell.level];pw,ph,_=LEVEL_SPECS[p_level]
    return Cell(p_level,int((cell.ix*cw)//pw),int((cell.iy*ch)//ph))
def ancestor_1km(cell):
    current=cell
    while current.level!="1km":current=parent(current)
    return current
def children(cell:Cell)->Iterator[Cell]:
    if cell.level=="0.1m2":return
    next_level={v:k for k,v in _PARENT_LEVEL.items()}[cell.level]
    cw,ch,_=LEVEL_SPECS[next_level];pw,ph,_=LEVEL_SPECS[cell.level]
    nx,ny=round(pw/cw),round(ph/ch)
    if next_level=="0.1m2":nx,ny=10,1
    for dy in range(ny):
        for dx in range(nx):yield Cell(next_level,cell.ix*nx+dx,cell.iy*ny+dy)
