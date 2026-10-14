# Preguntas para el equipo y limitaciones

## Decisiones del equipo

1. **¿Cuándo se programa el motor en producción?** Causa confirmada de que no corriera: producción usa tareas programadas de Coolify y no tenía tareas para riesgo, caudal, IMERG ni climatologías (los timers systemd del servidor son de staging). IMERG y climatologías se programaron el 2026-10-13 ([10](10-cambios-operativos-2026-10-13.md)). Propuesta: programar `calcular-riesgo`, `sync-pronostico-caudal`, `sync-ensemble` y `situacion-corte` solo después de P-5 en [06](06-plan-mejoras.md#problemas-operativos-detectados-el-2026-10-13). ¿Se acepta esa condición?
2. **¿Cómo se identifican hoy los partes de prueba?** Las tablas consultadas no muestran un campo de procedencia. ¿Existe otra marca (usuario, prefijo, rango de fechas)? ¿Se eliminan de producción o se migra a un entorno separado? Bloquea I-2 y cualquier conjunto de referencia.
3. **Cupo de Open-Meteo compartido:** staging y producción salen probablemente por la misma red y usan el cupo gratuito. ¿Se desactivan las climatologías de staging o se aísla el cupo (clave propia o salida distinta)?
4. **¿Se acepta la captura periódica de la tabla de Prefectura** (HTML sin API) y con qué frecuencia? Requiere revisar términos de uso.
5. **Vigencia por tipo de evento** (propuesta en [05](05-diseno-deteccion.md#representación-de-la-vigencia)): ¿quién la define?
6. **¿Quién revisa** las extracciones de medios antes de publicarlas en el mapa?
7. **Rotación de credenciales:** en la sesión de trabajo del 2026-10-13 se compartieron credenciales de la base productiva, acceso root por SSH y de la API de Coolify. Se recomienda rotarlas y crear un rol de base de solo lectura para auditorías. ¿Quién lo hace y cuándo?
8. **Staging:** el 2026-10-13 se habilitó por error un timer de IMERG en staging. ¿Se mantiene o se revierte ([10](10-cambios-operativos-2026-10-13.md#reversión))?
9. **Runbook del scheduler:** `docs/ejecucion-enos/OPS1/runbook-scheduler.md` describe systemd y no coincide con producción. ¿Quién lo actualiza?

## Limitaciones no resueltas

- **Afectación escolar en Paso de los Libres e Isla Apipé:** desconocida. No hay partes reales conocidos y ninguna fuente pública menciona escuelas.
- **Fuentes inaccesibles:** SMN web (HTTP 402), Misiones Online (HTTP 402), INA (PDF como imagen; portal sin contenido legible), conclusion.com.ar (HTTP 403), TN (sin URL obtenida). Quedan como pendientes de verificación.
- **Organismos sin publicación verificada en la ventana:** Defensa Civil de Corrientes, ICAA, Vialidad Nacional y Provincial, Ministerio de Educación, EBY y CTM (solo vía prensa).
- **Verificación de investigadores delegados:** la mayoría de las evidencias de prensa fueron leídas por investigadores delegados y no reverificadas por el orquestador. Verificadas por el orquestador: tabla de Prefectura (EVD-001), presencia de la nota de Elonce del 7/10 (EVD-002) y nota de Crónica del 13/10 (EVD-029). Tras la verificación de URL, 13 de las 59 evidencias públicas siguen sin URL (ver sección siguiente).
- **Monte Caseros 7,10 m (12/10):** no aparece en ninguna nota abierta (7Páginas da 6,25 m, solo en resultados de búsqueda; Prefectura 13/10 12:00 da 7,05 m). Se mantiene como dato no verificado y como contradicción.
- **Cifras no conciliadas:** evacuados en Paso de los Libres (13/25/31/37) e Isla Apipé (23/27/55); umbral de alerta de La Cruz (9,50 vs 11,50 m); lecturas de Ituzaingó del 12-13/10 (2,45 / 3,10 / 3,35 / 3,62 m).
- **Coordenadas de estaciones** de Prefectura no verificadas; por eso ningún evento tiene geometría.
- **Sin snapshot del mapa:** la configuración productiva se observó el 2026-10-13 (flags encendidos, ver [03](03-auditoria-sistema.md#configuración-observada-en-producción)); se supone igual durante la ventana. Las capas de riesgo estaban vacías por construcción (omisión comprobada); el panel radar solo es reconstruible, no hay registro de lo que mostró.
- **Horas del pronóstico radar:** el script interpreta `payload.times` como UTC; debe confirmarse contra el proveedor.

## Cambio de ventana (2026-10-13)

El equipo amplió la ventana el 2026-10-13: ahora va **desde el miércoles 7 de octubre de 2026** hasta el corte (antes, desde el jueves 8/10). Los hechos del 7/10 que figuraban como antecedente pasan a estar dentro de la ventana; lo anterior al 7/10 sigue como contexto o excluido. No cambian `estado_temporal` ni las fechas de los hechos; solo la inclusión. Ninguna fila de `excluidos.csv` tenía fecha real del 7/10, así que no se reincorporó ninguna.

## Pasada de verificación de URL (2026-10-13)

**Método.** Dos agentes de verificación buscaron y abrieron la URL de cada evidencia EVD-020..060 (una fila por medio), registraron título, fecha, autor y un fragmento, e indicaron si coincidía con el registro. Los resultados se volcaron en [scripts/generar-registro.py](scripts/generar-registro.py) (bloque `VERIF`) y se regeneró el registro. Los fragmentos que no son textuales se marcan `[paráfrasis]`.

**Resultado sobre 35 evidencias reabiertas:**

| Resultado | Cantidad | Evidencias |
|---|---|---|
| `verificada_url` | 6 | EVD-033, 035, 042, 043, 048, 058 |
| `parcial` | 11 | EVD-021, 030, 031, 034, 036, 040, 041, 044, 045, 054, 055 |
| `no_coincide` | 4 | EVD-026, 049, 051, 059 |
| `no_encontrada` | 13 | EVD-022, 032, 037, 038, 039, 046, 047, 050, 052, 053, 056, 057, 060 |
| fuera de ventana (excluida) | 1 | EVD-020 (nota del 15/04/2026) |

**Correcciones principales.** EVD-026: el pronóstico de CTM es del 11/10 (Concordia 11,80 m; Salto 12,10 m), no del 7/10 con 11,50 / 11,80 m (también en AV-005). EVD-036: 9,26 m es de Noticiero 9 sin atribución a Prefectura; Época atribuye 9,14 m al INA; 9,18 m solo aparece en Infobae 11/10. EVD-041: la nota de EFE solo sostiene «40 % sobre el promedio»; «18 compuertas» queda sin verificar. EVD-049 y EVD-051: autor, cifras y atribución distintas de lo registrado; se corrigieron con lo verificado. EVD-030/059: «más de 400» es una cifra sin fuente identificada. EVD-060: la única URL hallada es de junio de 2026 y se descartó.

**Confianza.** Bajó en 5 eventos (EV-20261008-004, EV-20261012-003, EV-20261012-005, EV-20261013-004, EV-20261013-006) y subió en 1 (EV-20261012-004, Resolución 431/2026 con URL verificada). Ningún evento se eliminó.

**Lección.** Solo 6 de las 35 evidencias reabiertas sostuvieron sin diferencias lo que el agente había registrado; 18 no coincidieron, no se encontraron o estaban fuera de ventana (cerca de la mitad, por encima del tercio estimado al planificar). Por eso el diseño debe **guardar URL y texto capturado en el momento de la extracción**, y ningún dato de un agente debe publicarse sin ese respaldo.
