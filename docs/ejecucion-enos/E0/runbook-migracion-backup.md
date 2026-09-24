# Runbook — migración aditiva, backup y restore (E0)

Batch E0 del plan de ejecución ENOS 2026/2027. Cubre el §6-E0 (procedimiento
de migración aditiva versionada, backup consistente y restore) y el §7
(instalación vacía/upgrade, reejecutar migración no altera filas, backup
restaurado permite leer un parte).

## Migración aditiva versionada

Este repositorio no usa `drizzle-kit migrate` en runtime. Toda tabla nueva se
agrega directamente al bloque `HUB_DDL` en `lib/db/seed.ts` — es la única
convención de migración del repo, documentada en un comentario en ese mismo
archivo ("seguí agregando tablas acá mismo, nunca en un segundo bloque de
DDL"). `infra_job_run` (E0) se agregó siguiendo esa convención.

`ensureSeeded()` (llamada al inicio de cada route handler) ejecuta `HUB_DDL`
contra la base en cada arranque. Cada sentencia usa `CREATE TABLE IF NOT
EXISTS` / `CREATE INDEX IF NOT EXISTS`, así que:

- **Instalación vacía**: crea todas las tablas desde cero.
- **Upgrade sobre una instalación existente**: las tablas ya creadas se
  ignoran; sólo se crean las nuevas. No hay `DROP` ni `ALTER` destructivo en
  el flujo normal.
- **Reejecutar la migración no altera filas existentes**: es el contrato que
  verifica `lib/db/seed.test.ts` (`describe('HUB_DDL sobre una base ya
  poblada')`), que puebla la base, reaplica `HUB_DDL` dos veces más y
  confirma que ningún conteo de filas cambia. Ese test es el gate de
  regresión obligatorio antes de aceptar cualquier cambio a `HUB_DDL`.

**Rollback preferido**: revertir el deploy (código/flags), dejando las tablas
aditivas sin usar. No se hace `DROP TABLE` como mecanismo de rollback: una
tabla aditiva no usada no rompe el comportamiento anterior.

## Backup consistente

Script: `scripts/backup-sqlite.mjs`. Ejecuta `VACUUM INTO '<destino>'` en una
sola sentencia SQL contra la base origen, usando `@libsql/client`. `VACUUM INTO`
es la forma nativa recomendada de sqlite para backups: produce un archivo
íntegro y consistente en un único paso atómico, sin necesidad de un checkpoint
manual previo ni de `copyFileSync`. Esto es lo que lo hace seguro bajo
escritura concurrente: aunque la app siga escribiendo y disparando
auto-checkpoints mientras el backup corre, la sentencia lee un snapshot
consistente y escribe el destino en un solo paso, así que el backup nunca
queda con páginas mezcladas. El enfoque anterior (checkpoint WAL +
`copyFileSync`) tenía una ventana real: si la app disparaba un auto-checkpoint
mientras se copiaba el archivo, el backup podía quedar con páginas mezcladas
(corrupto) y eso sólo se descubría al restaurar.

Uso:

```bash
node scripts/backup-sqlite.mjs [sqlitePath] [destinoDir]
# valores por defecto: ${DATA_DIR}/hub.sqlite y ${DATA_DIR}/backups
```

Genera un archivo `hub-<timestamp-ISO>.sqlite` en `destinoDir` y devuelve su
ruta por stdout.

**Cuándo correrlo**: antes de cada despliegue que modifique `HUB_DDL` (agregue
una tabla nueva), y como rutina periódica independiente del deploy.

## Restore

Script: `scripts/restore-sqlite.mjs`. Copia el backup elegido sobre la base
operativa y elimina archivos `-wal`/`-shm` huérfanos del destino previo (para
que no queden mezclados con el archivo restaurado).

Uso:

```bash
node scripts/restore-sqlite.mjs <ruta-backup> [sqlitePath]
# sqlitePath por defecto: ${DATA_DIR}/hub.sqlite
```

**Advertencia**: restaurar un backup pierde toda escritura posterior al
momento del backup (ventana de pérdida). Por eso el restore:

- Sólo debe ejecutarse dentro de una ventana de mantenimiento, con el
  servicio Next y los jobs de infraestructura detenidos.
- Exige reconciliación manual de cualquier escritura ocurrida entre el
  backup y el restore (partes, verificaciones, episodios cargados en ese
  intervalo), tal como exige el plan de ejecución ENOS §7. El script no
  reconcilia nada por sí mismo.
- Asume un único host sin escrituras concurrentes durante la operación
  (documentado también en el propio script); no hay coordinación de locks
  entre procesos.

## Pendiente

El ensayo de este procedimiento contra un entorno de **staging real** queda
**pendiente**: el host de staging/producción no está definido en este batch
(el plan de ejecución ENOS §1 lo deja explícito — no se asume conocido).
Cuando ese host exista, el ensayo consiste en correr, en ese orden:

```bash
node scripts/backup-sqlite.mjs
# (simular o esperar una escritura real, o continuar directamente)
node scripts/restore-sqlite.mjs <ruta-backup-generada-arriba>
```

y verificar manualmente que, tras el restore, se puede abrir un parte real
existente desde la UI (aceptación explícita del §6-E0: "backup restaurado
permite abrir un parte"). Este ensayo no se puede ejecutar ni simular sin ese
host; queda registrado como pendiente explícito, sin dueño de fecha porque
depende de una decisión de infraestructura fuera del alcance de E0.
