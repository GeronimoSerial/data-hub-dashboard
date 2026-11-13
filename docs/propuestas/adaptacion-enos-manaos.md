# Adaptación del sistema ENOS a Manaos y su entorno

**Documento interno — viabilidad y plan técnico**
Estado: borrador. Fecha: 12/11/2026.
Alcance del piloto: municipio de Manaos y municipios ribereños cercanos sobre los ríos Negro y Solimões (Amazonas, Brasil).
Interfaz: bilingüe español/portugués.

Las referencias a archivos surgen del relevamiento del código del 12/11/2026 y deben revisarse antes de empezar cada fase. Lo marcado *(a verificar)* no está confirmado.

---

## Parte 1 — Viabilidad

### 1.1 Qué cambia respecto de Corrientes

| Aspecto | Corrientes | Manaos y entorno |
|---|---|---|
| Amenaza principal | Inundación por crecida y lluvia | Bajante extrema (El Niño) y crecida (La Niña) |
| Ritmo del río | Crecidas de días a semanas | Pulso anual lento y predecible: sube y baja varios metros a lo largo de meses |
| Acceso a escuelas | Rutas y caminos | Mayormente fluvial fuera del área urbana |
| Horizonte útil de alerta | 24, 72 y 240 horas | Además, 30 a 90 días: la bajante se anticipa con semanas |
| Fuente de nivel de río | Prefectura Naval, INA | ANA (red hidrometeorológica), Servicio Geológico de Brasil |
| Padrón de escuelas | Padrón provincial | INEP – Censo Escolar |
| Límites administrativos | Georef, 25 departamentos | IBGE, municipios |
| Terreno | Copernicus DEM 30 m | Copernicus DEM 30 m sesgado por la selva (mide la copa de los árboles) |
| Idioma | Español | Portugués, con interfaz bilingüe |
| Huso horario | UTC−3 | UTC−4 |

### 1.2 Qué se reutiliza

- **Proveedores globales:** pronóstico ECMWF y caudal GloFAS (Open-Meteo), lluvia satelital IMERG, profundidad de inundación JRC, red OSM. Funcionan sin cambios fuera de su límite geográfico.
- **Motor de riesgo:** combinación de amenaza y vulnerabilidad, redistribución de pesos ante datos faltantes, cálculo de confianza.
- **Capa de datasets versionados en base de datos** (`lib/infraestructura/datasets/catalogo.ts`): estaciones, padrón y tramos ya son datos y no código.
- **Infraestructura de jobs** (`scripts/jobs.mjs`, scheduler) y visor del mapa.
- **Cálculo de aislamiento**, que se extiende a la vía fluvial.

### 1.3 Qué no se reutiliza

| Pieza | Motivo | Reemplazo |
|---|---|---|
| Lectura de Prefectura Naval | No cubre el Amazonas | ANA / Servicio Geológico de Brasil |
| Series e pronóstico del INA | Solo Argentina | ANA HidroWeb; Hydroweb (estaciones virtuales satelitales) *(a verificar cobertura)* |
| Alertas del SMN | Solo Argentina | Alertas del INMET *(a verificar si publica en formato CAP)* |
| Catálogo de estaciones y tramos | Específicos de Corrientes | Estaciones de los ríos Negro y Solimões |
| Evidencia de sequía 2023 (`motor/evidencia-seco-s2.ts`) | Específica de Corrientes | Eventos 2021, 2023 y 2024 de Manaos |
| Umbrales de lluvia y río | Calibrados a criterio para Corrientes | Nuevos umbrales, incluidos mínimos de río |

### 1.4 Puntos del código atados a Corrientes

| Punto | Ubicación |
|---|---|
| Límites geográficos (bounding boxes) | `geo-perfil.ts:27-30`, `providers/imerg.ts:82-85`, `lib/mapas/departamentos.ts:28-31` |
| Control de exactamente 25 departamentos | `renaper-natalidad.ts:24` |
| Filtro de ubicación provincial | `radar-meteo/departamentos.ts` (`ubicacionEnCorrientes`) |
| Rol de estación `corrientes` | `hidrometria/estaciones-prefectura.ts`, `sync-prefectura-historico.ts` |
| Orden fijo de estaciones | `motor-v04/escenarios-estacion.ts:33-38` |
| Textos de interfaz | `lib/copy/didactica.ts`, `lib/mapas/estadisticas-natalidad.ts` |
| Umbrales y pesos | `riesgo/motor/config.ts`, `riesgo/motor-v04/config.ts` |

Es un trabajo acotado y localizado: la parte de datos ya está desacoplada y lo que queda son constantes de configuración.

### 1.5 Datos a conseguir

| Dato | Fuente | Costo | Factibilidad |
|---|---|---|---|
| Padrón de escuelas con coordenadas | INEP – Catálogo de Escolas *(a verificar coordenadas)* | Gratis | Alta |
| Escuelas ribereñas y transporte escolar fluvial | Secretaría de Educación del Estado de Amazonas (SEDUC-AM) y Secretaría Municipal de Manaos (SEMED) | Convenio | Media |
| Niveles de río | ANA (Sistema Nacional de Información de Recursos Hídricos) | Gratis | Alta |
| Nivel del puerto de Manaos y alertas de crecida y bajante | Servicio Geológico de Brasil *(a verificar sistema y acceso)* | Gratis / convenio | Alta |
| Municipios | IBGE – mallas municipales | Gratis | Alta |
| Terreno sin vegetación | FABDEM (Copernicus DEM sin bosque ni edificios) *(a verificar licencia: no comercial)* | Gratis o licencia | Media |
| Historial de agua superficial | JRC Global Surface Water, Sentinel-1 | Gratis | Alta |
| Alertas meteorológicas | INMET | Gratis | Alta |
| Establecimientos de salud | CNES (Cadastro Nacional de Estabelecimentos de Saúde) *(a verificar coordenadas)* | Gratis | Alta |
| Comisarías, bomberos, farmacias, Defensa Civil | OpenStreetMap y Secretaría de Seguridad Pública de Amazonas | Gratis / convenio | Media |

### 1.6 Riesgos

| Riesgo | Consecuencia | Mitigación |
|---|---|---|
| Coordenadas pobres de escuelas rurales ribereñas | Escuelas sin riesgo calculado | Validar con SEDUC-AM y con huellas de edificios (Open Buildings) |
| Sesgo del terreno por la selva | Error en la cota de cada escuela | FABDEM o validación de cota con SEDUC-AM |
| Pocas estaciones en afluentes | Sin dato de nivel en comunidades alejadas | Estaciones virtuales satelitales (Hydroweb, SWOT) |
| Baja conectividad | Las alertas no llegan | SMS de respaldo; alertas con días de anticipación aprovechando el pulso lento |
| Ley General de Protección de Datos de Brasil (LGPD) | Restricciones sobre datos de escuelas y alumnos | Acuerdo de uso de datos con SEDUC-AM; no tratar datos personales de alumnos |
| Cuota de Open-Meteo | Fallos por cuota agotada al sumar una región | Plan comercial antes del piloto |

### 1.7 Decisión de despliegue

**Decisión: mismo código, un despliegue por región.**

La misma imagen de la aplicación se despliega una vez por región, configurada con una variable `REGION` (`corrientes`, `manaos`). Cada despliegue tiene su propia base de datos y sus propios jobs. El código no se duplica: lo que cambia por región es configuración y datos de referencia.

| Opción evaluada | A favor | En contra |
|---|---|---|
| **B. Mismo código, despliegue por región (elegida)** | Sin migración de región sobre datos en producción; cada base sigue teniendo una sola región, como hoy; separa datos entre gobiernos y facilita cumplir la LGPD y alojar en Brasil; un fallo en una región no afecta a la otra | Se operan dos despliegues (dos bases, dos schedulers); una vista regional unificada requiere leer de varias bases |
| A. Una base con varias regiones | Un solo despliegue; vista regional directa | Agregar región a unas 6 tablas y a todos los jobs: migración de alto riesgo sobre datos existentes; mezcla datos de dos gobiernos en una base |
| Copia del código | Arranque rápido | Duplica cada mejora y cada corrección; descartada |

**Relevamiento del estado actual (12/11/2026):**

- No existe concepto de región en interfaz, servidor ni base de datos.
- Ninguna tabla de riesgo, hidrología o datasets tiene columna de región. `infra_periodo` e `infra_risk_run` tienen un único registro vigente para toda la base.
- Los jobs son globales: `scripts/jobs.mjs` despacha por nombre e `infra_job_run` se identifica por `(tipo, claveIdempotente)`.
- Open-Meteo, IMERG y la grilla meteorológica ya trabajan por coordenadas o límites recibidos.
- La interfaz de río del motor (`PuertoRioPrefectura`, `EstadoRioPrefectura` en `riesgo/motor/puertos.ts`) tiene la forma de Prefectura.

Con la opción B, nada de lo anterior obliga a migrar: cada base contiene una región.

### 1.8 Conclusión de viabilidad

**Viable.** La amenaza de inundación se reutiliza casi completa. El trabajo nuevo real es:

1. La amenaza de bajante y aislamiento fluvial.
2. Un horizonte estacional de 30 a 90 días.
3. Los proveedores brasileños de nivel de río.

---

## Parte 2 — Plan técnico por fases

### Paso previo — Pruebas e2e del mapa (bloqueante)

Antes de tocar código del mapa o del motor, se implementa la suite de pruebas e2e definida en [`plan-tests-e2e-mapa-enos.md`](./plan-tests-e2e-mapa-enos.md).

- Playwright con base efímera, seed del mapa con valores esperados y cuentas QA sembradas por rol.
- Contratos de API con snapshots: son la prueba de que Corrientes da exactamente los mismos resultados tras el refactor de región.
- Flujos de navegador para pestañas, capas, filtros, popups, ficha, parte, radar, ríos, exportaciones y roles.
- Job de CI que bloquea el merge si falla.
- Indicadores del Centro de Situación que midan frescura, volumen, cobertura y plausibilidad del dato real, con pruebas que los obliguen a ponerse en rojo ante datos malos, y una sonda en producción que verifica la cadena completa (sección 9 del plan de pruebas). Es requisito para operar Manaos: sin esto, un despliegue nuevo puede verse sano con datos vacíos.

**Criterio para avanzar:** la suite corre verde en CI, cada prueba pasó la prueba de mutación y no hay pruebas inestables. Ninguna fase con código (1 en adelante) empieza antes.

### Fase 0 — Validación de datos (sin código)

- Descargar el padrón INEP de Manaos y su entorno y medir qué porcentaje de escuelas trae coordenadas utilizables.
- Listar las estaciones ANA y del Servicio Geológico de Brasil sobre los ríos Negro y Solimões y verificar su acceso.
- Confirmar la licencia de FABDEM y la cobertura de estaciones virtuales.
- Contactar a SEDUC-AM y SEMED.

**Criterio para avanzar:** al menos un padrón con coordenadas y una fuente de nivel de río con acceso confirmado.

### Fase 1 — Configuración de región (opción B)

Objetivo: que Corrientes funcione exactamente igual, pero leyendo su configuración de un único módulo en lugar de constantes repartidas por el código.

#### 1a. Módulo de configuración de región

Un módulo puro, siguiendo el patrón de `riesgo/providers/config-fuentes.ts`, por ejemplo `lib/infraestructura/region/`:

La configuración de cada región es **un archivo de datos**, no código: `config/regiones/<id>.json`, validado con un esquema (Zod) al arrancar. Sumar una región no requiere tocar tipos ni lógica.

```ts
// Esquema único; las regiones son archivos JSON que lo cumplen.
const RegionConfig = z.object({
  id: z.string(),                       // "corrientes", "manaos", ...
  nombre: z.string(),
  pais: z.string().length(2),           // ISO 3166-1: AR, BR, UY, ...
  bbox: z.object({ latMin, latMax, lonMin, lonMax }),
  vistaInicial: z.object({ centro: z.tuple([lon, lat]), zoom }),
  zonaHoraria: z.string(),              // IANA: America/Manaus
  locale: z.string(),                   // es-AR, pt-BR
  toleranciaBordeKm: z.number(),
  datasets: z.object({                  // claves de infra_dataset
    unidadesAdministrativas: z.string(),
    estacionesRio: z.string(),
    localizaciones: z.string(),
  }),
  fuentesRio: z.array(z.string()),      // ids del registro de proveedores
  fuentesAlertas: z.array(z.string()),
  estacionAncla: z.string().optional(), // hoy 'pna-corrientes'
});
```

- `regionActiva()` lee `REGION` del entorno una vez, carga y valida su archivo, y falla al arrancar si no existe o es inválido. Sin valor, usa `corrientes` para no romper el despliegue actual.
- **Registro de proveedores por id:** cada fuente de río o de alertas (`prefectura`, `ina`, `smn`, `ana`, `sgb`, `inmet`, y a futuro `dinagua`, `inumet`, `senamhi`…) se registra una vez con su id y su adaptador al puerto neutral. La región elige cuáles usa por configuración. Un país nuevo agrega un adaptador; una región nueva en un país ya soportado no agrega código.
- Cliente: la configuración pública (bbox, vista inicial, locale) se pasa desde el layout del servidor al mapa; no se lee el entorno en el navegador.

#### 1b. Reemplazar constantes de Corrientes

| Hoy | Pasa a |
|---|---|
| bbox en `riesgo/geo-perfil.ts:27-30`, `riesgo/providers/imerg.ts:82-85`, `lib/mapas/departamentos.ts:28-31` | `regionActiva().bbox` (una sola fuente) |
| `flyTo([-58.15, -29.55], 6.3)` y `fitBounds(limitesCorrientes)` en `components/mapas/map-infraestructura-page.tsx` | `vistaInicial` y `bbox` de la región, recibidos por props |
| `ubicacionEnCorrientes()` en `radar-meteo/departamentos.ts:74`, usado en `parte-mapa.ts:807,842,1040` | `ubicacionEnRegion()`: misma lógica de punto en polígono contra el dataset de unidades administrativas de la región |
| Supuesto de 25 departamentos en `riesgo/jobs/sync-seasonal.ts` y `renaper-natalidad.ts:24` | Cantidad leída del dataset de unidades administrativas |
| `America/Argentina/Buenos_Aires` y `es-AR` en `presentacion/textos-dato.ts`, `riesgo/resumen-escuela.ts`, `riesgo/estado-datos/clasificar.ts` | `zonaHoraria` y `locale` de la región |
| `GRID_VERSION = 'corrientes-0.2-v1'` en `radar-meteo/grilla.ts:3` | `${region.id}-0.2-v1` |
| Etiquetas de departamentos y ríos escritas a mano (`mapa/etiquetas.ts`, `riesgo/explicar-snapshot.ts`) | Nombres desde el dataset de referencia |
| Fallback `'Corrientes'` en `components/mapas/radar-meteo/alertas-seccion.tsx:34` | `region.nombre` |
| Máscara `public/data/mascara-corrientes.geojson` y departamentos GeoJSON | Archivos por región, nombrados por `region.id` |

#### 1c. Interfaz de río neutral

- Renombrar `PuertoRioPrefectura` a un puerto neutral de nivel de río (por ejemplo `PuertoNivelRio`) con estados genéricos: `normal`, `alerta`, `evacuacion` (se conserva el nombre actual, usado en 18 archivos), y **`bajante`** para la Fase 3.
- El adaptador de Prefectura traduce sus estados al formato neutral; el motor deja de conocer a Prefectura.
- Los casos especiales de `pna-corrientes` (`motor/altura-critica.ts`, `motor-v04/escenarios-estacion.ts`, `motor/evidencia-seco-s2.ts`) pasan a depender de `estacionAncla` y de datos de evidencia por región.
- La selección del adaptador sale de `fuenteRio` en un único punto de armado (`PuertosMotor`).

#### 1d. Jobs por región

- `scripts/jobs.mjs` no cambia de forma: cada despliegue corre sus jobs con su `REGION`.
- `jobs-esperados.ts` filtra los jobs que no aplican a la región (por ejemplo, `sync-prefectura-*` e INA no corren en Manaos; `sync-ana-*` no corre en Corrientes).
- La cuota de Open-Meteo se controla por despliegue (`om_cupo_contador` ya vive en cada base).

#### 1e. Interfaz bilingüe

- Extraer los textos de interfaz y metodología (`lib/copy/didactica.ts` y componentes del mapa) a diccionarios `es` y `pt`.
- El idioma por defecto sale de `region.locale`; el usuario puede cambiarlo.

#### 1f. Card en el hub

- En el hub de Corrientes, nueva fila de `recursos` (patrón de `lib/infraestructura/recurso-seed.ts`) "ENOS Manaos" que enlaza al despliegue de Manaos.
- Clasificar su ruta en `lib/hub-sections.ts` dentro de la sección de infraestructura.
- La card actual pasa a llamarse "ENOS Corrientes".
- La ruta `/mapas/infraestructura`, escrita a mano en unos 6 lugares de permisos (`acceso-lectura.ts`, `hub-entry-server.ts`, layout, `escuelas/[cue]/page.tsx`, `acl.ts`, `mapa-ruta.ts`), se centraliza en una constante. Ese cambio es higiene, no requisito de la opción B.

#### 1g. Pruebas

- Pruebas de `regionActiva()`: valor válido, valor desconocido (falla al arrancar), sin valor (Corrientes).
- Pruebas de `ubicacionEnRegion()` con puntos dentro, fuera y en el borde para cada región.
- Prueba de regresión: la salida del motor para Corrientes es idéntica antes y después del cambio, con los mismos datos de entrada.

**Criterio para avanzar:** Corrientes se despliega con `REGION=corrientes` (o sin variable) y el mapa, el motor y los jobs producen los mismos resultados que antes.

**Riesgo del cambio:** toca código compartido por todo el motor (contratos internos). No toca datos almacenados ni requiere migraciones.

### Fase 1.5 — Despliegue de Manaos

- Nueva aplicación en Coolify con la misma imagen, `REGION=manaos` y base de datos propia.
- Scheduler propio (Coolify Scheduled Tasks) con los jobs que aplican a Manaos.
- Secretos propios: clave de Open-Meteo, token de Earthdata, etc.
- Definir con SEDUC-AM dónde se aloja (Argentina o Brasil) según la LGPD.
- Usuarios y permisos propios: los usuarios de Amazonas no comparten base con los de Corrientes.
- Una vista regional unificada, si se necesita más adelante, se construye leyendo de las bases de cada región. No forma parte del piloto.

### Escalabilidad a muchas regiones

El objetivo es que sumar una región sea **configuración y datos, no desarrollo**.

| Caso | Qué hace falta |
|---|---|
| Nueva región en un país ya soportado (p. ej. Chaco, Pará) | Un archivo `config/regiones/<id>.json`, sus datasets de referencia y un despliegue. Sin código |
| Nueva región en un país nuevo (p. ej. Paraguay) | Lo anterior más los adaptadores de las fuentes de ese país al puerto neutral |
| Nuevo tipo de amenaza (p. ej. bajante) | Desarrollo en el motor, disponible para todas las regiones |

Piezas que lo hacen posible:

1. **Plantilla de despliegue.** Un único template (Coolify o equivalente) parametrizado por `REGION`: aplicación, base de datos, scheduler y secretos. Crear una región es instanciar la plantilla, no configurar a mano.
2. **Carga de datos de referencia por script.** Un comando `pnpm region:cargar <id>` que publica en la base de la región sus datasets (unidades administrativas, estaciones, padrón, evidencia) desde fuentes declaradas en su archivo de configuración.
3. **Prueba de contrato por región.** Una prueba que recorre todos los archivos de `config/regiones/` y verifica que son válidos, que sus datasets existen y que sus proveedores están registrados. Un error de configuración falla en CI, no en producción.
4. **Migraciones comunes.** Todas las bases comparten esquema; cada despliegue aplica las mismas migraciones al arrancar.
5. **Observabilidad central.** Cada despliegue reporta salud de jobs y fuentes a un tablero común, para no revisar N sistemas por separado.
6. **Vista regional federada.** Un servicio liviano que consulta una API de resumen de cada región (escuelas en riesgo por nivel, estado de fuentes) y arma la vista regional. Las bases no se mezclan.

**Límite de la opción B:** con muchas regiones chicas (decenas), operar una base y un scheduler por región se vuelve costoso. Si se llega a ese punto, la misma configuración de región permite pasar a la opción A (una base con columna de región) sin cambiar el motor, porque toda la lógica ya lee la región desde `regionActiva()`. Ese paso se evalúa con datos de operación, no antes.

### Fase 2 — Datos de Manaos

- Cargar como datasets versionados: padrón INEP, municipios IBGE, estaciones ANA.
- Proveedor de nivel de río ANA / Servicio Geológico de Brasil que implementa el puerto neutral de la Fase 1c.
- Proveedor de alertas INMET.
- Perfil territorial de cada escuela con FABDEM.

**Criterio para avanzar:** el mapa muestra las escuelas de Manaos con riesgo de inundación calculado.

### Fase 3 — Amenaza de bajante

- Umbrales de nivel mínimo por estación (navegabilidad), además de los máximos.
- Nivel de amenaza de bajante con la misma escala de severidad.
- Señal estacional: índices ENOS de NOAA y pronóstico estacional para el horizonte de 30 a 90 días.

**Criterio para avanzar:** los eventos de 2023 y 2024 aparecen como bajante severa.

### Fase 4 — Acceso fluvial

- Red fluvial (OSM y datos de SEDUC-AM sobre transporte escolar fluvial).
- Aislamiento por tramo de río no navegable según el nivel.
- Integración con el riesgo de acceso existente.
- **Servicios esenciales cercanos:** cargar hospitales y centros de salud (CNES), comisarías, bomberos, farmacias y Defensa Civil (OpenStreetMap y registros estaduales). Para cada escuela, mostrar el servicio más cercano de cada tipo, la distancia o tiempo de viaje (terrestre o fluvial) y si el acceso queda cortado con el nivel del río previsto.

### Fase 5 — Calibración

- Cruzar Global Surface Water y Sentinel-1 con las escuelas para los eventos de 2021 (crecida) y 2023–2024 (bajante).
- Ajustar umbrales y pesos de Manaos con esos eventos.

### Fase 6 — Alertas

- Plantillas de WhatsApp en portugués y SMS de respaldo.
- Generación de alertas en formato CAP como información de apoyo.

### Dependencias

```
Pruebas e2e ─┐
Fase 0 ──────┴──► Fase 1 ──► Fase 1.5 ──► Fase 2 ──► Fase 3 ──► Fase 4
                                      │           │
                                      └──► Fase 5 ◄┘
                                              │
                                              ▼
                                           Fase 6
```

Las pruebas e2e y la Fase 0 corren en paralelo: una es código y la otra gestión de datos. La Fase 1 necesita las dos terminadas.

---

## Parte 3 — Batches de implementación

**El detalle de cada batch (subtareas, archivos, criterios de aceptación y decisiones abiertas) está en [`plan-batches-enos.md`](./plan-batches-enos.md).** Esta sección es el resumen.

Todas las tareas de los dos planes (pruebas e2e e indicadores, y adaptación a Manaos) agrupadas en batches. Cada batch es una unidad que se revisa y se mergea entera, con sus pruebas y documentación. Las tareas `T#` remiten a [`plan-tests-e2e-mapa-enos.md`](./plan-tests-e2e-mapa-enos.md); las `I#` a su sección 9.3.

### Resumen

| Batch | Nombre | Tareas | Depende de | En paralelo con | Riesgo |
|---|---|---|---|---|---|
| **B1** | Entorno de pruebas | T1, T2, T5 | — | B0 | Bajo |
| **B2** | Seed y contratos de API | T3, T4 | B1 | B0 | Bajo |
| **B3a** | E2E: acceso, pestañas, capas, filtros | T6, T7 | B2 | B3b, B3c | Bajo |
| **B3b** | E2E: popups, ficha, parte | T8 | B2 | B3a, B3c | Bajo |
| **B3c** | E2E: radar, ríos, riesgo, estadísticas, exportaciones, controles | T9, T10 | B2 | B3a, B3b | Bajo |
| **B4** | CI bloqueante | T11 | B3a, B3b, B3c | B0 | Medio (entrega) |
| **B5** | Indicadores: frescura y volumen | T12 parcial, I1, I2, I3, I8 | B4 | B6 | Medio |
| **B6** | Indicadores: plausibilidad, cobertura y presentación | T12 parcial, I4, I5, I6, I7, I9, I10, I11 | B4 | B5 | Medio |
| **B7** | Sonda en producción | T14 | B5, B6 | — | Medio |
| **B0** | Validación de datos de Manaos (sin código) | Fase 0 | — | B1–B7 | — |
| **B8** | Configuración de región | Fase 1a, 1b, 1g | B4, B0 | — | **Alto** (contratos internos) |
| **B9** | Río neutral y jobs por región | Fase 1c, 1d | B8 | B10 | **Alto** (contratos internos) |
| **B10** | Interfaz bilingüe y card del hub | Fase 1e, 1f | B8 | B9 | Bajo |
| **B11** | Despliegue de Manaos | Fase 1.5 | B9, B10 | — | **Alto** (entrega e infraestructura) |
| **B12** | Datos y proveedores de Manaos | Fase 2 | B11 | — | Medio |
| **B13** | Amenaza de bajante y horizonte estacional | Fase 3 | B12 | B14 | Medio |
| **B14** | Acceso fluvial y servicios esenciales | Fase 4 | B12 | B13 | Medio |
| **B15** | Calibración | Fase 5 | B13, B14 | B16 | Medio |
| **B16** | Alertas (WhatsApp, SMS, CAP) | Fase 6 | B13 | B15 | Medio |

### Flujo

```
B0 (datos Manaos, gestión) ───────────────────────────────┐
                                                          │
B1 ─► B2 ─┬─► B3a ─┐                                      │
          ├─► B3b ─┼─► B4 ─┬─► B5 ─┐                      │
          └─► B3c ─┘       └─► B6 ─┴─► B7                 │
                           │                              │
                           └──────────────────────────────┴─► B8 ─┬─► B9  ─┐
                                                                  └─► B10 ─┴─► B11 ─► B12 ─┬─► B13 ─┬─► B15
                                                                                           └─► B14 ─┘   B16 (desde B13)
```

**Compuerta principal:** B8 no empieza hasta que B4 esté verde en CI. B5–B7 no bloquean B8, pero conviene que estén antes de B11 para que el despliegue de Manaos nazca con indicadores que dicen la verdad.

### Detalle por batch

#### B1 — Entorno de pruebas
- Config de Playwright para `e2e/mapa-enos/`, base PostgreSQL efímera, app en modo producción.
- Estilo de MapLibre local; `RISK_RADAR_ENABLED=true` y banderas del mapa en el entorno de prueba.
- Cuentas QA sembradas por rol y `storageState` por cuenta.
- Gancho `window.__mapaE2E` solo con `NEXT_PUBLIC_E2E=true`, más la prueba de que no existe en producción.
- **Cierre:** el mapa dibuja en una prueba y cada cuenta QA inicia sesión.

#### B2 — Seed y contratos de API
- Seed del mapa (~30 CUEs) con las funciones de la aplicación, no SQL a mano.
- Manifiesto de valores esperados.
- Snapshots de las APIs del mapa con campos volátiles normalizados.
- **Cierre:** snapshots versionados; prueba de mutación fallando al alterar un dato del seed.

#### B3a / B3b / B3c — Flujos e2e
- Tres batches independientes, con superficies separadas (`e2e/mapa-enos/acceso-*`, `ficha-*`, `radar-*`…), que pueden ir en paralelo.
- **Cierre de cada uno:** cada prueba pasó su prueba de mutación; sin esperas fijas.

#### B4 — CI bloqueante
- Job `e2e-mapa` en `.github/workflows/ci.yml` con PostgreSQL de servicio; reporte y trazas como artefactos.
- Se suman las suites existentes (`hub-access`, `reportes-offline`).
- **Cierre:** verde en un PR, rojo con un cambio roto a propósito, menos de 15 minutos, 10 corridas sin inestabilidad.

#### B5 — Indicadores: frescura y volumen
- Escenarios de falla: corrida vieja con corte nuevo, job con 0 filas, fuente `ok` sin filas, jobs apagados.
- Primero las pruebas en rojo con el código actual; después I1, I2, I3, I8.

#### B6 — Indicadores: plausibilidad, cobertura y presentación
- Escenarios: sensor trabado, valor atípico, hueco de IMERG, cobertura del 20%, fuente degradada, sin corrida vigente, enlace de verificación vencido, dataset fuera de vigencia.
- Primero en rojo; después I4, I5, I6, I7, I9, I10, I11.
- **Cierre de B5 y B6:** el escenario sano de control sigue en verde.

#### B7 — Sonda en producción
- Job horario con escuelas y estaciones testigo; indicador "Cadena de datos verificada" en el Centro de Situación.
- **Cierre:** alerta probada con una escuela testigo inexistente.

#### B0 — Validación de datos de Manaos
- Padrón INEP con coordenadas, estaciones ANA y del Servicio Geológico de Brasil, licencia de FABDEM, estaciones virtuales, contacto con SEDUC-AM y SEMED.
- Corre desde el día uno, en paralelo con todo el bloque de pruebas.

#### B8 — Configuración de región
- Esquema de región, `config/regiones/corrientes.json`, `regionActiva()`.
- Reemplazo de todas las constantes de la tabla de la Fase 1b.
- **Cierre:** snapshots de API de B2 idénticos y suite e2e verde sin cambios en las pruebas.

#### B9 — Río neutral y jobs por región
- Puerto de nivel de río neutral, adaptador de Prefectura, registro de proveedores por id, `estacionAncla`.
- Filtro de jobs por región en `jobs-esperados.ts`.
- **Cierre:** mismos snapshots de B2; jobs de Corrientes sin cambios.

#### B10 — Interfaz bilingüe y card del hub
- Diccionarios `es` y `pt`; idioma por defecto de la región.
- Card "ENOS Manaos", la actual renombrada a "ENOS Corrientes", y clasificación en `hub-sections.ts`.
- **Cierre:** suite e2e verde en español; pruebas nuevas de cambio de idioma.

#### B11 — Despliegue de Manaos
- Plantilla de despliegue por región, `config/regiones/manaos.json`, base, scheduler y secretos propios.
- Script `region:cargar` y prueba de contrato de regiones.
- **Cierre:** Manaos responde con el mapa vacío pero sano, y el Centro de Situación lo muestra honestamente sin datos.

#### B12 — Datos y proveedores de Manaos
- Datasets INEP, IBGE y estaciones; adaptadores ANA/SGB e INMET; perfil territorial con FABDEM.
- Seed e2e de Manaos y snapshots propios.
- **Cierre:** escuelas de Manaos con riesgo de inundación calculado.

#### B13 — Bajante y horizonte estacional
- Umbrales mínimos, nivel de amenaza de bajante, señal ENOS y horizonte de 30 a 90 días.
- **Cierre:** los eventos de 2023 y 2024 aparecen como bajante severa.

#### B14 — Acceso fluvial y servicios esenciales
- Red fluvial, aislamiento por tramo no navegable, servicios cercanos (CNES, OSM) con acceso cortado o no.

#### B15 — Calibración
- Global Surface Water y Sentinel-1 contra escuelas en 2021 y 2023–2024; ajuste de umbrales y pesos.

#### B16 — Alertas
- Plantillas de WhatsApp en portugués, SMS de respaldo, CAP como información de apoyo.

### Regla para los batches de riesgo alto

B8, B9 y B11 se commitean y revisan solos, sin mezclar con otros cambios. B8 y B9 se dan por buenos solo si los snapshots de API de B2 quedan idénticos para Corrientes.

## Pendientes de verificación

- Coordenadas en el catálogo del INEP.
- Sistema de alertas del Servicio Geológico de Brasil para el puerto de Manaos y su acceso.
- Formato CAP de las alertas del INMET.
- Licencia de FABDEM.
- Cobertura de estaciones virtuales (Hydroweb, SWOT) en los ríos Negro y Solimões.
