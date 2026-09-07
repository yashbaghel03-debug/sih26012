"""
⚠️  FICTIONAL DEMO INFRASTRUCTURE
    This is NOT a real government portal.
    Built for SIH 2026 — Problem Statement 26012 demo purposes only.
    All parcel data, names, and records are entirely fictional.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime

from .routers import (
    land_records,
    registration,
    planning,
    municipal,
    survey,
    utilities,
    environment,
    infrastructure,
    welfare,
    judicial,
    workflow,
)
from .fixtures.loader import list_all_parcels, load_parcel

# ── App ──────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="Mock Government Data Portal",
    description=(
        "⚠️ FICTIONAL DEMO INFRASTRUCTURE — NOT a real government portal.\n\n"
        "Simulates structured government department APIs for SIH 2026 "
        "Problem Statement 26012.\n\n"
        "Provides 21 information categories across 5 demo parcels in Hyderabad."
    ),
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# ── CORS (allow frontend dev server) ─────────────────────────────────────────

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["GET"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────────────────────

app.include_router(land_records.router)
app.include_router(registration.router)
app.include_router(planning.router)
app.include_router(municipal.router)
app.include_router(survey.router)
app.include_router(utilities.router)
app.include_router(environment.router)
app.include_router(infrastructure.router)
app.include_router(welfare.router)
app.include_router(judicial.router)
app.include_router(workflow.router)

# ── Core endpoints ────────────────────────────────────────────────────────────

@app.get("/health", tags=["System"])
def health():
    return {
        "status": "ok",
        "service": "Mock Government Data Portal",
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "disclaimer": "FICTIONAL DEMO — NOT a real government portal",
    }


@app.get("/api/v1/parcels", tags=["Parcels"],
         summary="List all demo parcels")
def list_parcels():
    """Returns summary metadata for all 5 demo parcels."""
    return {"parcels": list_all_parcels()}


@app.get("/api/v1/parcels/{parcel_id}", tags=["Parcels"],
         summary="Get parcel metadata and score")
def get_parcel(parcel_id: str):
    """
    Returns full metadata for a parcel including its information
    availability score (0–21) and color classification.
    """
    parcel = load_parcel(parcel_id)
    if not parcel:
        return {"error": f"Parcel '{parcel_id}' not found.", "available_parcels": list(["PA-HY-2024-001", "PB-HY-2024-002", "PC-HY-2024-003", "PD-HY-2024-004", "PE-HY-2024-005"])}
    return {
        "parcel_id": parcel["parcel_id"],
        "ulpin": parcel["ulpin"],
        "description": parcel["description"],
        "land_type": parcel["land_type"],
        "area_sq_m": parcel["area_sq_m"],
        "location": parcel["location"],
        "score": parcel["score"],
        "color": parcel["color"],
        "disclaimer": "FICTIONAL DEMO DATA",
    }
