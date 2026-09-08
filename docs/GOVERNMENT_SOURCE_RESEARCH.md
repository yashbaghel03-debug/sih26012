# Government Source Research

Research date: **2026-09-09**.

## Maharashtra Land Records / Mahabhumi

Official reference: https://mahabhumi.gov.in/

Observed services include digitally signed 7/12, 8A, Ferfar, Property Card, e-Records, K-Prat, MH DIGI Maps, Mahabhunakasha, e-Hakk, mutation status and Find CTS/Survey Number. The Mahabhumi portal is described as a Revenue Department, Government of Maharashtra service. We reproduce the workflow concepts and field vocabulary, but the records in this repository are fictional demo records. Source: https://mahabhumi.gov.in/Mahabhumilink/LogIn/LogIn

## Maharashtra Bhulekh

Official reference: https://bhulekh.mahabhumi.gov.in/

Observed user flow asks for record type (7/12, 8A, Property Card, K-Prat), district, taluka, village, and supports Survey/Gat Number, name and an 11-digit Property UID workflow. The portal itself warns that displayed information is not for official/legal use. We use these fields as UI references, not as copied records. Source: https://bhulekh.mahabhumi.gov.in/

## Maharashtra jurisdiction / ULPIN

Official reference: https://mahavillages.mahabhumi.gov.in/newjurisdiction.php

Observed workflows include search by ULPIN, Property Card using CTS, Property Card using village, and 7/12 using Survey No. The jurisdiction grid includes Village/Peth, CTS, ULPIN, Property Card mutation jurisdiction, measurement jurisdiction and Sub-Registrar office. We reproduce those concepts. Source: https://mahavillages.mahabhumi.gov.in/newjurisdiction.php

## Bhu-Naksha

Official reference: https://bhunaksha.nic.in/bhunaksha/

Bhu-Naksha documents describe cadastral plot management, search by survey/hissa information and map/plot workflows. The implementation-status page lists Maharashtra. The public site states that Bhu-Naksha is designed for authorized state/UT users. Therefore this demo does **not** claim that public access to a Kothrud cadastral parcel dataset was verified. Source: https://bhunaksha.nic.in/bhunaksha/ and https://bhunaksha.nic.in/bhunaksha/implementationstatus.jsp

## Maharashtra Registration & Stamps

Official reference: https://igrmaharashtra.gov.in/

The suite models the observable idea of property-registration/document workflows without copying live personal data. Transaction parties, values and document identifiers in the demo are fictional.

## Pune Municipal Corporation / AutoDCR

Official reference: https://autodcr.pmc.gov.in/swc.client/

Public AutoDCR material exposes Advanced Search fields such as file/temporary number, applicant/architect, zone/ward, plot number and survey number. PMC AutoDCR also documents geo-tagging for plot identification where latitude/longitude can be picked from a GIS map. A published help manual shows GIS Information, Find Plot on Map, Survey No selection and plot polygon interaction. Sources: https://autodcr.pmc.gov.in/swc.client/ and https://autodcr.pmc.gov.in/SWC.Client/Downloads/AutoDC%20Web%20Portal/PT%20Assessment%20Form-%20manual%20%28For%20New%20feature%29.pdf

## Pune property-tax reference

Official municipal material confirms property-tax and water-tax accounting and the Pune municipal ecosystem includes property-tax workflows. This demo models property ID, tax number, assessment year, annual tax, arrears and payment status as fictional service data; no live taxpayer record is copied. Reference: https://opendata.pmc.gov.in/

## Research conclusion

The best compact pilot for the requested demonstration is Kothrud/Kothrud-South in PMC because it combines a documented urban GIS/building workflow with Maharashtra land-record/property-card/ULPIN workflows. The critical limitation is cadastral geometry access: without an authorized parcel dataset, the project must keep parcel geometry and government ULPIN values as N/D rather than invent them.
