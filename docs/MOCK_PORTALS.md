# Seven Pune Mock Portals

All portals are independent static websites under `frontend/mock_government_portals/` and use the same FastAPI/PostGIS backend. Each page carries a visible demo/fictitious-data warning and does not copy official logos or seals.

1. `land_records/` — 7/12, 8A, Property Card, Ferfar workflow.
2. `registration/` — deed/document and registration workflow.
3. `planning_building/` — proposal, land-use, building and GIS workflow.
4. `property_tax/` — municipal property-tax and valuation workflow.
5. `utilities_infrastructure/` — water, electricity, sewerage, drainage, roads and ROW context.
6. `legal_encumbrance/` — encumbrance, mortgage, lien, litigation and restrictions.
7. `citizen_land_services/` — integrated parcel view across all source categories.

Each portal has its own `index.html`, `style.css` and `script.js`, while a small shared client (`common.js`/`common.css`) provides API, navigation and table rendering helpers.

Example routes when served from `frontend/` on port 3000:

- `/mock_government_portals/land_records/`
- `/mock_government_portals/registration/`
- `/mock_government_portals/planning_building/`
- `/mock_government_portals/property_tax/`
- `/mock_government_portals/utilities_infrastructure/`
- `/mock_government_portals/legal_encumbrance/`
- `/mock_government_portals/citizen_land_services/`

The landing page is `/mock_government_portals/`.
