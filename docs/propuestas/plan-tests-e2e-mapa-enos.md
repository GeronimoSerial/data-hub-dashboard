# Plan de pruebas e2e del mapa ENOS

**Documento interno — prerrequisito de la adaptación multi-región**
Estado: borrador. Fecha: 12/11/2026.
Herramienta: Playwright. Entorno: base de datos efímera con datos de prueba controlados y cuentas QA sembradas.

---

## 1. Objetivo

Que cada funcionalidad del mapa ENOS tenga una prueba de extremo a extremo que **falle si la funcionalidad se rompe**. Es la red de seguridad para el refactor de región (Fase 1 del plan de Manaos): Corrientes tiene que comportarse exactamente igual antes y después.

## 2. Diagnóstico del estado actual (12/11/2026)

| Hallazgo | Consecuencia |
|---|---|
| Hay dos suites de Playwright (`playwright.config.ts`, `e2e/hub-access/playwright.config.mjs`) y ninguna corre en CI (`.github/workflows/ci.yml` solo corre lint, tipos, build y vitest) | Las regresiones no se detectan antes del merge |
| Las únicas pruebas del mapa verifican que la ruta abre y que el acceso se niega (`e2e/hub-access/hub-access.spec.ts`) o leen el título (`e2e/reportes-offline/reportes-offline.spec.ts`) | No prueban ninguna funcionalidad real |
| La base de prueba no tiene departamentos, escuelas, estaciones ni pronósticos; el dataset de departamentos responde 503 | El mapa se renderiza vacío |
| `isolateExternalCalls` responde 204 a toda petición externa, incluido el estilo del mapa base (`tiles.openfreemap.org`) | MapLibre nunca dibuja: capas y popups no se pueden probar |
| `RISK_RADAR_ENABLED` no está definido en el entorno de prueba | La pestaña de radar y sus rutas responden 404 |
| Solo se siembran usuarios `admin` y `consulta` | No se prueban `director_nivel`, `admin_ge` ni `operador_establecimiento` |

Dato a favor: en tiempo de petición, el mapa lee todo de la base de datos. Las fuentes externas (Open-Meteo, Prefectura, INA, SMN, IMERG) solo las llaman los jobs. Por eso alcanza con **datos sembrados en la base**; no hace falta simular servicios externos.

## 3. Reglas de calidad de las pruebas

Una prueba que no puede fallar no prueba nada. Cada prueba cumple:

1. **Afirma un efecto observable concreto**: un valor, una cantidad, un texto, un estado persistido. Nunca solo "la página carga" o "el título existe".
2. **Usa datos conocidos del seed**: si el seed tiene 4 escuelas en riesgo alto en Goya, la prueba espera 4, no "más de 0".
3. **Recorre la interfaz pública** como un usuario: clic, teclado, navegación. No llama funciones internas.
4. **Es independiente**: no depende del orden ni del estado que deja otra prueba. Las que escriben datos restauran la base o usan registros propios.
5. **Prueba de mutación al escribirla**: se rompe a propósito la funcionalidad (o se cambia el dato del seed) y se confirma que la prueba falla. Si no falla, se reescribe.
6. **Sin esperas fijas** (`waitForTimeout`): se espera por condiciones (respuesta de red, elemento visible, evento del mapa).

## 4. Arquitectura

### 4.1 Entorno

- Un único `playwright.config.ts` para el mapa (`e2e/mapa-enos/`), separado de las suites existentes.
- Base PostgreSQL efímera por corrida (contenedor en CI, base temporal en local). Se aplican las migraciones y luego el seed.
- Variables de entorno de prueba: `RISK_RADAR_ENABLED=true` y las demás banderas del mapa encendidas; secretos de prueba; ninguna clave real.
- La aplicación corre en modo producción (`pnpm build` + `pnpm start`) para probar lo que se despliega.

### 4.2 Cuentas QA sembradas

Cuentas fijas y compartidas por todas las corridas, creadas por el seed con Better Auth. Mismo email y contraseña siempre, definidos en `e2e/mapa-enos/cuentas-qa.ts` (contraseñas solo de prueba, nunca usadas fuera de la base efímera).

| Cuenta | Rol | Alcance | Qué debe poder hacer |
|---|---|---|---|
| `qa-admin@e2e.local` | `admin` | Total | Todo, incluido nominal y exportaciones |
| `qa-admin-ge@e2e.local` | `admin_ge` | Total | Ver el mapa y cargar partes |
| `qa-director-nivel@e2e.local` | `director_nivel` | Un nivel con escuelas en el seed | Ver solo las escuelas de su nivel |
| `qa-director-sin-alcance@e2e.local` | `director_nivel` | Nivel sin escuelas | Acceso denegado al mapa |
| `qa-consulta-infra@e2e.local` | `consulta` | Sección infraestructura y recurso habilitado | Ver el mapa, sin nominal |
| `qa-consulta-sin-infra@e2e.local` | `consulta` | Sin sección infraestructura | Acceso denegado (observado: redirige a su destino del hub, `/reportes`, sin pantalla de denegación; la prueba afirma ese comportamiento real) |
| `qa-operador@e2e.local` | `operador_establecimiento` | Una escuela | Parte de su escuela, sin mapa |

- **Login una sola vez por cuenta**: un proyecto `setup` de Playwright inicia sesión con cada cuenta y guarda su `storageState`. Las pruebas reutilizan la sesión, lo que evita el límite de 3 intentos cada 10 segundos de Better Auth.
- Los nombres de cuenta se mantienen estables: cualquier persona del equipo puede abrir la base efímera e iniciar sesión con ellas para reproducir un fallo.

### 4.3 Seed del mapa

Un recorte chico y real de Corrientes, versionado en `e2e/mapa-enos/seed/`, armado reutilizando los fixtures existentes (`lib/infraestructura/datasets/__fixtures__`, `radar-meteo/__fixtures__`, `hidrometria/__fixtures__`, `test-utils/parte-fixtures.ts`).

| Contenido | Cantidad aproximada | Para probar |
|---|---|---|
| Departamentos (GeoJSON) y máscara | 3–4 departamentos | Límites, nombres, filtro por departamento |
| Escuelas con coordenadas | ~30 CUEs | Puntos, popups, ficha, búsqueda |
| Escuelas sin coordenadas | 2 | Estado "sin ubicación" en la ficha |
| Partes en distintos estados | Vigente, sin actualizar, solucionado reciente, con comedor | Filtros y chips |
| Estaciones de río y lecturas | 3 estaciones, una en alerta | Capa de estaciones y tarjeta |
| Grilla de lluvia observada | Celdas sobre los departamentos | Capa de lluvia |
| Corrida de riesgo vigente | Escuelas en cada nivel (bajo, moderado, alto, muy alto) | Escuelas en riesgo, ficha de riesgo |
| Escuelas aisladas y accesos | 2–3 | Capas de aislamiento y ruta de acceso |
| Corrida de radar meteorológico y alertas SMN | 1 corrida, 1 alerta | Pestaña de radar |
| Historial de partes | 1 escuela con varios cambios | Modal de historial |

El seed incluye un **manifiesto de valores esperados** (`seed/esperados.ts`): cantidades por nivel, por departamento, por filtro. Las pruebas leen de ahí; si cambia el seed, cambia en un solo lugar.

### 4.4 Mapa base local

- Estilo de MapLibre local (`e2e/mapa-enos/estilo-prueba.json`) con fondo liso y sin tiles externos, servido por la propia aplicación cuando corre en modo e2e.
- `isolateExternalCalls` sigue bloqueando todo lo externo, pero el mapa ahora dibuja.

### 4.5 Cómo probar el canvas del mapa

MapLibre dibuja en un canvas: los puntos no son elementos del DOM. Se usan tres técnicas, en este orden de preferencia:

1. **Lo que el usuario ve fuera del canvas**: contadores, listas laterales, leyenda, panel de escuelas en riesgo, popups (sí son DOM).
2. **Gancho de prueba**: solo cuando la app corre con `NEXT_PUBLIC_E2E=true`, el componente del mapa expone `window.__mapaE2E` con `capasVisibles()`, `featuresRenderizadas(capa)` y `proyectar(lon, lat)`. Permite afirmar qué está dibujado y hacer clic sobre una escuela en su coordenada real. En producción no existe.
3. **Captura visual** del mapa con el estilo local, comparada contra una referencia, solo para vistas estables (máscara, límites, colores de nivel). Tolerancia de píxeles definida; se actualiza a conciencia, nunca automáticamente.

### 4.6 Capa de contratos de API

Antes que la interfaz, se fijan las respuestas de las APIs del mapa sobre el seed:

- `/api/mapas/infraestructura/{escuelas,totales,territorio,parte,historial,evolucion,nominal}`
- `/api/infraestructura/{riesgo/escuela/[cue],radar,radar-meteo,radar-meteo/alertas,hidrometria/estaciones,peligro/observado-grilla,exportar}`

Cada respuesta se compara contra un snapshot JSON versionado, con los campos volátiles normalizados (fechas de generación, ids). **Es la prueba central del refactor de región**: si un número cambia, falla.

Se escriben con el `request` de Playwright, autenticado con las cuentas QA, en la misma suite.

## 5. Inventario de pruebas

### 5.1 Acceso y roles

| Prueba | Afirma |
|---|---|
| Cada cuenta QA entra o es rechazada según la tabla 4.2 | URL final (`/mapas/infraestructura` o `/forbidden` o login) |
| `director_nivel` ve solo su alcance | Cantidad de escuelas = esperado para su nivel |
| Enlace y modal nominal | Visibles para `admin`, ausentes para `consulta` |
| Usuario anónimo | Redirige al login y vuelve al mapa después de iniciar sesión |

### 5.2 Pestañas

| Pestaña | Afirma |
|---|---|
| Navegación por hash (`#actual`, `#radar`, `#planificacion`, `#estadisticas`, `#metodologia`, `#exportar`) | Panel visible correcto (`data-testid`) |
| Alias `#operativa` → actual, `#evolucion` → estadísticas, `?modo=radar` | Pestaña resuelta |
| Radar apagado por bandera | Cae a la pestaña actual (prueba con entorno sin bandera) |
| El mapa queda montado al cambiar de pestaña | Al volver, mantiene zoom y capas |

### 5.3 Capas

| Prueba | Afirma |
|---|---|
| Valores por defecto | Las 6 capas encendidas y las 2 apagadas según `capas.ts` |
| Encender y apagar cada una de las 8 capas | `featuresRenderizadas(capa)` pasa de N a 0 y vuelve |
| Persistencia | Tras recargar, el estado se conserva (`mapa-infraestructura:capas-visibles:v2`) |
| Leyenda | Refleja las capas encendidas |

### 5.4 Filtros y búsqueda

| Prueba | Afirma |
|---|---|
| Cada filtro (departamento, dirección, gravedad, clase, apoyo, sin actualizar, solucionadas recientes, con comedor) | Cantidad de escuelas = esperado del manifiesto |
| Combinación de filtros | Intersección esperada |
| Quitar chips | Vuelve al total |
| Búsqueda por nombre y por CUE | Resultado correcto, centra el mapa en la escuela |

### 5.5 Popups y ficha de escuela

| Prueba | Afirma |
|---|---|
| Clic en una escuela del mapa | Popup con nombre, CUE y nivel de riesgo esperado |
| Del popup a la ficha | Navega a `/mapas/infraestructura/escuelas/<cue>` |
| Secciones de la ficha (`#panorama`, `#situaciones`, `#historial`, `#territorio`) | Contenido esperado del seed en cada una |
| Escuela sin coordenadas | Muestra `ficha-sin-ubicacion` |
| Escuela sin situaciones | Muestra `ficha-sin-situaciones` |
| Chips vigente / sin actualizar | Coinciden con el estado del parte |
| Riesgo de la escuela | Nivel, confianza y componentes esperados |
| `volver-al-mapa` y `abrir-mapa` | Vuelve al mapa centrado en la escuela |

### 5.6 Parte

| Prueba | Afirma |
|---|---|
| Actualizar parte desde la ficha (`accion-actualizar-parte`) | El cambio persiste: se ve en la ficha y en el historial |
| Historial | Lista de cambios esperada, en orden |
| Permisos | `consulta` no ve la acción; `operador` solo en su escuela |

### 5.7 Radar, ríos y lluvia

| Prueba | Afirma |
|---|---|
| Pestaña de radar | Resumen y escuelas con el nivel esperado de la corrida sembrada |
| Alertas SMN | Alerta sembrada visible con su zona |
| Tarjeta de escuela en radar | Datos esperados |
| Estaciones de río | 3 estaciones; la que está en alerta se destaca |
| Tarjeta de estación | Últimas lecturas esperadas |
| Lluvia observada | Celdas dibujadas sobre los departamentos |

### 5.8 Escuelas en riesgo y aisladas

| Prueba | Afirma |
|---|---|
| Panel de escuelas en riesgo | Lista y cantidades por nivel = manifiesto |
| Escuelas aisladas y ruta de acceso | Escuelas y rutas esperadas |

### 5.9 Estadísticas, metodología y exportaciones

| Prueba | Afirma |
|---|---|
| Estadísticas y evolución | Totales y series esperados |
| Metodología | Secciones presentes y simuladores responden a cambios de entrada |
| Exportar | El archivo descargado tiene las columnas y filas esperadas |
| Exportar situación CSV | Filas esperadas según filtros |

### 5.10 Controles del mapa

| Prueba | Afirma |
|---|---|
| Zoom, pantalla completa, cambio de mapa base | Cambia el estado del mapa (zoom, estilo activo) |
| Vista móvil (iPhone 13) | Panel y controles accesibles; flujo popup → ficha funciona |

## 6. Integración continua

- Nuevo job `e2e-mapa` en `.github/workflows/ci.yml`: PostgreSQL de servicio, build, migraciones, seed, Playwright con Chromium.
- Corre en cada PR que toque `app/(hub)/mapas`, `components/mapas`, `lib/infraestructura`, `lib/mapas`, `drizzle` o `e2e/mapa-enos`. **Bloquea el merge si falla.**
- Guarda como artefacto el reporte HTML, trazas y capturas de las pruebas fallidas.
- Las suites existentes (`hub-access`, `reportes-offline`) se suman al mismo job.

## 7. Orden de implementación

| Paso | Contenido | Criterio de cierre |
|---|---|---|
| T1 | Entorno: config de Playwright, base efímera, estilo local, banderas | El mapa dibuja en la prueba |
| T2 | Cuentas QA sembradas y `storageState` por rol | Cada cuenta inicia sesión |
| T3 | Seed del mapa y manifiesto de valores esperados | APIs devuelven los datos sembrados |
| T4 | Contratos de API (snapshots) | Snapshots versionados; prueba de mutación falla |
| T5 | Gancho `window.__mapaE2E` solo en modo e2e | Se puede afirmar qué está dibujado |
| T6 | Acceso y roles (5.1) | |
| T7 | Pestañas, capas, filtros (5.2–5.4) | |
| T8 | Popups, ficha y parte (5.5–5.6) | |
| T9 | Radar, ríos, lluvia, riesgo, aisladas (5.7–5.8) | |
| T10 | Estadísticas, metodología, exportaciones, controles (5.9–5.10) | |
| T11 | Job de CI bloqueante | Corre verde en un PR y rojo con un cambio roto a propósito |

## 8. Criterio de terminado

- Toda funcionalidad del inventario de la sección 5 tiene al menos una prueba.
- Cada prueba pasó la prueba de mutación (regla 5).
- La suite corre en CI en menos de 15 minutos y bloquea el merge.
- Cero pruebas inestables en 10 corridas seguidas.

## 9. Indicadores del Centro de Situación que prueben algo real

### 9.1 Diagnóstico (12/11/2026)

Hoy la mayoría de los indicadores responden a la pregunta "¿se escribió una fila hace poco?" y no a "¿lo que muestra el mapa está fresco, completo y es correcto?".

| Indicador | Qué chequea hoy | Caso en que está en verde con datos malos |
|---|---|---|
| Hora del corte / "Desactualizado" (`situacion-client.tsx:240-251`) | Que el job del corte corrió | El cálculo de riesgo está muerto hace una semana; el corte se sigue generando cada hora sobre la corrida vieja y muestra hora actual (`situacion/corte.ts:66-73`) |
| Estado de jobs (`estado-datos/clasificar.ts:108-159`) | Que el job terminó sin error en término | El job terminó sin escribir filas: `contadores` se guarda pero nunca se lee |
| Salud de fuentes (`jobs/salud-fuente.ts`) | Que no hubo errores por celda | La fuente devolvió listas vacías: `ok` con cero filas |
| Prefectura (`clasificar.ts:161-195`) | Que cada estación tiene alguna lectura de menos de 18 h | Sensor trabado repitiendo el mismo valor |
| IMERG (`clasificar.ts:216-236`) | Que el último dato tiene menos de 6 h | Huecos en la serie del día |
| Datasets (`clasificar.ts:301-316`) | Que está publicado | Publicado hace años: siempre `ok` |
| Jobs apagados (`ENOS_JOBS_ENABLED=false`) | Pasan a `deshabilitado`, que no cuenta como problema | El resumen dice "Todos los datos al día" con los jobs detenidos |
| KPI "Fuentes vencidas" (`corte.ts:121-132`) | Solo antigüedad del último éxito | Fuente `degradado`: el KPI dice 0 y el panel la marca fallida en la misma página |
| Prioridades (`situacion/consulta.ts:110`) | Lista de escuelas en riesgo alto | Sin corrida vigente devuelve lista vacía y muestra "Sin escuelas en riesgo alto", igual que un "todo tranquilo" |
| Verificaciones (`lib/infraestructura/verificaciones.ts`) | Que se registró una respuesta con un enlace válido | Responde cualquiera que tenga el enlace; "Pendiente" sigue visible con el enlace vencido (`verificaciones-cola.tsx:29-43`) |

### 9.2 Principio

**Un indicador en verde tiene que ser una afirmación verificable sobre el dato que ve el usuario**, no sobre el proceso que lo produjo. Cada indicador mide cuatro cosas, según aplique:

| Dimensión | Pregunta | Ejemplo |
|---|---|---|
| Frescura del dato | ¿Qué edad tiene el dato que usa el mapa? | Edad de la corrida de riesgo detrás del corte, no la hora del corte |
| Volumen | ¿Se escribió lo esperado? | Filas escritas por el job contra el mínimo esperado (`contadores`) |
| Cobertura | ¿Qué parte del territorio tiene dato? | % de escuelas con evidencia; estaciones con lectura; celdas con pronóstico |
| Plausibilidad | ¿El valor tiene sentido? | Estación sin variación en N lecturas; altura fuera del rango histórico; saltos imposibles |

Y una regla de presentación: **"sin dato" nunca se muestra igual que "todo bien"**.

### 9.3 Cambios en los indicadores

| # | Cambio | Indicador afectado |
|---|---|---|
| I1 | La frescura del corte se calcula con la edad de la corrida de riesgo y de las lecturas que usa, no con la hora del corte | Encabezado |
| I2 | Un job que termina con menos filas que su mínimo esperado queda `sin_datos`; se muestran las filas escritas | Jobs, página de operación |
| I3 | Salud de fuente `ok` exige filas escritas, no solo ausencia de errores | Fuentes |
| I4 | Detección de sensor trabado y valores fuera del rango histórico de 365 días | Prefectura e INA |
| I5 | Huecos en la serie de IMERG del día | IMERG |
| I6 | Cobertura visible: % de escuelas con evidencia en la corrida, junto al KPI de riesgo alto | KPIs |
| I7 | El KPI "Fuentes vencidas" usa el mismo criterio que el panel de estado | KPIs |
| I8 | Jobs apagados cuentan como problema en el resumen | Estado de los datos |
| I9 | Sin corrida vigente, Prioridades muestra "Sin cálculo de riesgo disponible", no "sin escuelas en riesgo" | Prioridades |
| I10 | Verificaciones: estado "Enlace vencido"; registro de quién respondió (correo o canal); la respuesta asistida exige observación | Verificaciones |
| I11 | Datasets: antigüedad visible y aviso cuando supera su vigencia esperada | Datasets |

### 9.4 Pruebas: cada indicador tiene que ponerse en rojo

La prueba de un indicador no es que se vea verde, sino que **se ponga en rojo cuando el dato está mal**. Al seed de la sección 4.3 se suman escenarios de falla que se cargan por prueba:

| Escenario sembrado | El indicador debe mostrar |
|---|---|
| Corrida de riesgo de hace 7 días con corte nuevo | Encabezado "Desactualizado" (I1) |
| Job terminado con 0 filas | Job `sin_datos` con "0 filas" (I2) |
| Fuente `ok` sin filas escritas | Fuente con problema (I3) |
| Estación con 12 lecturas idénticas | "Posible sensor trabado" (I4) |
| Lectura fuera del rango histórico | Aviso de valor atípico (I4) |
| Serie IMERG con hueco de 3 h | Aviso de huecos (I5) |
| Corrida con 20% de escuelas con evidencia | Cobertura 20% junto al KPI (I6) |
| Fuente `degradado` dentro del TTL | KPI y panel coinciden en marcarla (I7) |
| `ENOS_JOBS_ENABLED=false` | Resumen con problema, no "Todos los datos al día" (I8) |
| Sin corrida vigente | "Sin cálculo de riesgo disponible" (I9) |
| Verificación con enlace vencido | "Enlace vencido" (I10) |
| Dataset publicado fuera de vigencia | Aviso de antigüedad (I11) |
| Todo sano | Todo en verde (control) |

Cada escenario se prueba en dos niveles: **unitario** sobre la función de clasificación y **e2e** en la página del Centro de Situación con la cuenta `qa-admin`.

### 9.5 Sonda en producción (canario)

Las pruebas de CI usan datos sembrados; en producción hace falta comprobar que el dato real recorre toda la cadena. Un job de sonda, cada hora:

1. Elige 3 escuelas testigo y 2 estaciones testigo por región.
2. Verifica que la API del mapa devuelve para ellas una corrida de riesgo de menos de N horas y lecturas de río de menos de 18 h.
3. Compara la última lectura de Prefectura guardada con la publicada en la fuente.
4. Registra el resultado como un indicador más del Centro de Situación ("Cadena de datos verificada a las HH:MM") y alerta si falla.

### 9.6 Orden de implementación

Se suma después de T11:

| Paso | Contenido | Criterio de cierre |
|---|---|---|
| T12 | Escenarios de falla en el seed (9.4) y pruebas en rojo | Cada prueba falla con el código actual (rojo observado) |
| T13 | Cambios I1–I11 | Las pruebas de T12 pasan y el escenario sano sigue en verde |
| T14 | Sonda en producción (9.5) | Indicador visible en el Centro de Situación; alerta probada con una escuela testigo inexistente |

## 10. Riesgos

| Riesgo | Mitigación |
|---|---|
| Pruebas inestables por el canvas | Gancho de prueba y esperas por eventos del mapa (`idle`), nunca por tiempo |
| El seed se desactualiza respecto del esquema | Se carga con las mismas funciones de la aplicación, no con SQL a mano |
| Snapshots que se actualizan sin revisar | Actualizar snapshots requiere un comando explícito y queda en el diff del PR |
| El gancho de prueba llega a producción | Prueba que verifica que `window.__mapaE2E` no existe en el build de producción |
