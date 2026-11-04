# Natalidad data sources

## CGE enrollment
Run `node scripts/import-matricula-natalidad.mjs "<report.xlsx>"`; use `--help` for output paths.
The source covers CGE initial and primary education in 2021–2026, not the entire educational system.
Totals include schools without a spatial match. CUD counts are not published.
The enrollment selector is independent of the birth year. Missing data is not zero.
