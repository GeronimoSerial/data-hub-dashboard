# Resumen ejecutivo

Ventana: desde el miércoles 7 de octubre de 2026 hasta el corte, 2026-10-13 ~12:45 ART. Detalle de cada hecho y fuente en [02-registro/](02-registro/).

## Conclusión principal

**En producción el motor de riesgo nunca se ejecutó.** Entre el 2026-10-06 y el corte solo corrieron la sincronización de pronóstico meteorológico (radar Open-Meteo), su ensemble, las alertas SMN y dos cargas estáticas únicas. Las tablas de pronóstico de caudal, observaciones de lluvia, corridas y snapshots de riesgo, cortes de situación y salud de fuentes tienen **0 filas** (base productiva, acceso de solo lectura provisto por el equipo). Por eso el sistema no tenía ninguna medición de altura de río, ningún caudal y ningún score de riesgo durante la crecida del Uruguay y del Paraná.

**Causa confirmada (2026-10-13):** los jobs no estaban programados. Producción programa sus jobs con tareas de Coolify (no con los timers systemd del repositorio, que en el servidor ejecutan staging) y solo tenía 4: radar, ensemble radar, alertas SMN y verificación radar. Los flags estaban encendidos (`RISK_RADAR_ENABLED`, `RISK_ENGINE_ENABLED`, `HAZARD_CONTEXT_ENABLED`, `SITUACION_ENABLED` en `true`; `RISK_MODE=shadow`). Resultado en el mapa: la pestaña Radar era visible; su **panel radar** (pronóstico y alertas SMN) tenía datos y es reconstruible; las **capas de riesgo por escuela** estuvieron **vacías toda la ventana**, una omisión comprobada para todos los casos públicos ([04](04-matriz-caso-sistema.md#qué-mostraba-el-mapa-dos-dimensiones)). Ese mismo día se programaron IMERG y las climatologías en producción; el motor sigue sin programar hasta corregir sus defectos ([10](10-cambios-operativos-2026-10-13.md)).

Lo que el sistema sí tenía: 61 corridas completas de pronóstico meteorológico en grilla de 0,2° sobre Corrientes, alertas SMN de **tormentas** (ninguna hidrológica), capas estáticas (susceptibilidad, exposición fluvial histórica de rutas, aislamiento, asociación escuela-río) y partes escolares. **Los partes escolares presentes en la base son datos de prueba**, mezclados con datos reales sin marca de procedencia visible en las tablas consultadas; no se usan como hechos.

## Hechos respaldados (evidencia pública)

25 eventos, 72 evidencias (69 públicas, 56 con URL), 17 avisos (incluye la actualización de 72 h de la tarde del 13/10, al final de esta sección). Tras la verificación de URL del 2026-10-13 bajó la confianza de 5 eventos y subió la de 1 (ver [09](09-preguntas-limitaciones.md#pasada-de-verificación-de-url-2026-10-13)). Los más relevantes:

| Evento | Hecho | Confianza | Estado al corte |
|---|---|---|---|
| EV-20261007-001 | Paso de los Libres: crecida del río Uruguay con evacuaciones desde el 6-7 oct (13 personas el 7/10, dentro de la ventana). Cifras **no conciliadas** según fuente y fecha: 13, 25, 31 y 37 personas (no se suman). Albergue en el Regimiento de Infantería de Monte 5 | media | vigente según último reporte |
| EV-20261013-001 | Paso de los Libres: **9,31 m, EVACUACIÓN, estacionario** (Prefectura, 13/10 12:00; evacuación 8,50 m) | alta | vigente según último reporte |
| EV-20261012-003, EV-20261013-006 | Paso de los Libres: Barrio Catamarca con calles anegadas; costanera cerrada (ninguna nota localizada al buscar su URL) | muy baja | vigente según último reporte |
| EV-20261012-001 | Ituzaingó: Paraná **sobre alerta**, 3,62 m creciendo (Prefectura 13/10 12:00; alerta 3,50, evacuación 4,00). Lecturas de prensa contradictorias (2,45 / 3,10 / 3,35 m) | alta | vigente según último reporte |
| EV-20261011-001 | Isla Apipé (Ituzaingó): evacuaciones desde el 11/10. 9 familias / 23 personas, 27 asistidas, 55 evacuados según el intendente (no conciliadas) | media | vigente según último reporte |
| EV-20261011-002, EV-20261013-005 | Yacyretá: apertura del vertedero, afluente 40 % sobre el promedio (EFE); ~28.000 m³/s solo en una nota no re-verificada; «18 compuertas» no verificado; cierre del paso Ituzaingó-Ayolas del 13 al 17/10 (Perfil, URL verificada) | media | vigente según último reporte |
| EV-20261013-004 | Alvear, La Cruz, Yapeyú y Bonpland sobre alerta (9/10 verificado en MDZ; lecturas del 12/10 sin nota localizada) | baja | vigente según último reporte |
| EV-20261010-001 | Cierre del puerto de Alvear y del paso Alvear-Itaquí (Infobae 11/10, Perfil 12/10) | media | evolución desconocida |
| EV-20261008-004 | Monte Caseros: cruce a Bella Unión cerrado preventivamente (El Libertador 8/10; desde el 7/10 según nota no localizada); 7,05 m estacionario bajo alerta (Prefectura 13/10); 7,10 m de prensa no verificado | baja | evolución desconocida |
| EV-20261008-001 | Curuzú Cuatiá: temporal noche 7 / madrugada 8 oct, 88-90 mm sin estación identificada, ráfagas de hasta 100 km/h (El Libertador 8/10), más de 20 árboles caídos, barrios sin luz ni señal | media | ocurrido |
| EV-20261008-002 | Capital: 17 mm hasta las 9 h del 8/10 y **sin anegamientos** (dato municipal) | media | ocurrido |
| EV-20261012-002 | Goya: 20 mm el 12/10, sin impactos mencionados (municipio) | media | ocurrido |
| EV-20261013-002 | Paraná en Corrientes, Itatí, Bella Vista, Goya y Esquina: en ascenso o estacionario, **bajo alerta** (Prefectura 13/10) | alta | vigente según último reporte |

### Actualización 72 h (10-13/10; consulta posterior a las 18:00 del 13/10)

No se hallaron acumulados de lluvia medidos ni anegamientos urbanos por lluvia en el período, salvo Goya, con 20 mm el 12/10 (EV-20261012-002). Las afectaciones nuevas se deben a la crecida de los ríos.

| Evento | Hecho | Confianza | Estado al corte |
|---|---|---|---|
| EV-20261012-001 | Ituzaingó: el Paraná **superó la cota de evacuación**: 4,03 m creciendo (Prefectura 13/10 18:00; evacuación 4,00). No se informan evacuaciones en la zona urbana | alta | vigente según último reporte |
| EV-20261013-009 | Ituzaingó: bajo agua la bajada de la calle 7, las cercanías del barrio Mil Viviendas, la playa Soró y los muelles (El Libertador 13/10, fuente única) | media | vigente según último reporte |
| EV-20261013-010 | Itatí: el río superó la costanera y cubrió paradores y playas; las autoridades se reunieron de urgencia. Prefectura marca 6,07 m, bajo el umbral de alerta de 6,80 | media | vigente según último reporte |
| EV-20261013-008 | Empedrado: unos 200 vecinos se autoevacuaron (cifra sin atribución), hay parajes anegados y caminos cortados (sin nombres) y casi mil cabezas de ganado esperan traslado; el intendente informa 4,86 m | media | vigente según último reporte |
| EV-20261013-007 | Defensa Civil provincial: **67 evacuados y autoevacuados**, principalmente en Isla Apipé y Paso de los Libres (director B. Lovinson, 13/10 10:45). La cifra no se suma a las locales | media | vigente según último reporte |
| EV-20261013-004 | Río Uruguay en alerta según Prefectura (13/10): Alvear 10,36, La Cruz 10,32, Yapeyú 9,87 y Bonpland 9,32 m. En Bonpland, Prefectura y la prensa (8,32 m) difieren en 1 m, sin resolver. La confianza sube de baja a alta | alta | vigente según último reporte |
| EV-20261013-011, EV-20261012-006 | Alvear: el agua avanza sobre zonas bajas, todavía sin evacuados. La Cruz: Defensa Civil municipal se reunió el 12/10 | baja | vigente / ocurrido |
| EV-20261013-001, EV-20261013-002, EV-20261013-003 | Paso de los Libres en 9,33 m (evacuación, creciendo). Paraná y Uruguay en ascenso en Corrientes (5,43), Paso de la Patria (5,58), Bella Vista, Goya, Esquina, Santo Tomé (11,18, a 0,32 m de la alerta) y Garruchos, todos **bajo alerta** | alta | vigente según último reporte |

Isla Apipé (EV-20261011-001) suma «más de 10 familias» y 35 personas asistidas (El Libertador 13/10). Perfil (12/10) confirma la apertura de 18 compuertas en Yacyretá (EV-20261011-002). Sigue sin aparecer ninguna fuente sobre escuelas, suspensión de clases o rutas cortadas con nombre.

Cifras **no utilizables** como conteo de Corrientes: «más de 400 personas afectadas» (cifra sin fuente identificada, no verificada: TN no localizada; la nota de Cadena 3 del 10/10 no la contiene; solo la repiten copias sin atribución). «Goya superó su marca histórica» contradice a Prefectura (4,71 m, bajo alerta).

## Alcance territorial

Matriz completa en [cobertura-busqueda.csv](02-registro/cobertura-busqueda.csv).

- **Con evidencia (10 de 25 departamentos):** Capital, Curuzú Cuatiá, Empedrado (emergencia hídrica, Res. 431/2026, y autoevacuaciones informadas el 13/10), General Alvear, Goya, Itatí (costanera anegada, 13/10), Ituzaingó, Monte Caseros, Paso de los Libres, San Martín.
- **Sin resultados, cobertura insuficiente (15):** el resto. Santo Tomé, Bella Vista, Esquina y San Cosme (Paso de la Patria) tienen lecturas de Prefectura bajo alerta, pero ninguna afectación publicada.
- **Evidencia negativa explícita:** ninguna a escala departamental. En Capital la única negativa explícita es «sin anegamientos» la mañana del 8/10.
- **Sesgo de cobertura:** la primera búsqueda estándar no devolvió medios nacionales (TN, Crónica, Infobae, MDZ); aparecieron en una segunda ronda dirigida. La ausencia de resultados no prueba ausencia de hechos.

## Riesgos vigentes al corte

| Riesgo | Fuente | Horizonte | Incertidumbre |
|---|---|---|---|
| Uruguay sobre evacuación en Paso de los Libres, estacionario | Prefectura 13/10 | lectura actual | sin pronóstico local verificado |
| Uruguay sobre alerta en Alvear, La Cruz, Yapeyú, Bonpland; Santo Tomé y Garruchos creciendo bajo alerta | Prefectura (directo y vía prensa) | lectura actual | umbral de La Cruz contradictorio (9,50 vs 11,50 m) |
| Paraná sobre alerta en Ituzaingó con aumento de caudal previsto en Yacyretá (hasta 32.000 m³/s; Ituzaingó hasta 4,2 m según EBY citada) | AV-007..009 | días | rangos contradictorios en la misma nota |
| Paraná en Corrientes capital creciendo: INA citado por prensa pronostica 6,00 m para el 20/10 (alerta 6,50) | AV-006 | 7 días | emisión INA no verificada; su pronóstico para el 13/10 (5,70 m) quedó por encima de la lectura (5,38 m) |
| Uruguay sobre alerta en Concordia 2-3 días (aguas abajo) | INA vía prensa (AV-003) | 7-14 días | PDF original ilegible |

## Vacíos

- Ningún organismo provincial (Defensa Civil, ICAA, Vialidad, Ministerio de Educación) con publicación verificada en la ventana.
- SMN web (HTTP 402), INA (PDF como imagen), Misiones Online (HTTP 402) y conclusion.com.ar (HTTP 403) quedaron pendientes de verificación.
- Sin datos de rutas, puentes, agua potable ni caminos rurales para la ventana.
- 13 de las 59 evidencias públicas siguen sin URL: no se localizaron al buscarlas (antes eran 35 de 60). De las 35 reabiertas, solo 6 sostienen lo registrado sin diferencias; ver columnas `verificacion` y `limitaciones`.

## Consecuencias educativas (hipótesis, no hechos)

Ninguna fuente consultada informa escuelas afectadas, usadas como albergue ni suspensión de clases en Corrientes en la ventana; los albergues informados son instalaciones del Ejército. Esto es **cobertura insuficiente, no evidencia negativa**. Hipótesis a verificar con el equipo educativo:

1. Paso de los Libres (67 de 70 escuelas asociadas a un punto de río en la capa estática) es el territorio con mayor probabilidad de afectar accesos y asistencia por la crecida; los barrios ribereños no están identificados en las fuentes de la ventana.
2. Isla Apipé: la evacuación y la previsión de 45% de la isla bajo agua pueden afectar la asistencia y el acceso a escuelas insulares.
3. Cierres de pasos (Ituzaingó-Ayolas, Alvear-Itaquí, Monte Caseros-Bella Unión) pueden afectar traslados transfronterizos de alumnos o docentes, si existen.
4. Cortes de energía y caída de árboles en Curuzú Cuatiá (8/10) pueden haber afectado el funcionamiento de escuelas ese día.

## Qué cambia en el sistema (ver [06-plan-mejoras.md](06-plan-mejoras.md))

1. Corregir los defectos del motor (consulta as-of, atenuación, distancia en grados) y recién entonces programarlo en producción junto con caudal, ensemble y cortes de situación; hoy no corre porque no está programado. Corregir el falso éxito de `climatologia-caudal`.
2. Separar datos de prueba de datos reales (campo de procedencia y regla de exclusión).
3. Integrar alturas hidrométricas observadas (Prefectura) con sus umbrales oficiales y captura periódica, porque la tabla oficial solo conserva la última lectura.
4. Crear una capa territorial de eventos con evidencias, independiente del índice escolar.
5. Ampliar el descubrimiento de fuentes a medios nacionales, regionales y organismos oficiales.
