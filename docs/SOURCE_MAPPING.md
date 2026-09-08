# Source Mapping

All seven mock portals use one common PostGIS-backed API. Government source URLs are references for workflow/field design; seeded records are fictional.

| Mock source | Government reference | Main reproduced fields |
|---|---|---|
| `MH_LAND_RECORDS` | Mahabhumi / Bhulekh | District, Taluka, Village/Peth, Survey/Gat, Hissa, ULPIN, Property UID, record type, area, holder, Ferfar |
| `MH_JURISDICTION` | Mahavillages ULPIN/Jurisdiction | ULPIN, CTS, Survey/Gat, Village/Peth, Taluka/Office, Sub-Registrar jurisdiction |
| `BHUNAKSHA_MH` | Bhu-Naksha | Survey No, Hissa No, plot/map search, cadastral geometry reference |
| `MH_REGISTRATION` | Maharashtra Registration & Stamps | Deed No, registration date, document type, Survey/CTS reference, SRO, transaction/market/consideration values |
| `PMC_BUILDING` | PMC AutoDCR | Proposal No, Property ID, Survey No, Plot No, Land Use, Proposal Type, Building Use, Floors, GIS, application status |
| `PMC_PROPERTY_TAX` | PMC property-tax ecosystem | Property ID, tax number, address, ward/zone, survey/plot, type, usage, built-up area, assessment year, tax, arrears, payment status |
| `UTILITY_INFRA` | Municipal/utility reference | Electricity, water, sewerage, drainage, road, ROW, proximity, infrastructure project |
| `LEGAL_ENCUMBRANCE` | Registration/court/charge reference | Encumbrance, mortgage, lien, court stay, litigation, restriction, transaction hold |

## Status semantics

- `AVAILABLE`: data is present in the demo source.
- `PARTIAL`: some expected fields/categories are present.
- `N/A`: category does not apply to the record.
- `N/D`: category should apply, but the information is not publicly verified/retrieved for the demo.

## Provenance rule

Every returned source record carries `source_id`, `source_name`, department, source URL, source type, record identifier, data status and `is_fictional=true`. ALU is separately identified as the project spatial index and never as a government identifier.
