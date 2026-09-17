# Despliegue en producción (Coolify + GHCR)

Guía de cutover del hub Next.js que reemplaza el runtime Fastify del mapa demográfico en el FQDN de producción.

## Referencia

| Campo | Valor |
| --- | --- |
| Propietario GitHub | `GeronimoSerial` |
| FQDN | `analisis.sistemas.mec.gob.ar` |
| App Coolify (UUID) | `pts681lz0kazhs1dph8wjaxt` |
| Imagen nueva (este repo) | `ghcr.io/geronimoserial/data-hub-dashboard` |
| Imagen de rollback (Fastify) | `ghcr.io/geronimoserial/mapa-demografico` |

La imagen GHCR se publica automáticamente al hacer push a `main` o `master` (workflow `.github/workflows/ghcr.yml`). El nombre se fuerza a minúsculas: `ghcr.io/geronimoserial/data-hub-dashboard`.

Repositorio GitHub: **privado** `GeronimoSerial/data-hub-dashboard`. El paquete GHCR queda privado; Coolify autentica el pull con un PAT classic `read:packages` en el `docker login` del host (los tokens `gho_` de OAuth no sirven para pull).

## Alcance de esta imagen

- Sirve el hub Next.js en el puerto **3000** (modo `standalone`).
- El visor MapLibre de matrícula está en `/mapas/matricula`.
- Los datos estáticos del mapa (`/data/*.geojson`, worker MapLibre) van empaquetados en `public/` dentro de la imagen.
- **Reportes** y **Administración** siguen existiendo como rutas, pero **no aparecen en la barra de navegación** (`lib/nav.ts` solo expone Inicio y Mapas). Los reportes con Postgres del stack Fastify **no** están en esta imagen.

## Datos persistentes

Coolify debe montar un volumen en **`/data`**. SQLite (`hub.sqlite`) y los uploads viven ahí. Backup = copiar el volumen. Alcance: reportes y admin ahora persisten; no reintroducir Postgres.

| Variable | Uso |
|----------|-----|
| `DATA_DIR` | `/data` en el contenedor |
| `BETTER_AUTH_SECRET` | Obligatorio |
| `BETTER_AUTH_URL` | URL pública del FQDN |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Solo primer boot |
| `NOMINAL_ENCRYPTION_KEY` | **Obligatorio.** 32 bytes en base64 (`openssl rand -base64 32`). Cifra la identidad de los alumnos (AES-256-GCM). Sin ella el alcance nominal falla al arrancar. **Si se pierde, los nombres quedan irrecuperables y hay que reimportar el padrón.** Ver `docs/rotacion-clave-nominal.md`. |
| `PADRON_PG_URL` | Conexión a la base Postgres de Gestión Educativa, de donde sale el padrón. Formato `postgres://usuario:clave@host:5432/asistencias`. Solo la usan los scripts de mantenimiento: **el servidor nunca la lee**. Si falta, el tablero sigue sirviendo el último corte ya materializado en `ge.sqlite`. |

### Alertas de infraestructura: el espejo de datos NO viaja en la imagen

`ge.sqlite` vive en el volumen `/data`, igual que `hub.sqlite`, y no viaja en la imagen.

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
cargarlos a mano una vez por corte, dentro del contenedor:

```bash
node --experimental-strip-types scripts/import-padron.mjs --ge --ciclo 2026
```

Necesita `PADRON_PG_URL` y `NOMINAL_ENCRYPTION_KEY` en el entorno. Tarda entre 40 y 90 segundos
sobre ~272.000 filas. Los scripts viven en `/app/scripts` dentro de la imagen y se ejecutan con
`docker exec`. El flag `--experimental-strip-types` está porque importan módulos `.ts` de `lib/`;
en Node ≥ 22.18 el stripping ya viene activado y el flag es inocuo.

Al terminar, el script **releé el corte desde la base** y lo reporta:

```
Corte 20 verificado: estado=vigente, secciones=15763, membresías=266775
```

Si esa línea no aparece, el import no sirvió, sin importar lo que diga el resto de la salida.

> **Por qué esto no corre en GitHub Actions.** El corte se escribe en `ge.sqlite`, que vive en el
> volumen `/data` del contenedor: un runner de Actions no tiene acceso a ese volumen, y la única
> forma de que lo tuviera sería hornear el padrón en la imagen, que es justamente lo que no se
> hace con datos personales de menores. Además obligaría a poner las credenciales de la base de
> Gestión Educativa como secret de un runner alojado fuera de la red del ministerio. El lugar
> correcto es un **post-deployment command de Coolify**, que corre dentro del contenedor, con el
> volumen montado y sin sacar credenciales de la red.

#### Modelo de datos: Postgres es la fuente, `ge.sqlite` es la proyección

El padrón real vive en la base Postgres de Gestión Educativa. `ge.sqlite` es una **proyección
local de solo lectura** que se materializa como un corte (`ge_corte`) y que el tablero consulta
adjunta en modo `?mode=ro`. Las consecuencias importantes:

- Volver a correr el paso 2 crea un corte nuevo y lo activa; el anterior pasa a `historico`.
  Es idempotente y no destruye nada.
- Si se revoca el acceso a Postgres, **el tablero no se cae**: sigue sirviendo el último corte
  materializado. Solo deja de poder actualizarse.
- Las alertas cargadas por directores viven en `hub.sqlite` y **no** dependen de Postgres.
  Si el volumen se pierde, el padrón se rehace corriendo el import de nuevo; las alertas no,
  ésas solo están en el backup del volumen.

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
| `COOLIFY_TOKEN` | Token de API Coolify. Copiar desde el repo `mapa-demografico` **solo** si el UUID es una app de preview. |
| `COOLIFY_APP_UUID` | UUID de la app Coolify a redesplegar. **No** usar `pts681lz0kazhs1dph8wjaxt` hasta que el smoke de esta imagen esté OK: ese UUID es el Fastify en producción. |

Sin esos secrets el workflow igual publica GHCR y saltea el deploy Coolify.

## Cutover (operador)

1. El repo y el primer push a `main` ya disparan GHCR.
2. Esperar el workflow **Publish GHCR image** (Actions) hasta `success`.
3. **En Coolify** (app de preview, o `pts681lz0kazhs1dph8wjaxt` solo después del smoke):
   - Cambiar el origen a la imagen `ghcr.io/geronimoserial/data-hub-dashboard:latest`.
   - Puerto del contenedor: **3000**.
   - Anotar la imagen/tag Fastify actual antes de cambiar (`ghcr.io/geronimoserial/mapa-demografico`) para rollback.
4. **Smoke test** en la URL de preview de Coolify (antes de tocar el dominio):
   - `GET /` → 200, catálogo del hub.
   - `GET /mapas/matricula` → anónimo redirige a login; con sesión permitida, 200 y el mapa carga.
   - `GET /tablero` y `GET /recursos/reporte-sobreedad-inicial.pdf` → anónimo redirige a login (ya no son archivos públicos).
   - `GET /data/summary.json` → 200.
   - `GET /maplibre-gl-worker.js` → 200.
5. **Cambiar el FQDN** `analisis.sistemas.mec.gob.ar` a la nueva app solo después de que el smoke en preview sea satisfactorio.
6. Repetir smoke en el FQDN de producción.

> **No ejecutar DNS ni Coolify desde CI.** Esta guía documenta pasos manuales; el operador confirma en el panel de Coolify.

## Rollback

Si el cutover falla o hay regresión en producción:

1. En Coolify, restaurar la imagen **`ghcr.io/geronimoserial/mapa-demografico`** (runtime Fastify anterior) con el tag que se anotó antes del cambio.
2. Redesplegar y verificar `analisis.sistemas.mec.gob.ar`.
3. **No eliminar** este repositorio (`data-hub-dashboard`); el rollback es solo de imagen/runtime en Coolify.

## Build local (opcional)

```bash
docker build -t data-hub-dashboard:local .
docker run --rm -p 3000:3000 -v hub-data:/data data-hub-dashboard:local
# curl -f http://localhost:3000/ && curl -f http://localhost:3000/mapas/matricula
```

El `HEALTHCHECK` del Dockerfile hace `GET /` en `localhost:3000`. El volumen `/data` es el de **Datos persistentes**.
