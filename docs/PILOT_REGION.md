# Pune Pilot Region

## Selected region

**Kothrud / Kothrud-South, Pune Municipal Corporation, Pune district, Maharashtra** is the pilot footprint for the seven mock-government portals.

The selection is based on source coverage rather than locality fame. Public PMC AutoDCR material exposes property-search and GIS workflows involving plot number, survey number, and geo-tagged plot coordinates; public AutoDCR examples also expose Kothrud-South as a property-address jurisdiction. A Maharashtra government pollution-control report publishes a Pune ward map including the Kothrud ward. These make Kothrud a useful small urban pilot for land-record, municipal planning and property-tax style integration. urlPMC AutoDCR search/workflowhttps://autodcr.pmc.gov.in/swc.client/

## Source availability

| Area | Result | Notes |
|---|---|---|
| Administrative context | AVAILABLE | Pune district / PMC / Kothrud ward context can be verified from public government material. |
| 7/12 / 8A / Property Card workflow | AVAILABLE | Mahabhumi/Bhulekh publicly exposes these services and search fields. |
| Survey/Gat / CTS workflow | AVAILABLE | Mahabhumi and Mahavillages expose these search concepts. |
| ULPIN workflow | AVAILABLE | Mahavillages exposes ULPIN search and jurisdiction fields. |
| Bhu-Naksha Maharashtra | AVAILABLE | Bhu-Naksha lists Maharashtra as an implementation state and its Maharashtra guide describes survey/hissa/map workflows. |
| PMC building/GIS workflow | AVAILABLE | AutoDCR publicly documents survey, plot, latitude/longitude and GIS map workflows. |
| Municipal property-tax structure | PARTIAL | PMC public material establishes property-tax and assessment context, but no live parcel dataset is imported into this demo. |
| Authorized cadastral parcel polygons | N/D | Bhu-Naksha is a cadastral management system for authorized state users; a public, reusable Kothrud parcel download was not verified during this implementation. |
| Government ULPIN values for demo parcels | N/D | Live government identifiers are not copied into fictional records. |

## Geography policy

No parcel polygon is invented in the Pune seed dataset. The canonical demo parcel table therefore starts with `geometry = NULL` and `geometry_status = N/D`. When an authorized/public cadastral Polygon/MultiPolygon is later supplied, the API can store it in PostGIS and deterministically assign the project's ALU from the existing lattice.

## Key references researched

- Maharashtra Mahabhumi: https://mahabhumi.gov.in/
- Maharashtra Bhulekh: https://bhulekh.mahabhumi.gov.in/
- Maharashtra jurisdiction / ULPIN workflow: https://mahavillages.mahabhumi.gov.in/newjurisdiction.php
- Bhu-Naksha: https://bhunaksha.nic.in/bhunaksha/
- Pune PMC AutoDCR: https://autodcr.pmc.gov.in/swc.client/
- Pune AutoDCR GIS/property-tax help manual: https://autodcr.pmc.gov.in/SWC.Client/Downloads/AutoDC%20Web%20Portal/PT%20Assessment%20Form-%20manual%20%28For%20New%20feature%29.pdf

Research checked: 2026-09-09.
