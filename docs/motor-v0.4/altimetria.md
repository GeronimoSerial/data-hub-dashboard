# Altimetría escolar de Motor v0.4

Tarea T2 (U2 de `Motor v0.4/PLAN_IMPLEMENTACION.md`). Código: `lib/infraestructura/riesgo/motor-v04/altimetria.ts` (regla pura), `altimetria-csv.ts` (verificación del CSV), `altimetria-adaptador.ts` (puerto) y `lib/infraestructura/riesgo/jobs/importar-altimetria-v04.ts` (importador). Tabla: `infra_altimetria_escolar` (migración 0025).

## Regla

Por escuela se reciben dos p10 espaciales a 50 m: IGN MDE-Ar v2.1 (30 m) y Copernicus GLO-30 convertido a SRVN16.

1. Sin coordenadas → `pendiente` / `sin_coordenadas`.
2. Georreferencia marcada `revisar` por el control de departamento → `pendiente` / `revisar_georreferencia`.
3. Referencia vertical no comparable → ninguna fuente es admisible (`referencia_vertical_incompatible`).
4. Una fuente es admisible si su valor es finito: `null`, `NaN` e infinitos se excluyen; un `0` es válido.
5. Sin fuentes admisibles → `pendiente` / `sin_fuente_valida`.
6. Con fuentes admisibles → `candidata`:
   - `cotaPrincipalM` = Copernicus (la fuente del motor operativo); `null` con motivo `principal_sin_copernicus` si falta.
   - `cotaConservadoraM` = mínimo entre las admisibles; `fuenteConservadora` = `ign`, `copernicus` o `coincidentes`; `fuentesValidas` = 1 o 2.

Una fuente nunca entra por ser menor: sólo compiten las admisibles.

## Qué no es

- No es cota de piso ni de ingreso al edificio: `cotaIngresoEdificio` no se deriva del terreno.
- La conservadora no es más exacta: es un escenario identificado que baja el terreno cuando IGN queda por debajo de Copernicus.
- No es una distribución de error ni una probabilidad.

## Datum

- El terreno escolar queda en SRVN16 mediante una conversión **aproximada** de Copernicus (EGM2008 → GEOIDE-Ar16). La columna `conversion` lo registra.
- Los ceros de escala del INA (`cero_ign`) presumiblemente están en el datum histórico del IGN (SRVN71). La diferencia con SRVN16 queda como incertidumbre a reconciliar en T6; no se corrige en silencio.

## Importar y revertir

```bash
ALTIMETRIA_V04_CSV="/ruta/elevacion-conservadora-candidata.csv" node scripts/jobs.mjs importar-altimetria-v04
```

- La cabecera debe coincidir exactamente. La regla se recalcula por fila; si el estado, la cota (tolerancia 1e-6 m) o la fuente difieren del CSV, el archivo se rechaza completo con la lista de CUE.
- La versión es `altimetria-v04-<sha256[0:16]>`; reimportar el mismo archivo devuelve `ya_importado` sin escribir. Todas las filas se escriben en una transacción.
- Rollback: las versiones anteriores no se borran. El adaptador lee la versión con `importado_en` más reciente; para revertir se eliminan sólo las filas de la versión nueva (`WHERE version = '<nueva>'`) y la anterior vuelve a ser la vigente para el candidato. Las versiones previas nunca se borran.

Resultado del CSV del 2026-10-17 (2.005 filas): 1.994 candidatas (Copernicus 1.918, IGN 76), 7 `revisar_georreferencia`, 4 `sin_coordenadas`.
