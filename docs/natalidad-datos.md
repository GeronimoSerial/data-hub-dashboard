# Natalidad data sources

## CGE enrollment
Run `node scripts/import-matricula-natalidad.mjs "<report.xlsx>"`; use `--help` for output paths.
The source covers CGE initial and primary education in 2021–2026, not the entire educational system.
Totals include schools without a spatial match. CUD counts are not published.
The enrollment selector is independent of the birth year. Missing data is not zero.

## RENAPER births
Run `node scripts/extract-renaper-natalidad.mjs`; use `--help` for browser and output options.
The independent public snapshot covers Corrientes and its 25 departments in 2012–2025, source cutoff September 2026.
It counts RENAPER-identified births and does not replace or extend the DEIS choropleth series.
Provincial totals are independent: yearly reconciliation differences remain visible and are never redistributed.

## Active map source
RENAPER 2012–2025 is selected by default, including the choropleth, year/variation controls, popups and statistics. The initial year is 2025.
The source selector switches both tabs together; DEIS remains an independent 2014–2023 alternative. A RENAPER loading failure is explicit and never silently replaces it with DEIS.
School metadata and matrícula remain unchanged across sources. Province totals come from the independent source series, not the departmental sum.
