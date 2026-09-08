# Pune Demo Data Dictionary

## Canonical parcel

| Field | Type | Meaning | Source/status |
|---|---|---|---|
| parcel_id | string | Stable demo canonical key | Generated deterministically |
| ulpin | string/null | Government parcel identifier | `N/D` in current fictional dataset; never invented |
| district | string | District context | Real geography: Pune |
| taluka | string | Revenue/urban jurisdiction context | Pune City for pilot workflow |
| locality | string | Pilot locality/ward context | Kothrud / Kothrud-South |
| survey_number | string | Demo survey-style reference | Fictional demo value |
| gat_number | string/null | Gat reference | N/D for selected urban demo |
| hissa_number | string | Demo hissa/part | Fictional demo value |
| cts_number | string | City-survey-style reference | Fictional demo value |
| property_uid | string | Demo property UID | Fictional |
| area_m2 | number | Demo parcel area attribute | Fictional; not a cadastral geometry measurement |
| holder_demo | string | Demo record-holder | Fictional |
| land_type | string | Demo land/property type | Fictional attribute |
| zone | string | Demo planning zone | Fictional attribute based on workflow vocabulary |
| geometry | GeoJSON/null | Authorized parcel geometry | N/D until authorized geometry is imported |
| geometry_status | string | Geometry availability | N/D in seed |
| data_status | enum | Record completeness | AVAILABLE / PARTIAL / N/A / N/D |

## Source record

`government_source_records` contains category-level records with source provenance: source_id, source_name, department, source_url, source_type, retrieved_at, record_identifier, parcel_identifier, category, data_status, `is_fictional`, and payload JSON.

## ALU link

`parcel_alu_link` stores parcel-to-ALU relationships only after an authorized geometry is supplied. It records ALU ID, relationship type, intersection area, intersection percentage, geometry source, deterministic assignment method and confidence.

## Geography rule

The seed script never randomizes latitude/longitude and never inserts synthetic parcel polygons. Real geographic context is separated from fictional record-holder names, values, identifiers and workflow events.
