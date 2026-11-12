# Runbook — alta de una región nueva

Checklist de extremo a extremo para crear una región (CA5 del plan de batches
ENOS, B11). Ejemplo de referencia: Manaos. Las plantillas de despliegue están en
[deploy/regiones/](../../../deploy/regiones/README.md).

Cada paso marca si requiere autorización del owner. **Los pasos marcados como
"requiere autorización del owner; no realizado en B11" no se ejecutan en B11.**
Son pasos de operación de infraestructura o de datos reales.

Antes de empezar: el alta no es sólo código. Sin datos validados (paso 1) la
región queda vacía y honesta, no con datos inventados.

## 1. Validar los datos de la región (B0)

Requiere autorización del owner; no realizado en B11.

- Confirmar fuentes de estaciones, niveles, altimetría, licencias, alertas y
  datos de escuelas según B0 (`docs/propuestas/plan-batches-enos.md`, B0.1 a B0.7).
- Confirmar la jurisdicción de alojamiento de los datos (LGPD, acuerdos con
  SEDUC-AM y SEMED). Sin esa decisión no se instancia nada (paso 6).
- Registrar en el plan los hallazgos y las fuentes descartadas.

## 2. Escribir `config/regiones/<id>.json`

Crear el archivo con el id exacto de la región (minúsculas, guiones, igual que
`REGION`). El esquema completo está en
[lib/infraestructura/region/esquema.ts](../../../lib/infraestructura/region/esquema.ts).
Corrientes (`config/regiones/corrientes.json`) es el ejemplo de referencia.

| Campo | Qué significa |
|---|---|
| `id` | Id de la región. Debe coincidir con el nombre del archivo y con `REGION` |
| `nombre` | Nombre visible |
| `pais` | Código de país de dos letras |
| `zonaHoraria` | Zona IANA (por ejemplo `America/Manaus`) |
| `locale` | Locale de formato (por ejemplo `pt-BR`) |
| `idiomas` | Idiomas de la interfaz: `es` y/o `pt` |
| `toleranciaBorde` | Kilómetros que un punto puede estar fuera de la provincia y contar como dentro |
| `bboxPlausible` | Caja (`latMin`, `latMax`, `lonMin`, `lonMax`) fuera de la cual una coordenada se considera inválida |
| `limitesMapa` | Límites del mapa: `[[oeste, sur], [este, norte]]` (lon, lat) |
| `bboxRuta` | Caja donde se calcula recorrido; fuera de ella no se calcula |
| `regionesInteresLluvia` | Cajas de interés para lluvia medida |
| `vistaInicial` | Centro (`[lon, lat]`) y zoom de la vista inicial |
| `mapaCentro`, `mapaZoom` | Centro y zoom del mapa |
| `datasets` | Nombres de los datasets de referencia: `unidadesAdministrativas`, `estacionesRio`, `localizaciones` |
| `fuentesRio` | Fuentes de río de la región: `prefectura`, `ina`. Controla qué jobs `sync-prefectura-*` y `sync-ina-*` aplican |
| `fuentesAlertas` | Fuentes de alertas, por ejemplo `smn` |
| `estacionAncla` | Id de la estación ancla (`estacionAncla`) |
| `archivos` | Rutas en `/data` de la máscara y de las unidades administrativas |

Ver también la regla de aplicabilidad en [runbook-scheduler.md](runbook-scheduler.md#región-region-y-tareas-por-región).

## 3. Registrar la región

Agregar la región en `REGISTRO` de
[lib/infraestructura/region/registro.ts](../../../lib/infraestructura/region/registro.ts),
con su import del JSON. Sin esta entrada, `REGION=<id>` aborta el arranque
con `REGION desconocida`.

## 4. Prueba de contrato

```bash
pnpm exec vitest run lib/infraestructura/region
```

Debe pasar. Cubre el esquema y el registro (`esquema.test.ts`, `registro.test.ts`);
la prueba de contrato de B11.4 suma datasets y proveedores declarados. Si falla,
corregir el JSON o el registro antes de seguir. No omitir la prueba.

## 5. Datasets de referencia

Requiere autorización del owner; no realizado en B11.

- Preparar los archivos de `archivos` (máscara y unidades administrativas) y los
  datasets de `datasets`.
- Publicar los datasets de la región: `pnpm region:cargar <id>` (plan B11.3).
- Confirmar el conteo de filas publicadas antes de seguir.

## 6. Instanciar el despliegue

Requiere autorización del owner; no realizado en B11. Usar
[deploy/regiones/region.env.example](../../../deploy/regiones/region.env.example)
como plantilla y [deploy/regiones/README.md](../../../deploy/regiones/README.md)
como procedimiento.

- Aplicación: contenedor de la imagen con `REGION=<id>`, puerto 3000 y su propio dominio.
- Base: Postgres propio. Aplicar las migraciones de `drizzle/` antes del primer arranque; confirmar en el despliegue cómo se aplican.
- Scheduler: crear sólo las tareas de `deploy/regiones/scheduler-jobs.md` para la
  región. No crear las que no aplican.
- Secretos: generar los propios de la región (`NOMINAL_ENCRYPTION_KEY`,
  `DATASET_SALT_E7B`, `MATRICULA_DNI_SECRET`, `BETTER_AUTH_URL`, credenciales
  de la base). No copiar secretos de otra región.
- Jurisdicción: sólo la definida en el paso 1.

## 7. Primer arranque

Requiere autorización del owner; no realizado en B11.

- `REGION` se valida al arrancar (`instrumentation.ts`). Un id desconocido o un
  JSON inválido **aborta el arranque**: revisar el log de inicio antes que nada.
- Healthcheck de la imagen: `GET /` debe responder (`wget` en el contenedor).
- Verificar que el archivo de configuración está en la imagen:
  `docker run --rm <imagen> ls /app/config/regiones`. Si falta, `scripts/jobs.mjs`
  no encuentra la región y todas las tareas fallan con código `1`
  (ver la nota pendiente en `deploy/regiones/README.md`).
- Primer administrador: `ADMIN_EMAIL` y `ADMIN_PASSWORD` sólo en base vacía.
  Quitarlas después.

## 8. Verificar el estado vacío y honesto

Requiere autorización del owner; no realizado en B11.

- Mapa: sin datos de la región, debe mostrar el estado vacío **sin error**, con
  la vista inicial y los límites de `config/regiones/<id>.json`.
- Situation Center: debe mostrar "sin dato" o "sin cálculo de riesgo disponible",
  nunca cifras de Corrientes ni valores por defecto.
- `/admin/operacion`: sólo los jobs que aplican. Los que faltan con `sin_corridas`
  se revisan en la tarea o timer, no se apagan sin decisión.
- Un job que devuelve código `2` es una tarea de más: borrarla.

## 9. Usuarios y ACL

Requiere autorización del owner; no realizado en B11.

- Crear usuarios en la base de la región. Cada usuario pertenece a un solo despliegue.
- Revisar `lib/acl.ts` antes de abrir cards externas: la card del hub
  (`ENOS_MANAOS_URL`) sólo existe en el despliegue de Corrientes.
- Confirmar que el rol del entorno es explícito (`RIESGO_DATOS_ROL`) y que la
  región no comparte base con otra.

## Qué no hace este runbook

- No crea infraestructura, bases, tareas ni secretos reales.
- No decide la jurisdicción de alojamiento: lo define B0.
