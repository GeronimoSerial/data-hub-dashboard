# Radar: producción como único productor

`scripts/replicar-radar-meteo.mjs` copia `radar_meteo_run`,
`radar_meteo_ensemble_run` y `radar_meteo_verificacion` desde `hub_prod` hacia
`hub_staging` o `hub_dev`, sin consultar Open-Meteo. Exige tanto los nombres
indicados en las URLs como los devueltos por las conexiones reales.

La lectura usa una transacción read-only con snapshot consistente; la escritura
usa otra transacción que serializa réplicas concurrentes. Actualiza por clave de
idempotencia o por fecha/departamento. Conserva IDs, estados, fechas y payloads.
Purga del destino los registros anteriores a 14 días y no elimina registros
recientes ausentes del origen. Producción conserva su retención actual:
14 días de runs y dos años de verificaciones. La réplica de verificaciones
sólo conserva 14 días (por fecha calendario).

Configurar en ambos consumidores:

```dotenv
RADAR_SYNC_ENABLED=false
RADAR_SOURCE_DATABASE_URL=postgresql://lector:clave@host/hub_prod
```

Usar un usuario de origen con permisos SELECT únicamente sobre las tres tablas,
conectividad desde ambos consumidores y TLS según `DATABASE_SSL`/`PGSSLMODE`.
La base destino debe tener el esquema vigente antes de replicar; el script no
migra ni siembra bases. No depende de `ENOS_JOBS_ENABLED`, que dev puede mantener
en `false`. `RADAR_SYNC_ENABLED=false` bloquea en `jobs.mjs` los tres productores,
incluidos los disparos manuales, antes de cargar módulos o migrar. No afecta
`sync-smn-alertas`, los otros jobs de riesgo ni la réplica.

## Verificación y reversión del código

`npx vitest run scripts/replicar-radar-meteo.test.ts scripts/jobs.test.ts scripts/jobs.migracion-legacy.test.ts`
pasó 50 tests. La réplica ejecuta SQL contra dos instancias PGlite y cubre upsert,
actualización, retención, lotes, origen vacío y rollback. Los comandos reales
`node scripts/jobs.mjs <job>` con `RADAR_SYNC_ENABLED=false` y
`ENOS_JOBS_ENABLED=true` devolvieron `radar_sync_deshabilitado` para los tres
productores sin abrir la base. TypeScript (`tsc --noEmit --incremental false`) y
ESLint de los archivos modificados pasaron.

La reversión del código se limita al script de réplica, su módulo y tests, el
gate en `jobs.mjs` y sus variables de ejemplo. No requiere revertir otros jobs.
