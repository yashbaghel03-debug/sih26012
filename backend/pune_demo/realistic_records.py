from __future__ import annotations

from hashlib import sha256
from typing import Any

from pyproj import Transformer
from psycopg2.extras import RealDictCursor, Json

from ..spatial_indexing.lattice import Cell, TERMINAL_PLACEMENTS

PROFILE_NAMES = [
    ("Rakesh Sharma", "Ram Prasad"), ("Sunita Kulkarni", "Mahesh Kulkarni"),
    ("Amit Patil", "Dattatray Patil"), ("Neha Joshi", "Suresh Joshi"),
    ("Vivek Deshmukh", "Madhukar Deshmukh"), ("Pooja Pawar", "Ganesh Pawar"),
    ("Nitin Bhosale", "Shankar Bhosale"), ("Kavita Shinde", "Prakash Shinde"),
    ("Sanjay More", "Ramesh More"), ("Meena Jadhav", "Vilas Jadhav"),
    ("Ajay Chavan", "Mohan Chavan"), ("Priya Gokhale", "Anil Gokhale"),
    ("Rahul Sawant", "Dilip Sawant"), ("Swati Deshpande", "Vasant Deshpande"),
    ("Manoj Kadam", "Shivaji Kadam"), ("Asha Kapse", "Vijay Kapse"),
    ("Sachin Thorat", "Bharat Thorat"), ("Rekha Salunkhe", "Ashok Salunkhe"),
    ("Deepak Wagh", "Nana Wagh"), ("Nisha Pawar", "Ravindra Pawar"),
    ("Pravin Khot", "Narayan Khot"), ("Shilpa Naik", "Madhav Naik"),
    ("Milind Gaikwad", "Raghunath Gaikwad"), ("Anjali Tambe", "Dnyaneshwar Tambe"),
]
LAND_TYPES = ["Residential", "Mixed Use", "Commercial", "Institutional", "Vacant Urban Plot"]
ZONES = ["Residential R2", "Commercial C2", "Mixed Use MU", "Public/Semi-Public"]
MISSING_COUNTS = (0, 1, 2, 3, 4, 5, 6, 7, 8)
_TO_WGS = Transformer.from_crs(3857, 4326, always_xy=True)


def profile_index(alu_id: str) -> int:
    return int(sha256(alu_id.encode()).hexdigest()[:8], 16) % len(PROFILE_NAMES)


def missing_slots(index: int) -> dict[int, str]:
    target = MISSING_COUNTS[index % len(MISSING_COUNTS)]
    slots: dict[int, str] = {}
    for j in range(target):
        slot = (index * 7 + j * 5) % 21
        slots[slot] = "N/A" if (index + j) % 5 == 0 else "N/D"
    return slots


def _cell_center(cell: Cell) -> tuple[float, float]:
    x1, y1, x2, y2 = cell.mercator_bounds
    return _TO_WGS.transform((x1 + x2) / 2, (y1 + y2) / 2)


def _parcel_payloads(index: int) -> dict[str, Any]:
    i = index
    holder, father = PROFILE_NAMES[i]
    locality = "Kothrud" if i % 2 == 0 else "Kothrud-South"
    survey = f"{68 + i // 6}/{i % 6 + 1}"
    cts = f"KTR-{200 + i:04d}"
    uid = f"KTH-PID-{1001 + i:04d}"
    area = round(95 + ((i * 37) % 410) + (i % 5) * 0.5, 2)
    land = LAND_TYPES[i % 5]
    zone = ZONES[i % 4]
    deed_no = f"PUNE-SRO-{2024 + i % 3}-{10001 + i:05d}"
    tax_no = f"KTH-TAX-{500001 + i:06d}"
    proposal = f"PMC-BP-{2024 + i % 3}-{101 + i:04d}"
    return {
        "parcel": {"parcel_id": f"PUNE-KOT-{i+1:03d}", "locality": locality, "survey_number": survey, "cts_number": cts, "property_uid": uid, "area_m2": area, "holder": holder, "father_name": father, "land_type": land, "zone": zone},
        "land_records": {"district": "Pune", "taluka": "Pune City", "village_or_peth": locality, "survey_number": survey, "hissa_number": str(i % 3 + 1), "ulpin": "N/D", "property_uid": uid, "record_type": "7/12 / Property Card reference", "account_reference": f"KH-{2401+i:06d}", "land_classification": land, "record_holder": holder, "father_name": father, "share": "1/1", "ferfar_reference": f"FER-{2025+i%2}-{1001+i:04d}", "remarks": "Fictional linked demo record; not an official government record."},
        "registration": {"deed_number": deed_no, "registration_date": f"202{4+i%3}-{i%9+1:02d}-{i%26+1:02d}", "document_type": ["Sale Deed", "Leave & License", "Gift Deed"][i % 3], "property_description": f"Urban property situated at {locality}, Pune", "survey_gat_cts_reference": f"{survey} / {cts}", "village": locality, "sub_registrar_office": "Pune City SRO", "transaction_value_inr": 4250000 + i * 375000, "market_value_inr": 5100000 + i * 420000, "consideration_value_inr": 4100000 + i * 360000, "party_type": "Fictional demo parties", "registration_status": "Registered"},
        "planning_building": {"proposal_number": proposal, "property_id": uid, "survey_number": survey, "plot_number": f"P-{i+1:03d}", "village": locality, "land_use_zone": zone, "proposal_type": ["New Construction", "Addition", "Occupancy"][i % 3], "building_use": land, "floors": i % 5 + 1, "sanctioned_area_m2": round(area * (0.55 + (i % 4) * 0.05), 2), "approval_date": f"202{4+i%3}-{i%9+1:02d}-15", "application_status": ["Approved", "Under Scrutiny", "N/D", "N/A"][i % 4], "occupancy_certificate": f"OC-PMC-{2024+i%3}-{300+i:04d}" if i % 3 == 2 else "N/D"},
        "property_tax": {"property_id": uid, "property_tax_number": tax_no, "address": f"{100+i}, {locality}, Pune, Maharashtra", "ward_zone": "Kothrud", "village_area": locality, "survey_number": survey, "plot_number": f"P-{i+1:03d}", "property_type": land, "usage": "Residential" if land == "Residential" else land, "floor_unit": f"Unit {i%6+1}", "built_up_area_m2": round(area * 0.72, 2), "assessment_year": "2026-27", "annual_tax_inr": 8200 + i * 430, "arrears_inr": 1250 if i % 5 == 0 else 0, "payment_status": ["Paid", "Paid", "Part Paid", "N/D"][i % 4], "valuation_rate_inr_m2": 78000 + i * 900, "mutation_status": "Pending" if i % 3 == 0 else "No pending mutation"},
        "utility_infrastructure": {"electricity": "Available", "water": "Municipal network", "sewerage": "Connected" if i % 4 else "N/D", "drainage": "Available", "road_name": f"Internal Road {i%6+1}, Kothrud", "road_width_m": round(9 + (i % 4) * 1.5, 1), "right_of_way": "Reference only", "service_availability": "PARTIAL" if i % 4 == 0 else "AVAILABLE", "network_proximity": {"water_m": 55+i*2, "electricity_m": 30+i, "sewer_m": 80+i*3}, "infrastructure_project": f"Kothrud Corridor Package {2026+i%2}", "geometry_reference": "N/D"},
        "legal_encumbrance": {"encumbrance": "Mortgage" if i % 4 == 0 else "None recorded", "mortgage": {"bank": "Maharashtra Co-operative Bank (fictional)", "charge_amount_inr": 4250000 + i * 25000, "status": "Active"} if i % 4 == 0 else None, "lien": None, "court_stay": "N/D" if i % 5 == 0 else "None recorded", "litigation": "N/D" if i % 3 == 0 else "None recorded", "legal_restriction": "None recorded", "transaction_hold": "None", "record_status": "AVAILABLE"},
        "citizen_land_services": {"service_request_id": f"MH-CIT-{2026}-{70001+i:05d}", "service": "Mutation / document status lookup", "search_reference": f"CTS {cts} / Survey {survey}", "request_status": ["Completed", "In Review", "N/D", "N/A"][i % 4], "last_action_date": f"2026-{i%9+1:02d}-{i%26+1:02d}", "helpdesk_case": f"KTH-HELP-{1100+i:04d}"}
    }


def field_bundle(alu_id: str) -> dict[str, Any]:
    cell = _cell_from_alu(alu_id)
    i = profile_index(alu_id)
    p = _parcel_payloads(i)
    center_lng, center_lat = _cell_center(cell)
    slots = missing_slots(i)
    values = [
        ("Ownership (RoR)", f"{p['land_records']['record_holder']} — S/o {p['land_records']['father_name']}", "MH_LAND_RECORDS"),
        ("Land Use", p['land_records']['land_classification'], "MH_LAND_RECORDS"),
        ("Land Type", p['parcel']['land_type'], "MH_LAND_RECORDS"),
        ("Area", f"{p['parcel']['area_m2']:.2f} m²", "MH_LAND_RECORDS"),
        ("Cadastral Map", f"Sheet KTH-{1+i%6:02d} · Plot {i+1:03d}", "BHUNAKSHA_MH"),
        ("Registration Details", p['registration']['deed_number'], "MH_REGISTRATION"),
        ("Deed Type", p['registration']['document_type'], "MH_REGISTRATION"),
        ("Registration Date", p['registration']['registration_date'], "MH_REGISTRATION"),
        ("Encumbrance", p['legal_encumbrance']['encumbrance'], "LEGAL_ENCUMBRANCE"),
        ("Litigation", p['legal_encumbrance']['litigation'], "LEGAL_ENCUMBRANCE"),
        ("Building Permission", p['planning_building']['proposal_number'], "PMC_BUILDING"),
        ("Occupancy Certificate", p['planning_building']['occupancy_certificate'], "PMC_BUILDING"),
        ("Property Tax", p['property_tax']['payment_status'], "PMC_PROPERTY_TAX"),
        ("Tax ID / PID", p['property_tax']['property_tax_number'], "PMC_PROPERTY_TAX"),
        ("Zoning / Land Use Zone", p['planning_building']['land_use_zone'], "PMC_BUILDING"),
        ("Infrastructure", p['utility_infrastructure']['service_availability'], "UTILITY_INFRA"),
        ("Utilities", f"Electricity: {p['utility_infrastructure']['electricity']}; Water: {p['utility_infrastructure']['water']}", "UTILITY_INFRA"),
        ("Environmental Zone", ["General urban area", "Urban buffer review", "N/D — layer unavailable"][i % 3], "MH_CITIZEN_SERVICES"),
        ("Restriction Zone", p['legal_encumbrance']['legal_restriction'], "LEGAL_ENCUMBRANCE"),
        ("Market Value", f"₹{p['registration']['market_value_inr']:,}", "MH_REGISTRATION"),
        ("Citizen / AI Land Service", f"{p['citizen_land_services']['service_request_id']} · {p['citizen_land_services']['request_status']}", "MH_CITIZEN_SERVICES"),
    ]
    fields = []
    for idx, (label, value, source) in enumerate(values):
        status = slots.get(idx, "AVAILABLE")
        if status == "N/D": value = "N/D — not publicly verified in the demo source bundle"
        elif status == "N/A": value = "N/A — not applicable to this record"
        fields.append({"label": f"{idx+1}. {label}", "value": value, "status": status, "source_id": source, "is_fictional": True})
    available = sum(f["status"] not in {"N/D", "N/A"} for f in fields)
    return {"alu": cell.id, "level": cell.level, "area_m2": cell.area_m2, "parent_alu": cell.id.rsplit('-', 2)[0], "ulpin": "N/D — official ULPIN not imported", "location": {"locality": p['parcel']['locality'], "district": "Pune", "state": "Maharashtra", "lat": round(center_lat, 8), "lng": round(center_lng, 8)}, "available_fields": available, "total_fields": 21, "coverage_status": "GREEN" if available >= 19 else "YELLOW" if available >= 15 else "RED", "fields": fields, "provenance_note": "All property attributes in this screen are fictional but linked to the same seeded records used by the seven mock portals. Geographic context is real; cadastral parcel geometry/ULPIN is not claimed as official."}


def _cell_from_alu(alu_id: str) -> Cell:
    from ..spatial_indexing.lattice import cell_from_id
    return cell_from_id(alu_id)


def fast_field_count(alu_id: str) -> int:
    return len([x for x in field_bundle(alu_id)["fields"] if x["status"] not in {"N/D", "N/A"}])


def sync_seeded_portal_records(conn) -> dict[str, Any]:
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute("SELECT parcel_id FROM canonical_parcels ORDER BY parcel_id")
        rows = cur.fetchall()
    holders = PROFILE_NAMES
    added = 0
    for idx, row in enumerate(rows):
        profile = _parcel_payloads(idx % len(holders))
        pid = row["parcel_id"]
        with conn.cursor() as cur:
            for category in ("land_records", "registration_deeds", "planning_building", "property_tax", "utility_infrastructure", "legal_encumbrance"):
                key = {"land_records":"land_records","registration_deeds":"registration","planning_building":"planning_building","property_tax":"property_tax","utility_infrastructure":"utility_infrastructure","legal_encumbrance":"legal_encumbrance"}[category]
                payload = profile[key]
                cur.execute("UPDATE government_source_records SET payload=%s WHERE parcel_id=%s AND category=%s", (Json(payload), pid, category))
            citizen = profile["citizen_land_services"]
            cur.execute("""INSERT INTO government_source_records(parcel_id,source_id,source_name,department,source_url,source_type,record_identifier,parcel_identifier,category,data_status,is_fictional,payload)
                VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,true,%s)
                ON CONFLICT (parcel_id,source_id,category) DO UPDATE SET record_identifier=EXCLUDED.record_identifier,payload=EXCLUDED.payload,data_status=EXCLUDED.data_status,is_fictional=true""",
                (pid,"MH_CITIZEN_SERVICES","Maharashtra Citizen Land Services Demo","Maharashtra Land Records / citizen services","https://mahabhumi.gov.in/","mock_government_source",f"DEMO-CITIZEN-{idx+1:03d}",pid,"citizen_land_services","AVAILABLE",Json(citizen)))
            added += 1
    conn.commit()
    return {"synced_parcels": len(rows), "citizen_service_records": added, "fictional": True}
