# Importar servicios de comedor (MEC)

Carga en `infra_comedor_escuela` qué escuelas brindan desayuno y/o almuerzo, a partir de
las planillas "Servicios de Comidas" del MEC (xlsx, hoja `PlanillaServicioComedor`).
Los archivos no se versionan.

```bash
# 1. Validar sin escribir (resumen + filas rechazadas)
node scripts/importar-comedores.mjs planilla1.xlsx planilla2.xlsx --dry-run

# 2. Importar (reemplaza toda la tabla en una transacción)
DATABASE_URL=postgres://... node scripts/importar-comedores.mjs planilla1.xlsx planilla2.xlsx
```

Reglas:
- Se lee por nombre de columna (`Cue-Anexo`, `Proveedor`, `Raciones Desayuno`, `Raciones Almuerzo`);
  encabezado en la fila 3, datos desde la fila 4.
- CUE normalizado con `normalizeCue`; filas sin CUE-anexo válido se informan como rechazadas y no se corrigen.
- Servicio = raciones > 0. Un CUE repetido (dentro de un archivo o entre archivos) suma raciones.
- Una escuela sin fila se muestra como "sin servicio registrado": no se afirma que no haya comedor.
