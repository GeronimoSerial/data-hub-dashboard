# Investigación: inundaciones y afectaciones hidrometeorológicas en Corrientes (octubre 2026)

Investigación con evidencias, auditoría del sistema de mapas de infraestructura escolar y plan de mejoras para detectar inundaciones y afectaciones. **No modifica código ni configuración del repositorio.** Los cambios operativos hechos por el orquestador el 2026-10-13 en producción y staging (con autorización del equipo) están registrados aparte en [10](10-cambios-operativos-2026-10-13.md).

| Dato | Valor |
|---|---|
| Ventana investigada | desde el miércoles 7 de octubre de 2026 hasta el corte (ampliada por el equipo el 2026-10-13; originalmente desde el 8/10). Lo anterior al 7/10 queda como contexto o excluido |
| Corte de investigación | 2026-10-13 ~12:45 (America/Argentina/Buenos_Aires) |
| Novedades posteriores al corte | no aplica: la sesión se ejecutó el mismo día del corte original pedido (13 oct) |
| Datos operativos | base productiva (acceso de solo lectura provisto por el equipo), consulta 2026-10-13 ~12:30 ART, transacción de solo lectura; configuración de la app de producción (flags y tareas programadas) observada 2026-10-13 ~13:20–13:45 ART |

## Índice

| Documento | Contenido |
|---|---|
| [01-resumen-ejecutivo.md](01-resumen-ejecutivo.md) | Hechos respaldados, alcance territorial, riesgos vigentes, vacíos, consecuencias educativas |
| [02-registro/](02-registro/) | Datos estructurados (ver tabla siguiente) |
| [03-auditoria-sistema.md](03-auditoria-sistema.md) | Qué detecta, estima y muestra hoy el sistema; código vs configuración observada vs supuestos |
| [04-matriz-caso-sistema.md](04-matriz-caso-sistema.md) | Caso → estado del sistema → clasificación → causa → mejora → validación |
| [05-diseno-deteccion.md](05-diseno-deteccion.md) | Flujo, entidades, estados, contratos de datos, reglas de vinculación, revisión humana |
| [06-plan-mejoras.md](06-plan-mejoras.md) | Acciones priorizadas con evidencia, archivos, dependencias, esfuerzo, riesgos y aceptación |
| [07-actualizacion-continua.md](07-actualizacion-continua.md) | Frecuencia por fuente, vigencia, reintentos, deduplicación, supervisión |
| [08-evaluacion.md](08-evaluacion.md) | Conjunto de referencia, métricas, circularidad, procedimiento reproducible |
| [09-preguntas-limitaciones.md](09-preguntas-limitaciones.md) | Decisiones del equipo y limitaciones no resueltas |
| [10-cambios-operativos-2026-10-13.md](10-cambios-operativos-2026-10-13.md) | Cambios operativos hechos el 2026-10-13 en producción y staging (tareas programadas, ejecuciones manuales) y cómo revertirlos |
| [scripts/](scripts/) | Generador del registro y script offline de contraste con snapshot |

### Registro (`02-registro/`)

| Archivo | Contenido |
|---|---|
| [eventos.csv](02-registro/eventos.csv) | Un registro por hecho territorial (ID `EV-AAAAMMDD-NNN`) |
| [evidencias.csv](02-registro/evidencias.csv) | Un registro por documento o fuente (ID `EVD-NNN`); varias evidencias pueden sostener un evento |
| [eventos.geojson](02-registro/eventos.geojson) | Los mismos eventos en GeoJSON WGS84; **todas las geometrías son `null`** porque ningún hecho tiene ubicación de incidente respaldada |
| [pronosticos-avisos.csv](02-registro/pronosticos-avisos.csv) | Alertas y pronósticos (ID `AV-NNN`), separados de los hechos |
| [cobertura-busqueda.csv](02-registro/cobertura-busqueda.csv) | Matriz de los 25 departamentos, cursos de agua, temas y fuentes inaccesibles, para la ventana desde el 7/10 |
| [excluidos.csv](02-registro/excluidos.csv) | Páginas descartadas (fecha de render, otro año, sin fecha verificable) |

## Convenciones

**Identificadores.** `EV-AAAAMMDD-NNN`: la fecha es la del primer reporte o inicio aproximado del hecho (hora argentina); `NNN` es correlativo dentro del día. `EVD-001..099` son fuentes públicas; `EVD-101..199` son datos del sistema. `AV-NNN` son avisos y pronósticos. Los IDs no se reutilizan: un registro descartado se marca, no se renumera.

**Fechas.** Cada registro separa fecha del hecho (`inicio_evento`, `fin_evento`), publicación, actualización y consulta. Una fecha de encabezado de página no se toma como fecha de publicación sin confirmarla en el cuerpo o firma.

**Estado temporal** (`estado_temporal`):

| Valor | Significado |
|---|---|
| `ocurrido` | el hecho sucedió y no implica continuidad (por ejemplo, una lluvia medida) |
| `vigente_segun_ultimo_reporte` | el último reporte disponible lo describe en curso; no prueba que siga |
| `resuelto_explicito` | una fuente informa la resolución |
| `evolucion_desconocida` | no hay reporte de continuidad ni de resolución |

**Confianza:** `alta` (fuente oficial consultada directamente), `media` (prensa con fecha y fuente identificada, o varias notas concordantes), `baja` (fuente única sin fecha verificable o sin URL registrada), `muy baja` (solo resumen de buscador o muro de pago). La columna `verificacion` indica si el orquestador abrió la fuente (`verificado por orquestador`) o si proviene de investigadores delegados sin reverificación. Las evidencias EVD-021..060 pasaron por una verificación de URL (2026-10-13) con este vocabulario: `verificada_url` (la nota abierta sostiene lo registrado), `parcial` (coincide el dato central; difieren medio, fecha o cifras secundarias), `no_coincide` (la nota abierta no sostiene lo registrado; se corrigió con lo verificado) y `no_encontrada` (sin URL). El detalle de cada diferencia está en `limitaciones`. Varias URL en una celda se separan con ` ; `.

**Copias.** Notas que replican un mismo comunicado o cifra se agrupan como un solo origen (grupos G1-G5 en `evidencias.csv`) y no cuentan como confirmaciones independientes.

**Vínculo escolar** (`vinculo_escolar`): `confirmado_por_parte` (parte real verificado), `interseccion_estimada` (cruce espacial calculado) o `ninguno`. En esta investigación **todos son `ninguno`**: no se encontró ninguna fuente que vincule un hecho con una escuela, y los partes existentes en la base productiva son datos de prueba (ver [03-auditoria-sistema.md](03-auditoria-sistema.md#datos-de-prueba-mezclados-con-datos-reales)).

**Citas.** Fragmentos de 25 palabras o menos; si la transcripción no es segura se marca `[paráfrasis]`.

**Credenciales.** Ningún documento contiene credenciales, hosts ni cadenas de conexión.

## Cómo actualizar

1. Agregar o corregir registros en las listas de [scripts/generar-registro.py](scripts/generar-registro.py) y regenerar: `python3 docs/investigacion-inundaciones-corrientes/scripts/generar-registro.py`. El script valida la cantidad de columnas por fila.
2. Para nuevos hechos, crear primero la evidencia (`EVD-`) y luego el evento (`EV-`) que la referencia; si el hecho ya existe, agregar la evidencia al evento y registrar contradicciones en lugar de sobrescribir cifras.
3. Al cambiar el estado de un evento, actualizar `ultima_actualizacion` y `consulta`; no pasar a `resuelto_explicito` sin una fuente que lo diga.
4. Para contrastar con el sistema, exportar en solo lectura `radar_meteo_run` y `smn_alerta` y ejecutar `node docs/investigacion-inundaciones-corrientes/scripts/sistema-casos-publicos.mjs <directorio-snapshot>`. El radar se purga a los 14 días: exportar antes.
5. Actualizar la matriz de cobertura cuando se busque un departamento, aunque no haya resultados.
