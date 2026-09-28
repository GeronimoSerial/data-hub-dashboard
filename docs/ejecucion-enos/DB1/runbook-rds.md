# Runbook — PostgreSQL en RDS: configuración, cutover y rollback (DB1/F5)

Batch DB1 del plan de ejecución ENOS 2026/2027. Cubre la puesta en marcha de
la base PostgreSQL administrada (RDS), el cutover desde la base SQLite
operativa y el rollback. Reemplaza como referencia operativa al runbook de
E0 (`docs/ejecucion-enos/E0/runbook-migracion-backup.md`) en lo que respecta
a backup/restore: allí el motor era SQLite; acá es PostgreSQL y el backup
consistente es `scripts/backup-postgres.mjs`.

**Alcance de este documento**: es un procedimiento, no una ejecución. Todos
los valores de conexión son **placeholders explícitos** (`<...>`). No hay
URLs, endpoints, nombres de cuenta/KMS ni credenciales reales. Ningún paso
de AWS se ejecuta desde este runbook.

Convenciones de placeholders usados abajo:

- `<RDS_ENDPOINT>`: host del endpoint de escritura (writer) de la instancia.
- `<DB_NAME>`: nombre de la base (p. ej. `enos_hub`).
- `<APP_USER>` / `<APP_PASSWORD>`: usuario de aplicación con privilegios mínimos.
- `<MIGRATOR_USER>` / `<MIGRATOR_PASSWORD>`: usuario admin/migraciones.
- `<KMS_KEY_ID>`: clave KMS de cifrado en reposo.
- `<SQLITE_PATH>`: ruta de la base SQLite anterior (`${DATA_DIR}/hub.sqlite`).
- `<RDS_SG_ID>`: security group asociado a la instancia.

La cadena de conexión se construye como
`postgresql://<APP_USER>:<APP_PASSWORD>@<RDS_ENDPOINT>:5432/<DB_NAME>` y se
entrega a la app por la variable de entorno `DATABASE_URL` (ver
`.env.example`).

---

## 1. Instancia RDS

### Motor y versión

- **Motor**: PostgreSQL **16** (misma major que el contenedor de los tests y
  que la expectativa de `pg_dump`/`pg_restore`; ver §8).
- **Clase**: dimensionar según la demo productiva. Como referencia, la
  instancia debe absorber el pool de la app (§1.4) con margen, no sólo el
  tráfico nominal.

### Cifrado en reposo

- Habilitar **cifrado en reposo con KMS** (`<KMS_KEY_ID>`). En RDS esto es
  un atributo de creación de la instancia y no se puede cambiar después.
- Cifrar también **snapshots y backups automáticos** con la misma clave.
- Cifrado en tránsito: obligatorio; ver `rds.force_ssl` en §1.4.

### Backups automáticos

- **Retención en días**: `BACKUP_RETENTION_DAYS >= 7` (recomendado 7–35;
  a mayor retención, mayor costo de almacenamiento de snapshots).
- **Ventana de backup**: `BACKUP_WINDOW` en una franja de baja actividad
  (hora del servidor; conviene fijarla y no dejar `preferred`, para que sea
  predecible y no se solape con el pico). El backup automático de RDS es un
  snapshot de almacenamiento, complementario —no reemplaza— al `pg_dump`
  lógico de §8.
- **Ventana de mantenimiento**: `MAINTENANCE_WINDOW` fuera de la ventana de
  backup y de baja actividad.
- Recomendado: habilitar **Point-In-Time Recovery (PITR)**, que viene con los
  backups automáticos; permite restaurar a un instante dentro de la ventana
  de retención.

### Alta disponibilidad

- **Multi-AZ**: recomendado para producción. Da failover automático ante
  fallo de la AZ primaria. Costo: duplica la instancia. Si la demo prod no
  justifica Multi-AZ, documentar la decisión y la ventana de indisponibilidad
  aceptada ante un fallo de AZ.

### Parameter group (parámetros clave)

Fijar un parameter group propio (no `default.postgres16`) con al menos:

| Parámetro | Valor sugerido | Motivo |
|---|---|---|
| `rds.force_ssl` | `1` | SSL obligatorio en todas las conexiones. Combinar con `sslmode=require`/CA propia en el cliente (§1.5). |
| `statement_timeout` | `30000` (30 s) — **alineado a `DATABASE_STATEMENT_TIMEOUT_MS`** | El pool de la app ya aplica `statement_timeout` por conexión (`lib/db/config-postgres.ts`); el parameter group actúa como red de seguridad del lado servidor para conexiones que no lo seteen. Deben coincidir. |
| `max_connections` | **alineado al pool de la app** | `DATABASE_POOL_MAX` (default efectivo de `pg`: 10) × cantidad de instancias de app + conexiones de admin/migración y monitoreo. Fijar `max_connections` por encima de ese total con margen, o el pool se queda sin conexiones bajo carga. |

### Conexión TLS desde la app

El cliente resuelve SSL en `lib/db/config-postgres.ts` (`resolveSslConfig`):

- `DATABASE_SSL_CA_PATH` → valida contra un CA propio (TLS estricto).
- `PGSSLMODE=require` / `DATABASE_SSL=require` / host `*.rds.amazonaws.com`
  → TLS sin validar CA (el bundle de RDS no siempre está en el store de Node).
- `DATABASE_SSL=true` → TLS validando.

Para producción se recomienda **CA propia** (`DATABASE_SSL_CA_PATH` apuntando
al bundle de RDS descargado y versionado fuera del repo), no TLS sin validar.

---

## 2. Usuario de aplicación con privilegios mínimos

Objetivo: la app corre con `<APP_USER>`, que **nunca** debe ser superusuario
ni dueño de los schemas. Las migraciones y cambios de DDL los corre un usuario
separado `<MIGRATOR_USER>`.

### Usuario de aplicación (`<APP_USER>`)

- `NOSUPERUSER NOCREATEDB NOCREATEROLE` y sin `CREATE` sobre la base ni sobre
  los schemas.
- Sólo sobre los schemas **`public`** y **`ge`** (este último corresponde al
  schema PostgreSQL separado al que migra `ge.sqlite`; ver F2 en
  `docs/ejecucion-enos/DB1/registro.md`).

```sql
-- Ejecutado como admin/migraciones, una sola vez.
CREATE ROLE <APP_USER> LOGIN PASSWORD '<APP_PASSWORD>'
  NOSUPERUSER NOCREATEDB NOCREATEROLE;

GRANT CONNECT ON DATABASE <DB_NAME> TO <APP_USER>;

GRANT USAGE ON SCHEMA public TO <APP_USER>;
GRANT USAGE ON SCHEMA ge     TO <APP_USER>;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES    IN SCHEMA public TO <APP_USER>;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES    IN SCHEMA ge     TO <APP_USER>;
GRANT USAGE, SELECT                  ON ALL SEQUENCES IN SCHEMA public TO <APP_USER>;
GRANT USAGE, SELECT                  ON ALL SEQUENCES IN SCHEMA ge     TO <APP_USER>;

-- Aplica también a objetos creados en el futuro por el rol migrador.
ALTER DEFAULT PRIVILEGES FOR ROLE <MIGRATOR_USER> IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES    TO <APP_USER>;
ALTER DEFAULT PRIVILEGES FOR ROLE <MIGRATOR_USER> IN SCHEMA public
  GRANT USAGE, SELECT                  ON SEQUENCES TO <APP_USER>;
ALTER DEFAULT PRIVILEGES FOR ROLE <MIGRATOR_USER> IN SCHEMA ge
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES    TO <APP_USER>;
ALTER DEFAULT PRIVILEGES FOR ROLE <MIGRATOR_USER> IN SCHEMA ge
  GRANT USAGE, SELECT                  ON SEQUENCES TO <APP_USER>;
```

No otorgar `TRUNCATE`, `REFERENCES`, `TRIGGER` ni `CREATE` al usuario de
aplicación. Si la app necesita ejecutar funciones, otorgar `EXECUTE` sólo
sobre esas funciones, no el `EXECUTE` global de `PUBLIC`.

### Usuario admin/migraciones (`<MIGRATOR_USER>`)

- Es el dueño de los schemas y de las tablas.
- **Sí necesita `CREATE`** (sobre la base y sobre los schemas `public` y `ge`),
  porque drizzle-kit/migrator ejecuta DDL: `CREATE TABLE`, `ALTER TABLE`,
  `CREATE INDEX`, etc.
- Usar este usuario sólo durante migraciones; la app en runtime usa
  `<APP_USER>`. La diferencia de rol es la barrera que evita que un bug de la
  app altere el schema.

---

## 3. Migraciones de schema

Las migraciones versionadas viven en `drizzle/` (generadas por drizzle-kit
desde `lib/db/schema.ts`). Se aplican con `migrarDb()` en `lib/db/index.ts`:

- Si `resolveDriver()` devuelve `'postgres'` (hay `DATABASE_URL`), usa
  `drizzle-orm/node-postgres/migrator` contra el `pg.Pool`.
- La carpeta de migraciones es `./drizzle`.
- Es **idempotente**: drizzle lleva su tabla `drizzle.__drizzle_migrations` y
  sólo aplica lo pendiente.

**Cuándo corre**: `migrarDb()` se invoca al arrancar la app (bootstrap). El
usuario de ese arranque debe ser `<MIGRATOR_USER>` (necesita `CREATE`). Si se
prefiere no dar `CREATE` en runtime, correr la migración como paso separado
del deploy con `<MIGRATOR_USER>` y arrancar la app después con `<APP_USER>`;
en ese caso `migrarDb()` no encontrará migraciones pendientes y el `CREATE`
no será necesario.

**Verificación previa**: antes de un cutover, correr el migrator contra la
base RDS con `<MIGRATOR_USER>` y confirmar que termina sin error; recién
después arrancar la app apuntando a `<APP_USER>`.

---

## 4. Migración de datos

El script de migración de datos es **`scripts/migrar-sqlite-a-postgres.mjs`**,
implementado por **F4 en paralelo**. Este runbook **no lo define ni lo
escribe**: sólo lo usa.

Propiedades que debe cumplir (contrato esperado):

- **Idempotente**: poder re-ejecutarlo sin duplicar filas.
- **Verificación de conteos por tabla**: para cada tabla migrada, comparar
  el conteo de origen (SQLite) contra el destino (Postgres) y fallar ruidoso
  si no coinciden.
- Se ensaya sobre una **copia** de la demo, nunca sobre el original.

**Criterio de habilitación del cutover**: todos los conteos por tabla deben
coincidir origen↔destino. Si hay diferencias, no se avanza al cutover hasta
reconciliarlas.

---

## 5. Cutover con ventana de mantenimiento

Prerrequisitos: instancia RDS creada y en estado `available` (§1), usuarios y
grants aplicados (§2), schema migrado (§3), script de datos de F4 disponible
y ensayado (§4). Todo lo siguiente ocurre dentro de una **ventana de
mantenimiento** anunciada, con el servicio detenido.

Pasos, en orden:

1. **Anunciar y abrir la ventana de mantenimiento.** Detener la entrada de
   tráfico (mantenimiento en el balanceador/portal, o baja temporaria del
   servicio).
2. **Detener escrituras y el servicio.** Frenar la app Next y los jobs de
   infraestructura para que no haya escrituras nuevas sobre SQLite. Si el
   proceso sigue arriba, cualquier escritura posterior al backup del paso 3
   se pierde.
3. **Backup SQLite como red de seguridad final.**
   `node scripts/backup-sqlite.mjs <SQLITE_PATH> <dir-destino>` y conservar
   la ruta impresa por stdout. Es el punto de recuperación ante un rollback
   (§7).
4. **Correr la migración de datos.**
   `node scripts/migrar-sqlite-a-postgres.mjs <SQLITE_PATH> <DATABASE_URL_admin>`
   (argumentos exactos según F4), con `<MIGRATOR_USER>`.
5. **Verificar conteos por tabla** (§4). Si no coinciden, abortar y volver al
   paso 3 con la ventana todavía abierta (o aplicar rollback §7).
6. **Cambiar `DATABASE_URL`** al endpoint RDS de escritura con `<APP_USER>`:
   `postgresql://<APP_USER>:<APP_PASSWORD>@<RDS_ENDPOINT>:5432/<DB_NAME>`.
   Ajustar además `DATABASE_SSL`/`PGSSLMODE`/`DATABASE_SSL_CA_PATH` según §1.5.
   **No** versionar credenciales: setearlas por el gestor de secretos del
   entorno de despliegue.
7. **Redeploy** de la aplicación con la nueva `DATABASE_URL`.
8. **Smoke test** (§6). Si falla, aplicar rollback (§7) sin reanudar tráfico.
9. **Reanudar el servicio** y cerrar la ventana de mantenimiento.

---

## 6. Verificación post-cutover

Con la app ya sobre RDS:

- **La app levanta**: sin errores de conexión/SSL en el arranque de Next.
- **Operación de escritura/lectura real**: crear un **parte de prueba** desde
  la UI y volver a abrirlo, confirmando que se lee el mismo dato creado
  (aceptación análoga a la de E0: "backup restaurado permite abrir un parte").
- **Backup lógico contra la RDS real**: correr
  `DATABASE_URL='postgresql://<APP_USER>:<APP_PASSWORD>@<RDS_ENDPOINT>:5432/<DB_NAME>' node scripts/backup-postgres.mjs <dir-destino>`
  y confirmar que genera el `.dump` y que pasa `pg_restore --list` con salida
  no vacía (es la verificación que ya automatiza
  `scripts/backup-postgres.test.ts` contra un contenedor; acá se repite contra
  la instancia real).
- **Conteos**: re-confirmar los conteos por tabla del origen SQLite contra
  RDS una vez cerrada la ventana, para detectar cualquier escritura perdida
  durante el cutover.

---

## 7. Rollback a SQLite

Se aplica si el smoke test (§6) falla o si la app no es estable sobre RDS.

1. Volver `DATABASE_URL` a la configuración SQLite anterior (sin `DATABASE_URL`
   postgres, o con la ruta `<SQLITE_PATH>` según cómo resuelva el driver en el
   deploy previo).
2. **Redeploy de la versión previa** del código (la que corre sobre SQLite).
3. Reanudar el servicio.

**Ventana de pérdida de datos**: cualquier escritura hecha ya contra
PostgreSQL durante la ventana de cutover (pasos 6–8 de §5) **no vuelve sola a
SQLite**. El rollback deja la base SQLite en el estado del backup del paso 3
(§5), por lo que esas escrituras se pierden salvo **reconciliación manual**
(p. ej. re-cargar partes o verificaciones creadas en ese intervalo contra la
base SQLite restaurada). Es el mismo patrón —y la misma advertencia— que
`docs/ejecucion-enos/E0/runbook-migracion-backup.md`: el restore no
reconcilia nada por sí solo. Por eso la ventana de cutover debe ser lo más
corta posible y con escrituras detenidas (§5, paso 2).

---

## 8. Monitoreo

### Métricas de RDS a vigilar

- **`CPUUtilization`**: sostenido alto sugiere queries costosas o falta de
  índices, no sólo carga.
- **`FreeStorageSpace`**: tendencia decreciente hacia el umbral de cero;
  alertar con margen (autoscaling de storage si está disponible).
- **`DatabaseConnections`**: comparar contra `max_connections` del parameter
  group (§1.4). Cerca del techo ⇒ riesgo de agotamiento del pool.
- **`ReadLatency` / `WriteLatency`**: degradación sostenida antes de que se
  note en la app.
- **`FreeableMemory`**: presión de memoria en la instancia.

### Señales de la app (logs)

- **Timeouts de `statement_timeout`**: si aparecen, hay queries que superan
  `DATABASE_STATEMENT_TIMEOUT_MS` (default 30000 ms). Revisar la query, no
  sólo subir el timeout.
- **Agotamiento del pool**: errores de conexión/timeout al adquirir del
  `pg.Pool` (`connectionTimeoutMillis`, default 5000 ms). Suele correlacionar
  con `DatabaseConnections` pegado al techo o con queries lentas que retienen
  conexiones.

---

## 9. Health check de la base

**Estado: PENDIENTE.**

No existe hoy ningún endpoint de salud/health en `app/api`. Verificado:
el árbol de `app/api` sólo expone rutas de dominio (`auth`, `gate`, `hub`,
`infraestructura`, `mapas`, `problematicas`, `recursos`, `taxonomia`,
`usuarios`) y una búsqueda de `health`/`healthz`/`readiness`/`liveness` en
`app/` y `lib/` no arroja ningún handler de salud. Sin endpoint, la
verificación de conectividad del §6 se hace con el smoke test y con el backup
lógico, no con un probe.

Queda anotado como pendiente explícito: si se quiere un health check real
(que verifique conexión a la base, no sólo que Next responda), hay que
implementarlo **fuera del alcance de F5**. Concretamente, un
`app/api/health/route.ts` que haga una query trivial (p. ej. `SELECT 1`) por
el pool y devuelva 503 si falla, para engancharlo al health check del
balanceador/RDS.
