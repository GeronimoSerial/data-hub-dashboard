# Plantilla de despliegue por región

Esta carpeta describe cómo instanciar una región de ENOS (por ejemplo Manaos)
con la misma imagen que usa Corrientes. No contiene valores reales: los secretos
viven en el gestor de secretos del entorno.

Archivos:

- `region.env.example`: variables de entorno de una región, agrupadas y marcadas
  como requeridas, condicionales u opcionales.
- `scheduler-jobs.md`: tareas programadas por región, derivadas de la regla de
  aplicabilidad de los jobs.

Procedimiento completo para crear una región nueva:
[docs/ejecucion-enos/OPS1/runbook-nueva-region.md](../../docs/ejecucion-enos/OPS1/runbook-nueva-region.md).

## Componentes de un despliegue

Cada región es un despliegue independiente:

| Componente | Qué es | Notas |
|---|---|---|
| Aplicación | Contenedor de la imagen `Dockerfile` (`node server.js`) | Misma imagen para todas las regiones. Puerto 3000, healthcheck en `/` |
| Base de datos | Postgres propio | Una base por región. No compartir con otra región |
| Scheduler | Tareas programadas que ejecutan `node scripts/jobs.mjs <nombre>` dentro del contenedor | Coolify (producción) o timers systemd (staging). Ver `scheduler-jobs.md` |
| Secretos | Variables del contenedor, del gestor de secretos | Propios de la región: ninguno se reutiliza entre regiones |
| Volumen | `/data` (`DATA_DIR`) | Archivos de referencia de la región (ver "Archivos de referencia") |

## Cómo `REGION` elige la configuración

- `REGION` es el id de la región. Vacía o ausente = `corrientes`.
- La aplicación lee `config/regiones/<REGION>.json` a través del registro
  `lib/infraestructura/region/registro.ts`. El JSON se importa estáticamente, así
  que queda dentro del bundle del servidor.
- `instrumentation.ts` resuelve la región al arrancar: un id desconocido, o un
  JSON que no cumple el esquema (`lib/infraestructura/region/esquema.ts`), aborta
  el arranque.
- `scripts/jobs.mjs` lee el mismo archivo desde disco (`config/regiones/`) para
  decidir si un job aplica a la región. Ver "Archivos de referencia" para lo que
  eso implica en la imagen.
- La imagen no fija `REGION` (`Dockerfile`: sólo `ENV DATA_DIR`, `NODE_ENV`,
  `PORT`, `HOSTNAME`, `APP_REVISION`). El valor llega en tiempo de ejecución, por
  contenedor.

## Aislamiento entre regiones

- Base de datos, usuarios y secretos son propios de cada despliegue.
- Un secreto (por ejemplo `NOMINAL_ENCRYPTION_KEY`, `DATASET_SALT_E7B`,
  `MATRICULA_DNI_SECRET`) no se copia de una región a otra: cambiarlo en una
  región no debe romper otra.
- `ENOS_MANAOS_URL` sólo se setea en el despliegue de Corrientes (card del hub).

## Archivos de referencia (volumen y datos de la región)

La región necesita archivos que no viajan en la imagen. Sus rutas están en
`archivos` del JSON de la región (`mascara`, `departamentos`) y apuntan a `/data`.
Montarlos o cargarlos en el volumen antes del primer arranque. El paso
`pnpm region:cargar <id>` (plan B11.3) publica los datasets de referencia de la
región.

Pendiente de verificar en la imagen construida: `Dockerfile` no copia
`config/` al runner (sólo `scripts/`, `lib/`, `drizzle/` y `tsconfig.json`).
`scripts/jobs.mjs` lee `config/regiones/<REGION>.json` desde `/app`, así que
`docker exec <contenedor> node scripts/jobs.mjs <nombre>` puede fallar con
`REGION desconocida` si el archivo no está en la imagen. Comprobar con
`docker run --rm <imagen> ls /app/config/regiones` antes de programar tareas. No
se corrigió en B11 porque el `Dockerfile` no fija `REGION`.

## Hosting y jurisdicción

La jurisdicción de alojamiento de Manaos queda pendiente de B0 (validación de
datos, incluida la consulta a SEDUC-AM y SEMED sobre alojamiento de datos y LGPD).
Hasta que B0 cierre, no instanciar Manaos en ningún proveedor. Esta plantilla no
decide el proveedor.

## Qué no hace esta carpeta

- No contiene valores de secretos ni credenciales.
- No crea infraestructura. Crear o modificar la aplicación, la base, las tareas o
  los secretos requiere autorización del owner.
