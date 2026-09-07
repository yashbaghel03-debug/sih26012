# SIH 2026 — Problem Statement 26012

## AI-Based Automated Urban Parcel Mapping and Cadastral Feature Extraction System

> Smart India Hackathon 2026 | Team Project

---

## What This System Does

A **deterministic GIS-based spatial information integration and parcel-addressing system** that:

- Covers India in standardized spatial units (ALUs) from 1 km² down to 0.1 m²
- Assigns deterministic unique identifiers to every spatial unit
- Connects to authoritative government data sources
- Grades each parcel by how many of 21 defined information categories are available
- Displays everything through an interactive WebGIS

**No AI/LLM is used in the core system.** Everything is GIS, spatial queries, and rule-based deterministic logic.

---

## Repository Structure

```
sih2026/
├── backend/
│   ├── mock_gov_portal/       ← Yash: Phase 1 — Demo government data API
│   ├── spatial_indexing/      ← Yash: Phase 7 — ALU lattice + hierarchy math
│   ├── retrieval_engine/      ← Yash: Phase 6 — Connector + assignment engine
│   └── source_registry/       ← Yash: Phase 2 — Category → source mapping
└── frontend/                  ← Team: WebGIS (React + TypeScript + MapLibre)
```

---

## Backend: Mock Government Portal

> **FICTIONAL DEMO INFRASTRUCTURE — NOT A REAL GOVERNMENT PORTAL**

A FastAPI service simulating structured government department APIs.
Used as the data source target during SIH demo.

### Run Locally

```bash
cd backend/mock_gov_portal
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r ../../requirements.txt
uvicorn main:app --reload --port 8001
```

Swagger docs: [http://localhost:8001/docs](http://localhost:8001/docs)

### Demo Parcels

| Parcel ID        | Score | Color  | Notes                        |
|-----------------|-------|--------|------------------------------|
| PA-HY-2024-001  | 21/21 | GREEN  | All categories available     |
| PB-HY-2024-002  | 17/21 | YELLOW | Some categories missing      |
| PC-HY-2024-003  | 12/21 | RED    | Agricultural — many N/A      |
| PD-HY-2024-004  | 14/21 | RED    | Commercial — some N/D        |
| PE-HY-2024-005  | 16/21 | YELLOW | Mixed use — some N/A         |

---

## 21 Information Categories

| # | Category                          | Source Department     |
|---|-----------------------------------|-----------------------|
| 1 | ULPIN                             | Land Records          |
| 2 | Cadastral Map / Parcel Boundary   | Survey                |
| 3 | Georeferenced Imagery             | Survey / NRSC         |
| 4 | Record of Rights (RoR)            | Land Records          |
| 5 | Registration Deeds / Title Chain  | Registration          |
| 6 | Master Plan / Town Layout         | Planning / HMDA       |
| 7 | Building Plan Approvals           | Planning / GHMC       |
| 8 | Completion / Occupancy Certs      | Planning / GHMC       |
| 9 | Encumbrances / Charges            | Registration          |
|10 | Bank Mortgages / Liens            | Registration / Banks  |
|11 | Land Use / Zoning                 | Planning              |
|12 | Utility Infrastructure            | Utilities             |
|13 | Property Taxation / Arrears       | Municipal             |
|14 | Valuation / Circle Rates          | Municipal / Revenue   |
|15 | Infrastructure Networks / ROW     | PWD / Infrastructure  |
|16 | Environmental Buffers / Forest    | Environment / Forest  |
|17 | Restriction Zones (CRZ/Defence)   | Multiple Agencies     |
|18 | Service Linkages / Welfare        | Social Welfare        |
|19 | Pending Litigation / Court Stays  | Judicial              |
|20 | Satellite / Drone Change Detection| Survey / NRSC         |
|21 | Workflow Logs / Transaction Track | Internal System       |

---

## Color Grading

| Color  | Usable Categories |
|--------|-------------------|
| GREEN  | 18–21             |
| YELLOW | 15–17             |
| RED    | < 15              |
| WHITE  | Unvisited / Unassigned |

---

## N/A vs N/D

- **N/A (Not Applicable):** Category genuinely does not apply to this parcel type.
- **N/D (Not Disclosed):** Information exists but is restricted / not accessible.

Neither counts toward the usable score.

---

## Tech Stack

| Layer     | Technology                              |
|-----------|-----------------------------------------|
| Spatial DB| PostgreSQL + PostGIS                    |
| GIS Python| GeoPandas, Shapely, PyProj, GDAL        |
| Backend   | FastAPI (Python)                        |
| Frontend  | React + TypeScript + MapLibre GL JS     |
