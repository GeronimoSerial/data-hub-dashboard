# Despliegue en producción (Coolify + GHCR)

Guía operativa del hub Next.js que sirve `analisis.sistemas.mec.gob.ar`. **`main` es la rama principal
pero no despliega nada. `prod` despliega producción y `staging` despliega
`staging.analisis.sistemas.mec.gob.ar`.**

## Referencia

| Campo | Valor |
| --- | --- |
| Propietario GitHub | `GeronimoSerial` |
| FQDN | `analisis.sistemas.mec.gob.ar` |
| App Coolify producción (UUID) | `pts681lz0kazhs1dph8wjaxt`, renombrada `data-hub-dashboard` (el UUID no cambió). |
| App Coolify staging (UUID) | `j3zm0co4bi9iy0c70nv3vinf` (`data-hub-dashboard-staging`, entorno `staging` del proyecto `data-hub-dashboard`), FQDN `staging.analisis.sistemas.mec.gob.ar`, imagen `:staging`, límites `1024m` sin swap. |
| Límites por contenedor | `limits_memory=1536m`, `limits_memory_swap=1536m` (swap cero a propósito), `limits_memory_reservation=256m` |
| Imagen nueva (este repo) | `ghcr.io/geronimoserial/data-hub-dashboard` |
| Imagen de rollback | el tag `<sha>` anterior de `ghcr.io/geronimoserial/data-hub-dashboard` |

La imagen GHCR se publica automáticamente al hacer push a `prod` o `staging` (workflow `.github/workflows/ghcr.yml`): `prod` publica `latest` y `staging` publica `staging`, ambos además con el tag `<sha>`. Un push a `main` no publica ni despliega. El job corre en el Environment de GitHub `production` o `staging`, y cada uno solo acepta su rama (`prod` y `staging`, respectivamente). El nombre se fuerza a minúsculas: `ghcr.io/geronimoserial/data-hub-dashboard`.

Repositorio GitHub: **privado** `GeronimoSerial/data-hub-dashboard`. El paquete GHCR queda privado; Coolify autentica el pull con un PAT classic `read:packages` en el `docker login` del host (los tokens `gho_` de OAuth no sirven para pull).

## Alcance de esta imagen

- Sirve el hub Next.js en el puerto **3000** (modo `standalone`).
- El visor MapLibre de matrícula está en `/mapas/matricula`.
- Los datos estáticos del mapa (`/data/*.geojson`, worker MapLibre) van empaquetados en `public/` dentro de la imagen.
- **Reportes** y **Administración** siguen existiendo como rutas, pero **no aparecen en la barra de navegación**, definida en `components/app-shell.tsx`. Los reportes con Postgres del stack Fastify **no** están en esta imagen.

## Datos persistentes

Coolify debe montar un volumen en `/data`. Con `DATABASE_URL` configurada, el hub usa Postgres mediante Drizzle; sin ella usa PGlite embebido y persiste sus archivos en `DATA_DIR/pg` (por defecto `./.data/pg`). `DATA_DIR` también contiene uploads y exportaciones locales. Las migraciones Drizzle se empaquetan en la imagen.

| Variable | Uso |
|----------|-----|
| `DATA_DIR` | Directorio persistente, normalmente `/data`. |
| `DATABASE_URL` | URL de Postgres; ausente, selecciona PGlite. |
| `PGLITE_DATA_DIR` | Ruta PGlite persistida opcional; por defecto `DATA_DIR/pg`. |
| `BETTER_AUTH_SECRET` | Secreto de sesión de Better Auth. |
| `BETTER_AUTH_URL` | URL pública del FQDN. |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Usuario inicial, solo primer seed. |
| `DEMO_OK` | Confirmación `1` requerida por el seed de demostración. |
| `NOMINAL_ENCRYPTION_KEY` | **Obligatoria.** 32 bytes en base64 (`openssl rand -base64 32`). Cifra la identidad de los alumnos con AES-256-GCM. Sin ella, el alcance nominal falla al arrancar. **Si se pierde, los nombres quedan irrecuperables y hay que reimportar el padrón.** Ver `docs/rotacion-clave-nominal.md`. |
| `PROBLEMATICAS_ACCESO_PASSWORD` | Contraseña temporal del formulario público (`lib/infraestructura/acceso-publico.ts`). Provisoria, reemplaza a una autenticación por token futura. Sin ella, el formulario y sus rutas quedan cerrados. |
| `PADRON_PG_URL` (o `ConnectionStrings`, alias heredado) | Conexión a Postgres de Gestión Educativa, formato `postgres://usuario:clave@host:5432/asistencias`. Solo la leen scripts de mantenimiento; el servidor nunca la lee. Si falta, el tablero conserva el último corte materializado en la base activa. |

### Alertas de infraestructura: padrón y persistencia

La base principal del hub es Postgres si `DATABASE_URL` está configurada; en caso contrario, es PGlite persistido bajo `DATA_DIR/pg`. El corte del padrón se escribe en el schema `ge` de esa misma base activa. No se utiliza una base `ge.sqlite` separada en este flujo.

Las **localizaciones** se siembran solas: `ensureSeeded` carga `ge_localizacion` desde
`public/data/localizaciones.json` cuando la tabla está vacía (ver `lib/infraestructura/localizaciones-seed.ts`).
Son dato público y están versionadas, así que una instalación nueva ya resuelve el formulario por CUE.

Ojo con el momento: `ensureSeeded` corre en la **primera request a una ruta de API**, no al
levantar el proceso. Un `GET /` devuelve 200 sin sembrar nada. Si vas a importar el padrón
inmediatamente después de desplegar, tocá antes una ruta de API para que la siembra ocurra:

```bash
wget -q -O- http://127.0.0.1:3000/api/hub > /dev/null
```

De lo contrario el import aborta con `ge_localizacion está vacía` y no descarta nada a ciegas.

El **padrón nominal** no: son datos personales de menores, no están en el repositorio y hay que
cargarlos una vez por corte:

```bash
node --experimental-strip-types scripts/import-padron.mjs --ge --ciclo 2026
```

Para una demostración con mapa, el seed crea partes ficticios sobre escuelas con
ubicación. Requiere `DEMO_OK=1` y un `DATA_DIR` explícito como protección; elige
50 escuelas por defecto y admite `--escuelas N`. Si no hay corte vigente, o se
pasa `--sin-padron`, omite secciones y alumnos nominales:

```bash
DATA_DIR=/tmp/demo DEMO_OK=1 node scripts/seed-demo-partes.mjs --escuelas 85 --sin-padron
DATA_DIR=/tmp/demo DEMO_OK=1 node scripts/seed-demo-partes.mjs --limpiar
```

Fuera de este modo, si hay padrón vigente, también genera matrícula ficticia
con IDs negativos desde `-900000`; por eso hay que comprobar que ese rango esté
libre antes de usarlo. La base se elige por `DATABASE_URL` (Postgres) o por la
PGlite persistida bajo `DATA_DIR`.

**Dónde correrlo: no en el contenedor de producción.** Ver *Nunca correr el import del padrón
dentro del contenedor*, más abajo — se intentó dos veces y las dos tumbó el host completo.

Al terminar, el script **releé el corte desde la base** y lo reporta:

```
Corte 20 verificado: estado=vigente, secciones=15763, membresías=266775
```

Si esa línea no aparece, el import no sirvió, sin importar lo que diga el resto de la salida.

> **Por qué esto no corre en GitHub Actions.** El corte se escribe en la base activa del hub
> (Postgres o PGlite). Un runner de Actions no tiene acceso al Postgres ni al volumen `/data`
> del contenedor; la única forma de darle acceso al volumen sería hornear el padrón en la imagen,
> que es justamente lo que no se hace con datos personales de menores. Además obligaría a poner
> las credenciales de la base de Gestión Educativa como secret de un runner alojado fuera de la red
> del ministerio.
>
> Y tampoco va como `post_deployment_command`, que fue el primer intento: corre dentro del
> contenedor y por eso mismo tumbó el host. Queda como tarea de operador con acceso al host.

#### Modelo de datos: Postgres de Gestión Educativa como origen y schema `ge` como corte local

El padrón de origen vive en Postgres de Gestión Educativa. El importador materializa en el schema `ge` de la base activa del hub un corte (`ge_corte`) que el tablero consulta junto con el resto de sus datos; no hay un archivo separado adjuntado en modo `?mode=ro`. Las consecuencias importantes:

- Volver a correr el paso 2 crea un corte nuevo y lo activa; el anterior pasa a `historico`.
  Es idempotente y no destruye nada.
- Si se revoca el acceso de mantenimiento a Postgres de Gestión Educativa, **el tablero no se cae**:
  sigue sirviendo el último corte materializado. Solo deja de poder actualizarse.
- Las alertas cargadas por directores viven en la misma base activa del hub. Si el hub usa PGlite,
  su persistencia está en el volumen `/data`; con Postgres, debe respaldarse la base de datos.
  El padrón puede rehacerse corriendo el import de nuevo; las alertas requieren restaurar el backup.

El importador reconcilia contra `ge_localizacion`: los CUE del padrón que no tengan localización
se descartan y se reportan al final. Como las localizaciones se siembran al arrancar, para cuando
se corre el import ya están.

#### Importar desde un tablero HTML (camino heredado)

```bash
node --experimental-strip-types scripts/import-padron.mjs /ruta/al/tablero-nominal.html
```

Sigue funcionando para cortes históricos. El HTML **nunca** se commitea ni se hornea en la
imagen: es un archivo con datos personales de menores que se copia a mano y se borra después.

El reverse proxy de Coolify (Traefik/Caddy) debe permitir cuerpos de **50 MB** (`POST /api/recursos/:id/archivo`).

## Secrets de Actions (opcionales)

| Secret | Uso |
| --- | --- |
| `COOLIFY_TOKEN` | Token de API Coolify con permiso de deploy. |
| `COOLIFY_APP_UUID` | `pts681lz0kazhs1dph8wjaxt`, la app de **producción** (`data-hub-dashboard`). Un push a `prod` publica en GHCR y redespliega `analisis.sistemas.mec.gob.ar`. |
| `COOLIFY_STAGING_APP_UUID` | `j3zm0co4bi9iy0c70nv3vinf`, la app de **staging**. Un push a `staging` redespliega `staging.analisis.sistemas.mec.gob.ar`. Si falta, el push a `staging` publica la imagen y saltea el deploy: nunca cae a producción. |

Sin esos secrets el workflow igual publica GHCR y saltea el deploy Coolify. Cuando están seteados, el paso *Trigger Coolify deploy* no solo dispara el deploy: además consulta `GET /api/v1/deployments/<uuid>` cada 10 segundos (hasta ~10 minutos) y falla el job si Coolify termina en `failed`/`cancelled-by-user` o si se agota el tiempo de espera, así el workflow refleja el resultado real del despliegue.

Además de `ghcr.yml`, el workflow **CI** (`.github/workflows/ci.yml`) corre en cada pull request: instala dependencias con pnpm y ejecuta lint, typecheck y tests. No publica imagen ni dispara deploy.

## Variables de entorno y flags

Los flags booleanos de riesgo y producto solo se activan con el valor exacto `true`; el valor predeterminado es `false`. `RISK_MODE` admite `shadow` (seguro, predeterminado) y `advisory`; cualquier otro valor se interpreta como `shadow`. Los valores secretos deben configurarse en el gestor de secretos del despliegue.

| Variable | Default | Para qué sirve | Requerida para |
|---|---|---|---|
| `DATA_DIR` | `./.data` | Datos persistentes y uploads | Hub y scripts locales |
| `DATABASE_URL` | ausente (PGlite) | Conexión Postgres | Producción con Postgres |
| `PGLITE_DATA_DIR` | `DATA_DIR/pg` | Ruta PGlite persistida | Persistencia local/optativa |
| `DATABASE_SSL` | `false` | TLS de Postgres | Postgres con TLS |
| `PGSSLMODE` | ausente | Alias SSL (`require`) | Postgres si aplica |
| `DATABASE_SSL_CA_PATH` | ausente | CA TLS personalizada | Postgres con CA propia |
| `DATABASE_POOL_MAX` | `10` | Máximo de conexiones | Ajuste Postgres |
| `DATABASE_POOL_IDLE_TIMEOUT_MS` | `10000` | Timeout idle pool | Ajuste Postgres |
| `DATABASE_POOL_CONNECT_TIMEOUT_MS` | `5000` | Timeout conexión | Ajuste Postgres |
| `DATABASE_STATEMENT_TIMEOUT_MS` | `30000` | Timeout de consulta | Ajuste Postgres |
| `BETTER_AUTH_SECRET` | sin default | Firma de sesión | Autenticación |
| `BETTER_AUTH_URL` | `http://localhost:3000` | URL pública de Auth | Autenticación |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | sin default | Primer usuario administrador | Seed inicial |
| `NOMINAL_ENCRYPTION_KEY` | sin default | Cifrado AES-256-GCM de identidad | Padrón nominal |
| `PROBLEMATICAS_ACCESO_PASSWORD` | sin default | Acceso temporal a formularios | Formularios públicos |
| `PADRON_PG_URL` (o `ConnectionStrings`) | sin default | Conexión al Postgres fuente de Gestión Educativa | Scripts de mantenimiento del padrón |
| `AI_API_KEY` | sin default | Credencial del proveedor OpenAI-compatible para explicar recursos | Acción «Explícame este recurso»; si también falta `OPENAI_API_KEY`, la función informa que no está configurada y no hace llamadas |
| `OPENAI_API_KEY` | sin default | Alias de compatibilidad para la clave del proveedor de explicaciones | Acción «Explícame este recurso» cuando `AI_API_KEY` no está definida |
| `AI_BASE_URL` | `https://api.openai.com/v1` | URL base del proveedor de explicaciones | Acción «Explícame este recurso» |
| `AI_MODEL` | `gpt-4o-mini` | Modelo del proveedor de explicaciones | Acción «Explícame este recurso» |
| `AI_TIMEOUT_MS` | `20000` | Timeout de la solicitud de explicación | Acción «Explícame este recurso» |
| `RISK_ENGINE_ENABLED` | `false` | UI `/admin/riesgo` | Consola de riesgo |
| `RISK_RADAR_ENABLED` | `false` | Radar de riesgo | Radar |
| `RADAR_ENSEMBLE_ENABLED` | `true` | Piloto Ensemble gratuito; sólo el valor exacto `false` lo pausa | Job `sync-radar-ensemble` |
| `HAZARD_CONTEXT_ENABLED` | `false` | Contexto de amenazas | Contexto hazard |
| `SEASONAL_ENABLED` | `false` | Capa estacional | Seasonal |
| `SITUACION_ENABLED` | `false` | Centro de situación | Situación |
| `EPISODIOS_DERIVADOS_ENABLED` | `false` | UI episodios derivados | Episodios |
| `RISK_MODE` | `shadow` | Modo seguro o advisory | Motor de riesgo |
| `ENOS_JOBS_ENABLED` | `true` | Pausa global de jobs OPS1 | Scheduler OPS1 |
| `GEO_STATIC_OUTPUT_DIR` | `services/geo-static/output` | Insumos del importador geo | Import geo-static |
| `EARTHDATA_TOKEN` | sin default | Autenticación NASA IMERG | Job `sync-imerg` |
| `OPEN_METEO_API_KEY` | ausente | Cuota/plan Open-Meteo | Jobs de pronóstico/clima |
| `OPEN_METEO_LIMITE_HOURLY`, `OPEN_METEO_LIMITE_DAILY`, `OPEN_METEO_LIMITE_MONTHLY` | techo gratuito de código | Límites de cupo | Jobs Open-Meteo |
| `OPEN_METEO_LIMITE_HOURLY_PAGO`, `OPEN_METEO_LIMITE_DAILY_PAGO`, `OPEN_METEO_LIMITE_MONTHLY_PAGO` | sin default | Límites de cupo pago | Solo cuota paga Open-Meteo |
| `OPENROUTER_API_KEY` | sin default | Acceso a proveedor IA | Briefing IA |
| `OPENROUTER_MODEL` | `deepseek/deepseek-v4.1-flash` | Modelo de briefing | Briefing IA |
| `E8_PRESUPUESTO_USD_MES` | `5` | Presupuesto mensual máximo | Alias legado de `VEREDICTO_*` |
| `E8_COSTO_MAXIMO_USD_LLAMADA` | `0.01` | Reserva/tope por llamada | Alias legado de `VEREDICTO_*` |
| `AI_VEREDICTO_ENABLED` | `false` | Veredicto diario asistido | Veredicto IA |
| `VEREDICTO_PRESUPUESTO_USD_MES` | `5` (alias `E8_PRESUPUESTO_USD_MES`) | Presupuesto mensual único de IA | Veredicto IA |
| `VEREDICTO_COSTO_MAXIMO_USD_LLAMADA` | `0.02` (alias `E8_COSTO_MAXIMO_USD_LLAMADA`) | Reserva por llamada | Veredicto IA |
| `DATASET_SALT_E7B` | sin default | Seudonimización estable | Exportación dataset |
| `DEMO_OK` | sin default | Confirmación explícita de seed demo | Seed de demostración |
| `NODE_ENV` | `production` en despliegue | Cookies seguras por entorno | Runtime |
| `VITEST` | sin default | Selección de DB en memoria para tests | Solo tests |

### Jobs del veredicto diario

Producción programa los jobs con **Coolify Scheduled Tasks** sobre la aplicación `data-hub-dashboard`; los timers
systemd de `deploy/systemd/ops1/` corren solo en staging. Las expresiones cron están en UTC (confirmar la zona
horaria del servidor de Coolify antes de crearlas, ver `docs/ejecucion-enos/OPS1/runbook-scheduler.md`).

| Tarea Coolify (nombre) | Comando | Cron (UTC) | Timeout | Timer systemd (staging) |
|---|---|---|---|---|
| `veredicto-diario` | `node scripts/jobs.mjs veredicto-diario` | `45 0,6,12,18 * * *` | 600 s | `enos-ops1-veredicto-diario.timer` (`*-*-* 00,06,12,18:45:00 UTC`) |
| `veredicto-cierre` | `node scripts/jobs.mjs veredicto-cierre` | `30 3 * * *` | 300 s | `enos-ops1-veredicto-cierre.timer` (`*-*-* 03:30:00 UTC`) |

Requisitos en el contenedor: `ENOS_JOBS_ENABLED` distinto de `false`, `AI_VEREDICTO_ENABLED=true` y
`OPENROUTER_API_KEY` (sin clave el job corre igual y publica la plantilla determinista). La migración `0015` se
aplica sola: `jobs.mjs` migra antes de despachar. Los días de pronóstico necesitan además
`sync-pronostico-caudal` y `sync-ensemble`, que hoy no están programados en producción; sin ellos esos días salen
"Sin dato".

Monitoreo: ambos jobs figuran en `lib/infraestructura/riesgo/jobs-esperados.ts` (pasar a `habilitado: true` al
crear las tareas) y el job publica en `hazard_source_health` los proveedores `veredicto-diario` (TTL 360 min;
`degradado` si una fuente no está disponible o la IA cayó a plantilla) y `registro-eventos-inundaciones` (TTL 7 días).
Una fuente de entrada vencida (último éxito > 2 × TTL) se excluye y el día se publica como "Sin dato" o con
"Sin datos de: …", nunca como nivel bajo. Detalle en `odd/tasks/veredicto-diario-ia.md`, "Operación permanente".

### Procedimientos operativos

Después del primer despliegue y cada vez que se versionen nuevos resultados, importar las capas geo estáticas. El importador lee todos los archivos reconocidos de `GEO_STATIC_OUTPUT_DIR` (por defecto `services/geo-static/output`); admite además `--aislamiento PATH --susceptibilidad PATH --geometria PATH --exposicion-ruta PATH`:

```bash
docker exec <CONTENEDOR> node scripts/importar-geo-static.mjs
```

`<CONTENEDOR>` es el nombre o ID del contenedor de la aplicación en ejecución, visible en `docker ps`; reemplazarlo por el valor real al instalar los comandos en systemd. Tras la importación, ejecutar en este orden para completar la ficha territorial:

```bash
docker exec <CONTENEDOR> node scripts/jobs.mjs geo-perfiles
docker exec <CONTENEDOR> node scripts/jobs.mjs asociacion-rio
```

Los timers mantienen ambos jobs actualizados diariamente. La asociación de ríos corre a las 03:10 UTC, después de `geo-perfiles` (03:00 UTC).

Exportación bajo demanda de dataset desidentificado:

```bash
docker exec -e DATASET_SALT_E7B=<SAL> <CONTENEDOR> node scripts/exportar-dataset-desidentificado.mjs [--out <RUTA>]
```

El archivo queda en `DATA_DIR/dataset-replay-e7b/<version>_<fecha>.csv`. Sin `DATASET_SALT_E7B` el proceso sale con error claro.

El CSV tiene una fila por snapshot de run publicado. `idEscuela` es HMAC-SHA256(sal, CUE), sin CUE en claro. `targetAfectacion24h` y `targetAfectacion72h` salen de `infra_afectacion` (reportes creados en (t, t+h]) y quedan `null` si la ventana aún no llegó a la fecha de corte. `nivelPeligroDepartamento` y `lluviaObservadaMm` quedan siempre `null` por ahora, porque no hay fuente as-of conectada. Sin snapshots publicados el resultado es solo encabezado y el script lo advierte.

Al instalar timers, reemplazar `<CONTENEDOR>` por el nombre/ID real mostrado por `docker ps`, por ejemplo con `sed` sobre el unit antes de `systemctl daemon-reload`, o mediante `systemctl edit enos-ops1@.service` con un drop-in. Consultar `docs/ejecucion-enos/OPS1/runbook-scheduler.md`.

## Staging

`staging` es el escalón previo a producción. Tiene su propio volumen `/data`, sus propios secretos
(`BETTER_AUTH_SECRET`, `NOMINAL_ENCRYPTION_KEY`, `ADMIN_PASSWORD`, `PROBLEMATICAS_ACCESO_PASSWORD`)
y **no** comparte datos con producción: arranca vacío, con las localizaciones sembradas solas. No
tiene `PADRON_PG_URL`; si hace falta padrón en staging se importa por operador, igual que en prod.

Flujo de ramas: rama de trabajo → `main` → `staging` → `prod`. El CI (`.github/workflows/ci.yml`)
corre solo en los PR hacia `main`; los PR de promoción llevan el mismo árbol ya probado y no lo repiten.

1. PR de la rama de trabajo a `main`. Esperar el CI en verde y mergear.
2. PR de `main` a `staging` (o fast-forward de `staging` a `main`). El workflow **Publish GHCR
   image** publica `:staging` y redespliega la app de staging.
3. Repetir el smoke test de abajo contra `staging.analisis.sistemas.mec.gob.ar`.

## Despliegue a producción

`main` acumula lo aprobado y `staging` lo valida, pero producción solo cambia cuando se actualiza `prod`: un push a
`prod` publica la imagen `latest` en GHCR y el workflow redespliega `analisis.sistemas.mec.gob.ar`.

1. PR de `staging` a `prod` (o fast-forward de `prod` a `staging`), una vez pasado el smoke test de staging.
2. Esperar el workflow **Publish GHCR image** hasta `success`. Si falla, no se despliega nada.
3. El paso *Trigger Coolify deploy* redespliega producción solo.
4. **Smoke test contra el FQDN de producción:**
   - `GET /` → 200, catálogo del hub.
   - `GET /api/hub` → 200. Es además la request que dispara `ensureSeeded` (ver más arriba).
   - `GET /mapas/matricula` y `GET /mapas/infraestructura` → anónimo redirige a login (307).
   - `GET /tablero` → 307 anónimo.
   - `GET /data/summary.json` y `GET /maplibre-gl-worker.js` → 200.
   - `GET /problematicas/parte/nuevo?cue=1800554-00` → 200 con el nombre de la escuela en pantalla.

### Nunca correr el import del padrón dentro del contenedor

Se intentó dos veces con `post_deployment_command` y las dos veces **tumbó el host entero de
Coolify**, no sólo esta app: se cayeron también PlanCope, asistencias-cge y el propio panel, durante
unos quince minutos, con la API de Coolify inalcanzable para poder revertirlo.

El síntoma es reconocible: el puerto 443 sigue aceptando conexiones pero ninguna request HTTP
completa. Eso es memoria agotada con swap thrashing, no CPU. El import es Node de un solo hilo, así
que más vCPU no cambia nada.

Por eso los contenedores ahora tienen `limits_memory` con `limits_memory_swap` **igual** al límite:
swap cero, para que un proceso desbocado reciba un OOM-kill limpio en vez de convertir el host en
piedra. Docker toma esos límites al recrear el contenedor, no en caliente.

Si `post_deployment_command` aparece con el import cargado, **sacalo**: cualquier deploy o restart
lo vuelve a disparar.

## Rollback

Si el cutover falla o hay regresión en producción:

El rollback se hace por tag de imagen en Coolify.

1. En Coolify, cambiar el tag de `ghcr.io/geronimoserial/data-hub-dashboard:latest` al SHA corto
   del commit anterior (el workflow publica `latest` y `<sha>` en cada build, así que el anterior
   siempre está disponible en GHCR).
2. Redesplegar y repetir el smoke del FQDN.
3. El volumen `/data` no se toca en un rollback de imagen: las alertas y el corte del padrón quedan.

## Build local (opcional)

```bash
docker build -t data-hub-dashboard:local .
docker run --rm -p 3000:3000 -v hub-data:/data data-hub-dashboard:local
# curl -f http://localhost:3000/ && curl -f http://localhost:3000/mapas/matricula
```

El `HEALTHCHECK` del Dockerfile hace `GET /` en `localhost:3000`. El volumen `/data` es el de **Datos persistentes**.


Para instalar y operar el timer del radar meteorológico, seguir [el runbook OPS1](ejecucion-enos/OPS1/runbook-scheduler.md#radar-de-pronóstico).
