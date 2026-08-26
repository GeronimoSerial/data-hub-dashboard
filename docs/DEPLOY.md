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
   - `GET /mapas/matricula` → 200, mapa carga (tiles, capas, búsqueda).
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
docker run --rm -p 3000:3000 data-hub-dashboard:local
# curl -f http://localhost:3000/ && curl -f http://localhost:3000/mapas/matricula
```

El `HEALTHCHECK` del Dockerfile hace `GET /` en `localhost:3000`.

El reverse proxy (Coolify/Traefik/Caddy) debe permitir cuerpos de **50 MB** en `POST /api/recursos/:id/archivo`.
