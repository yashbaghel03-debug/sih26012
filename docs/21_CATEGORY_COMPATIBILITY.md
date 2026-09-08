# 21-Category Compatibility

The canonical integration surface reserves the project's 21 information categories. Categories without a verified source record are represented explicitly as `N/D` or `N/A`; they are not filled with fake values.

| # | Category | Current Pune demo source/status |
|---:|---|---|
| 1 | ULPIN | N/D — no live government ULPIN imported |
| 2 | Cadastral map / parcel boundary | N/D — authorized parcel geometry not imported |
| 3 | Georeferenced satellite/base imagery | Available through existing WebGIS basemap, not parcel attribution |
| 4 | Record of Rights | Demo land-record record |
| 5 | Registration deeds / title chain | Demo registration record |
| 6 | Master plan / town layout | PARTIAL — planning workflow reference |
| 7 | Building plan permissions | Demo planning/building record |
| 8 | Completion / occupancy | N/A or N/D per demo record |
| 9 | Encumbrances / charges | Demo legal record |
| 10 | Bank mortgages / liens | Demo legal record on selected records |
| 11 | Land-use classification / zoning | Demo planning record |
| 12 | Utility infrastructure | Demo utility record |
| 13 | Property taxation / arrears | Demo municipal tax record |
| 14 | Valuation / circle rates | Demo property-tax valuation fields |
| 15 | Infrastructure networks / ROW | Demo utility/infrastructure record |
| 16 | Environmental buffers / forest zones | N/D — not retrieved for pilot |
| 17 | Restriction zones | N/D — not retrieved for pilot |
| 18 | Service linkages / welfare schemes | N/D — not retrieved for pilot |
| 19 | Litigation / court stays | Demo legal record; individual values may be N/D |
| 20 | Satellite / drone change detection | N/D — not retrieved for pilot |
| 21 | Workflow / transaction tracking | API workflow endpoint aggregates source records |

The Citizen Land Services portal is the integration demonstration surface. It aggregates the source-backed categories for a single canonical parcel and displays provenance.
