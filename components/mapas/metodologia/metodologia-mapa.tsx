'use client'

import { useEffect, useRef } from 'react'
import { Formula, Tex, FORMULAS_MOTOR } from './formula'
import {
  MOTOR_VERSION, REGLAS_V04_VERSION, RIO_V04_MAPEO_VERSION,
  PESOS_AMENAZA, PESOS_VULNERABILIDAD, NIVEL_PELIGRO_A_NUMERO,
  BASE_COMBINACION_V04, TOPE_PROFUNDIDAD_FLUVIAL_V04_M, VENTANA_HISTORIAL_DIAS,
  HISTORIAL_TOPE_DURACION_HORAS, UMBRAL_MODERADO, UMBRAL_ALTO, UMBRAL_MUY_ALTO,
  PISO_AMENAZA_POR_ESTADO_RIO, PISO_RIESGO_POR_ESTADO_RIO,
  PISO_AMENAZA_REDUCIDO_V04, PISO_RIESGO_REDUCIDO_V04,
  UMBRAL_P_ALTO_V04, UMBRAL_P_MODERADO_V04, PISO_RIESGO_P_ALTO_V04, PISO_RIESGO_P_MODERADO_V04,
  MARGEN_ERROR_DEM_V04_M, BANDA_EXPOSICION_V04_M, UMBRAL_ALCANZABLE_V04,
  DIAS_POR_HORIZONTE_V04, CONFIANZA_MEDIA_MAX_FALTANTES, EDAD_MAX_SERIE_INA_V04_DIAS,
  COBERTURA_MIN_VENTANA_V04_HORAS, EDAD_MAX_INGESTA_RESPALDO_V04_HORAS, EDAD_MAX_ENSEMBLE_V04_HORAS,
  AGRAVANTES_ACCESO, BASE_ACCESO_POR_NIVEL_AISLAMIENTO, REGLA_ACCESO_VERSION,
} from '@/lib/infraestructura/riesgo/motor/config'
import { MAX_ANTIGUEDAD_LECTURA_HORAS } from '@/lib/infraestructura/riesgo/motor/rio-prefectura'
import { CADENCIAS } from '@/lib/infraestructura/riesgo/cadencias'
import { VERSION_UMBRALES_PROVISORIOS } from '@/lib/infraestructura/riesgo/peligro/umbrales-provisorios'
import type { MotivoDegradacionV04 } from '@/lib/infraestructura/riesgo/jobs/insumos-operativo-v04'

const numero = (x: number) => x.toLocaleString('es-AR')
const porcentaje = (x: number) => `${numero(x * 100)} %`
const HORIZONTES = Object.entries(DIAS_POR_HORIZONTE_V04).map(([h, dias]) => ({ horas: Number(h), dias }))
const NIVELES_PELIGRO = Object.entries(NIVEL_PELIGRO_A_NUMERO).filter((e): e is [string, number] => e[1] !== null)
const DEGRADACION = {
  padron_no_disponible: 'No se pudo leer el padrón o estaba vacío. Se conservan las escuelas con perfil territorial y se las trata como ubicadas.',
  altimetria_no_disponible: 'No se pudo cargar la altimetría. La probabilidad queda no estimable; se evalúa el río observado con las reglas de alcance actuales.',
  terreno_no_disponible: 'Falló la carga o preparación de los insumos del río. Se continúa sin río probabilístico y se evalúa el respaldo observado.',
  serie_ina_desactualizada: `Se descartan estaciones sin filas o cuya última fila INA + Prefectura tiene más de ${EDAD_MAX_SERIE_INA_V04_DIAS} días. Quedan identificadas en los metadatos de insumos.`,
  peligro_240h_respaldo: 'Al menos una celda usó una ingesta anterior válida para completar la ventana de 240 h.',
  peligro_240h_sin_dato: 'Al menos una escuela quedó sin peligro meteorológico a 240 h. El resto de sus componentes se evalúa igual.',
} satisfies Record<MotivoDegradacionV04, string>

import { iniciarSimuladores } from './simuladores'
import { AtribucionDem } from './atribucion-dem'
import { fuenteDemDeRegionId } from '@/lib/infraestructura/region/fuente-dem'
import { useRegion } from '@/lib/infraestructura/region/region-provider'
import { useTextos } from '@/lib/i18n/idioma-provider'

export function MetodologiaMapa() {
  const raiz = useRef<HTMLElement>(null)
  const esFabdem = fuenteDemDeRegionId(useRegion().id) === 'fabdem'
  const dem = useTextos().situacion.fuenteDem

  useEffect(() => {
    const nodo = raiz.current
    if (!nodo) return
    return iniciarSimuladores(nodo)
  }, [])

  return (
    <article ref={raiz} className="metodologia" aria-label="Metodología del mapa" data-testid="metodologia-mapa">
      <nav className="toc" aria-label="Contenido">
        <div className="brand">Metodología</div>
        <ol>
          <li><a href="#metodologia/inicio">Panorama</a></li>
          <li><a href="#metodologia/linaje">Trazabilidad de los datos</a></li>
          <li><a href="#metodologia/afectacion">1 · Continuidad pedagógica</a></li>
          <li><a href="#metodologia/seguimiento">Seguimiento en el tiempo</a></li>
          <li><a href="#metodologia/lluvia">2 · Peligro por lluvia</a></li>
          <li><a href="#metodologia/nasa">Lluvia observada por NASA</a></li>
          <li><a href="#metodologia/riesgo">3 · Riesgo estimado</a></li>
          <li><a href="#metodologia/aislamiento">4 · Aislamiento vial</a></li>
          <li><a href="#metodologia/acceso">5 · Riesgo de acceso</a></li>
          <li><a href="#metodologia/inundacion">6 · Inundación</a></li>
          <li><a href="#metodologia/limites">Límites e incertidumbre</a></li>
          <li><a href="#metodologia/glosario">Glosario</a></li>
        </ol>
      </nav>
      <div className="metodologia__contenido">
      <header className="metodologia__portada" id="inicio">
        <h1>ENOS · El Niño Oscilación del Sur 2026–2027</h1>
        <p className="lead">Combinamos observación satelital, modelos de riesgo y los datos de gestión educativa de la provincia para anticipar dónde El Niño puede interrumpir las clases y priorizar la respuesta escuela por escuela. Esta página explica cada indicador del mapa: de dónde salen sus datos, cómo se calcula y cuáles son sus límites.</p>
        <div className="models">
          <a href="#metodologia/afectacion"><b>Continuidad pedagógica</b><span>¿Qué secciones no tienen clase y cuántos alumnos alcanza?</span></a>
          <a href="#metodologia/lluvia"><b>Peligro por lluvia</b><span>¿Llueve de forma excepcional sobre la zona?</span></a>
          <a href="#metodologia/riesgo"><b>Riesgo estimado</b><span>¿Dónde conviene priorizar la verificación y la respuesta?</span></a>
          <a href="#metodologia/aislamiento"><b>Aislamiento</b><span>¿Qué tan difícil es para alumnos y docentes llegar?</span></a>
          <a href="#metodologia/acceso"><b>Riesgo de acceso</b><span>¿Puede cortarse el camino a la escuela?</span></a>
          <a href="#metodologia/inundacion"><b>Inundación</b><span>¿Qué exposición a crecidas muestran las capas estáticas?</span></a>
        </div>
        <h3>Con datos de las principales agencias científicas del mundo</h3>
        <div className="sources">
          <a href="#metodologia/nasa"><b>NASA</b><span>Lluvia observada por satélite cada 30 minutos (misión GPM, junto a JAXA)</span></a>
          <a href="#metodologia/inundacion"><b>Comisión Europea · JRC</b><span>Mapas globales de crecidas de río y de agua superficial</span></a>
          <a href="#metodologia/inundacion"><b>{esFabdem ? dem.navTitulo : 'Copernicus'}</b><span>{esFabdem ? dem.navDescripcion : 'Modelo de elevación del terreno a 30 m'}</span></a>
          <a href="#metodologia/lluvia"><b>NASA IMERG · ERA5</b><span>Climatología histórica de lluvia (IMERG Final 2001 en adelante; ERA5 como respaldo)</span></a>
          <a href="#metodologia/lluvia"><b>Open-Meteo · ECMWF</b><span>Pronóstico de lluvia para {HORIZONTES.map((h) => `${h.horas} h`).join(" / ")}</span></a>
          <a href="#metodologia/riesgo"><b>GloFAS · Prefectura · INA</b><span>Caudal pronosticado, alturas observadas y series diarias de los ríos</span></a>
          <a href="#metodologia/aislamiento"><b>OpenStreetMap</b><span>Red vial, puentes y vados</span></a>
          <a href="#metodologia/afectacion"><b>Gestión Educativa</b><span>Padrón de escuelas, secciones y matrícula</span></a>
        </div>
      </header>

      <section id="linaje">
        <h2>Trazabilidad de los datos</h2>
        <p>Cada fuente pasa por un proceso propio antes de llegar al mapa. Las líneas muestran qué datos alimentan a qué indicador.</p>
        <div className="card">
        <svg viewBox="0 0 900 470" role="img" aria-label="Diagrama de linaje de datos">
          <defs><marker id="ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0L10,5L0,10z" fill="var(--muted)"/></marker></defs>
          <g fontSize="13">
            <text x="20" y="24" fontWeight="600" fill="var(--muted)">FUENTES</text>
            <text x="350" y="24" fontWeight="600" fill="var(--muted)">PROCESO</text>
            <text x="680" y="24" fontWeight="600" fill="var(--muted)">INDICADOR</text>
          </g>
          <g id="lin-src"></g>
        </svg>
        </div>
        <p className="why">El cálculo operativo evalúa escuelas con perfil territorial utilizable, aunque no hayan reportado problemas. El padrón aporta el estado de ubicación, la matrícula y las secciones; las escuelas sin coordenadas cuentan en la gestión educativa, pero no tienen una estimación geográfica de riesgo.</p>
      </section>

      <section id="afectacion">
        <h2>1 · Continuidad pedagógica</h2>
        <p className="question">¿Qué secciones no están teniendo clase hoy y cuántos alumnos alcanza?</p>
        <h3>Fuente</h3>
        <p>El <span className="term" tabIndex={0} data-def="Declaración que carga el equipo directivo con el motivo, la severidad, el alcance (escuela, turno o sección) y los alumnos afectados.">parte</span> que carga el equipo directivo. Es el único dato que se ingresa a mano, y todo lo demás se calcula a partir de él y del padrón. Un parte está <b>vigente</b> hasta que se lo da de baja.</p>
        <h3>Dos tipos de problema</h3>
        <p>Cada afectación se declara en una de dos categorías, porque no es lo mismo que la escuela no pueda funcionar que los alumnos no puedan llegar:</p>
        <div className="tablewrap"><table><tbody>
          <tr><th>Severidad</th><th>Problema del establecimiento</th><th>Problema de los alumnos</th></tr>
          <tr><td><b style={{ color: 'var(--l0)' }}>Baja</b></td><td>Molesta, pero se dicta clase normalmente.</td><td>Llegan con demora o dificultad, pero asisten.</td></tr>
          <tr><td><b style={{ color: 'var(--l1)' }}>Media</b></td><td>Condiciona el dictado: algunas secciones o turnos funcionan a medias.</td><td>Algunos alumnos faltan algunos días por el acceso.</td></tr>
          <tr><td><b style={{ color: 'var(--l2)' }}>Alta</b></td><td>Impide dictar clase en parte del establecimiento.</td><td>Los alumnos afectados no pueden llegar de forma sostenida.</td></tr>
          <tr><td><b style={{ color: 'var(--l3)' }}>Crítica</b></td><td>Impide el funcionamiento o hay riesgo para las personas.</td><td>Llegar implica riesgo para los alumnos (cruzar un arroyo crecido, un camino anegado).</td></tr>
        </tbody></table></div>
        <p>El eje de toda la escala es el <b>dictado de clase</b>: es lo que el directivo puede observar sin tener que evaluar daños estructurales que no le competen.</p>
        <div className="grid2">
          <div className="card"><h3 style={{ marginTop: '0' }}>Motivos del establecimiento</h3><ul><li>Inundación</li><li>Tormenta severa</li><li>Sin energía o agua</li><li>Evacuación preventiva</li><li>Inaccesibilidad de docentes</li><li>Otro problema en el establecimiento</li></ul></div>
          <div className="card"><h3 style={{ marginTop: '0' }}>Motivos de los alumnos</h3><ul><li>Anegamiento</li><li>Acceso interrumpido</li><li>Otro problema de acceso</li></ul></div>
        </div>
        <h3>Estado del servicio educativo</h3>
        <p>La suspensión de clases se declara con un alcance: toda la escuela, un turno o una sección puntual. Cada sección se resuelve por separado con una regla de precedencia, de lo más específico a lo más general:</p>
        <Formula tex={String.raw`\text{estado}(s)=\begin{cases}\text{lo declarado para la sección } s & \text{si existe}\\ \text{lo declarado para su turno} & \text{si no, y existe}\\ \text{lo declarado para la escuela} & \text{si no, y existe}\\ \text{normal} & \text{en otro caso}\end{cases}`} />
        <p>Así, suspender una sola sección nunca marca como suspendidas a las demás. El estado general de la escuela resume a todas sus secciones: <b>normal</b> si ninguna está suspendida, <b>suspendido</b> si lo están todas y <b>parcial</b> en cualquier caso intermedio. Si dos declaraciones compiten por el mismo alcance, gana la más reciente.</p>
        <div className="sim" id="sim-serv">
          <h4>Simulador: estado del servicio y alumnos alcanzados</h4>
          <p className="hint">Declará suspensiones con distinto alcance y mirá cómo se resuelve cada sección. Tocá una sección para suspenderla o reactivarla puntualmente.</p>
          <div className="ctrls">
            <div className="ctrl"><label>Toda la escuela</label><select id="sv-esc"><option value="">sin declarar</option><option value="suspendido">suspendida</option><option value="normal">con clases</option></select></div>
            <div className="ctrl"><label>Turno mañana</label><select id="sv-tm"><option value="">sin declarar</option><option value="suspendido">suspendido</option><option value="normal">con clases</option></select></div>
            <div className="ctrl"><label>Turno tarde</label><select id="sv-tt"><option value="">sin declarar</option><option value="suspendido">suspendido</option><option value="normal">con clases</option></select></div>
          </div>
          <svg id="sv-svg" viewBox="0 0 760 210" role="img" aria-label="Secciones y su estado" style={{ marginTop: '14px', cursor: 'pointer' }}></svg>
          <div className="result">
            <span className="badge" id="sv-b"></span>
            <div><div className="why">Secciones sin clase</div><div className="big" id="sv-s"></div></div>
            <div><div className="why">Alumnos alcanzados</div><div className="big" id="sv-a"></div></div>
            <span className="why" id="sv-why"></span>
          </div>
        </div>
        <h3>Cómo se cuentan los alumnos</h3>
        <p>El impacto se calcula sobre la nómina oficial de cada sección en el corte vigente:</p>
        <Formula tex={String.raw`\text{alumnos alcanzados}=\Big|\bigcup_{s\in S}A_s\Big|,\qquad A_s=\begin{cases}N_s\cap M & \text{si el directivo marcó alumnos de } s\\ N_s & \text{si no}\end{cases}`} />
        <p><Tex tex={String.raw`N_s`} /> es la nómina de la sección <Tex tex={String.raw`s`} /> y <Tex tex={String.raw`M`} /> los alumnos marcados uno por uno. Una sección sin alumnos marcados cuenta completa. La unión evita contar dos veces a un mismo estudiante. El cálculo preliminar que ve el directivo al cargar y el confirmado usan exactamente la misma regla, así que no pueden diferir.</p>
        <h3>Avisos al directivo</h3>
        <p>Cuando una carga es posible pero sospechosa, el sistema avisa sin bloquear:</p>
        <ul>
          <li>Si un problema “de alumnos” alcanza a <b>más de la mitad</b> de la matrícula, pregunta si no es en realidad un problema del establecimiento.</li>
          <li>Si un problema del establecimiento marca una por una <b>todas</b> las secciones, sugiere declararlo para toda la escuela.</li>
        </ul>
        <div className="sim" id="sim-red">
          <h4>Simulador: aviso de mayoría</h4>
          <div className="ctrls">
            <div className="ctrl"><label>Matrícula de la escuela <output id="rd-m-o"></output></label><input type="range" id="rd-m" min="10" max="600" defaultValue="240" /></div>
            <div className="ctrl"><label>Alumnos marcados <output id="rd-k-o"></output></label><input type="range" id="rd-k" min="0" max="600" defaultValue="90" /></div>
          </div>
          <div className="result"><span className="badge" id="rd-b"></span><span className="why" id="rd-why"></span></div>
        </div>
        <h3>Datos que se mantienen vivos</h3>
        <ol className="steps">
          <li>Si un parte no se actualiza en más de <b>72 horas</b>, se marca “sin actualizar”: tres días contemplan un fin de semana largo, pero una semana sin novedades durante una emergencia no pasa desapercibida.</li>
          <li>Supervisión puede enviar un <b>pedido de verificación</b>: la escuela recibe un enlace de un solo uso para confirmar o corregir su situación, o se registra la respuesta por un canal asistido.</li>
          <li>Las escuelas sin coordenadas cuentan en los totales de su departamento aunque no aparezcan en el mapa: ningún alumno queda fuera de las cifras.</li>
        </ol>
        <h3>Totales por departamento</h3>
        <Formula tex={String.raw`\%\,\text{afectadas}_d=\frac{\text{afectadas}_d}{\text{escuelas del padrón}_d}\times 100`} />
        <p>El porcentaje provincial se calcula sobre la suma de conteos y <b>no</b> como promedio de los porcentajes departamentales. La diferencia importa: un departamento chico con 50 % no pesa lo mismo que uno grande con 50 %.</p>
        <div className="sim" id="sim-afect">
          <h4>Simulador: porcentaje provincial</h4>
          <p className="hint">Compará el cálculo correcto (sobre totales) con un promedio ingenuo de porcentajes.</p>
          <div className="ctrls">
            <div className="ctrl"><label>Departamento A: escuelas <output id="a-n"></output></label><input type="range" id="a-n-r" min="5" max="400" defaultValue="300" /></div>
            <div className="ctrl"><label>Departamento A: afectadas <output id="a-k"></output></label><input type="range" id="a-k-r" min="0" max="400" defaultValue="15" /></div>
            <div className="ctrl"><label>Departamento B: escuelas <output id="b-n"></output></label><input type="range" id="b-n-r" min="5" max="400" defaultValue="20" /></div>
            <div className="ctrl"><label>Departamento B: afectadas <output id="b-k"></output></label><input type="range" id="b-k-r" min="0" max="400" defaultValue="12" /></div>
          </div>
          <div className="result">
            <div><div className="why">Provincia (correcto)</div><div className="big" id="af-ok"></div></div>
            <div><div className="why">Promedio de porcentajes (incorrecto)</div><div className="big" style={{ color: 'var(--muted)' }} id="af-bad"></div></div>
            <div className="why" id="af-why"></div>
          </div>
        </div>
        <p className="why">El listado agrupado muestra el porcentaje redondeado a entero; los totales, con un decimal. Ambos cuentan exactamente las mismas escuelas: las que tienen un parte vigente.</p>
      </section>

      <section id="seguimiento">
        <h2>Seguimiento en el tiempo</h2>
        <p className="question">¿La situación mejora o empeora, y dónde se concentra?</p>
        <p>Para el período de emergencia vigente, el sistema reconstruye día a día el estado de cada escuela a partir de los partes, sin cargar datos nuevos. Ofrece cuatro lecturas:</p>
        <div className="grid2">
          <div className="card"><h3 style={{ marginTop: '0' }}>Escuelas sin servicio por día</h3><p>Cuántas escuelas tuvieron el servicio suspendido o parcial cada día del período. Muestra la duración real del corte de clases.</p></div>
          <div className="card"><h3 style={{ marginTop: '0' }}>Alumnos alcanzados acumulados</h3><p>Saldo de estudiantes alcanzados a lo largo del período. Responde una pregunta distinta a la foto de hoy, por eso puede no coincidir con ella.</p></div>
          <div className="card"><h3 style={{ marginTop: '0' }}>Ranking por departamento</h3><p>Escuelas afectadas y alumnos alcanzados por departamento. Por construcción, la suma coincide con los totales del mapa.</p></div>
          <div className="card"><h3 style={{ marginTop: '0' }}>Distribución por motivo</h3><p>Cuántas afectaciones vigentes hay de cada motivo: permite distinguir un problema edilicio de uno de acceso o de docentes.</p></div>
        </div>
      </section>

      <section id="lluvia">
        <h2>2 · Peligro por lluvia</h2>
        <p className="question">¿La lluvia pronosticada es excepcional para ese lugar?</p>
        <h3>Fuente</h3>
        <p>Pronóstico de precipitación de ECMWF vía Open-Meteo, con cadencia de {CADENCIAS['sync-ensemble'].minutos / 60} horas, por celda de grilla y para {HORIZONTES.map((h) => `${h.horas} h (${h.dias} días)`).join(', ')}. La referencia de “normal” es la <span className="term" tabIndex={0} data-def="Distribución histórica de la lluvia en un lugar. Aquí se usan los percentiles 90, 95 y 99 de la lluvia diaria.">climatología</span> de cada celda: la serie diaria NASA IMERG Final (0,1°) desde 2001 hasta el último año completo publicado (hoy 2001-2025, no el período OMM 1991-2020). Si una celda todavía no la tiene completa se usa la climatología ERA5; nunca se mezclan percentiles de las dos fuentes.</p>
        <h3>Método</h3>
        <p>Con climatología, el pronóstico determinístico suma la lluvia de las últimas 24 horas de cada horizonte: (h − 24, h]. Esa ventana debe cubrir al menos {COBERTURA_MIN_VENTANA_V04_HORAS} horas. Se compara con los percentiles diarios de la celda: igualar un percentil no lo supera. Sin climatología, los umbrales provisorios reciben todo lo acumulado entre ahora y el horizonte (0, h].</p>
        <Formula tex={String.raw`\text{nivel}(mm)=\begin{cases}\text{rojo} & mm>P_{99}\\ \text{naranja} & mm>P_{95}\\ \text{amarillo} & mm>P_{90}\\ \text{verde} & \text{en otro caso}\end{cases}`} />
        <p>Cuando hay pronóstico por <span className="term" tabIndex={0} data-def="Conjunto de corridas del modelo con condiciones iniciales levemente distintas. Permite estimar la probabilidad de superar un umbral.">ensamble</span>, se usa la probabilidad de superar cada percentil: rojo si <Tex tex={String.raw`P(mm>P_{99})\ge 0{,}5`} />; naranja si <Tex tex={String.raw`P(mm>P_{95})\ge 0{,}5`} />; amarillo si <Tex tex={String.raw`P(mm>P_{95})>0{,}1`} />.</p>
        <p>El ensamble debe ser anterior al cálculo y tener como máximo {EDAD_MAX_ENSEMBLE_V04_HORAS} horas. Si no sirve para ese horizonte, se intenta el determinístico. Si la ingesta más reciente no cubre la ventana, se admite una ingesta previa de hasta {EDAD_MAX_INGESTA_RESPALDO_V04_HORAS} horas; si tampoco alcanza, se informa sin dato.</p>
        <h3>Umbrales provisorios</h3>
        <p>Mientras una celda no tiene climatología completa se usan umbrales fijos. Son una decisión de arranque, <b>no umbrales oficiales</b>, y bajan la confianza del resultado.</p>
        <div className="card"><svg id="chart-umbrales" viewBox="0 0 640 260" role="img" aria-label="Umbrales provisorios por horizonte"></svg></div>
        <div className="sim">
          <h4>Simulador: nivel de peligro</h4>
          <p className="hint">Elegí el horizonte y la lluvia acumulada. Los percentiles de ejemplo son ilustrativos; los umbrales provisorios son los reales.</p>
          <div className="ctrls">
            <div className="ctrl"><label>Horizonte</label><select defaultValue="72" id="ll-h"><option value="24">24 horas</option><option value="72">72 horas</option><option value="240">240 horas</option></select></div>
            <div className="ctrl"><label>Lluvia acumulada <output id="ll-mm-o"></output></label><input type="range" id="ll-mm" min="0" max="320" defaultValue="100" /></div>
            <div className="ctrl"><label>Método</label><select id="ll-m"><option value="prov">Umbral provisorio</option><option value="pct">Percentiles (ejemplo: P90=60, P95=90, P99=140 mm)</option></select></div>
          </div>
          <div className="result"><span className="badge" id="ll-b"></span><span className="why" id="ll-why"></span></div>
        </div>
      </section>

      <section id="nasa">
        <h2>Lluvia observada desde el espacio</h2>
        <p className="question">¿Cuánto llovió realmente sobre cada escuela, y qué tan bien acertó el pronóstico?</p>
        <p>Un pronóstico dice cuánto <i>va</i> a llover. Para saber cuánto <i>llovió</i> en zonas rurales, donde casi no hay pluviómetros, el sistema usa la medición satelital de la <b>NASA</b>.</p>
        <div className="grid2">
          <div className="card"><h3 style={{ marginTop: '0' }}>La fuente: NASA GPM IMERG</h3>
            <p>La misión <span className="term" tabIndex={0} data-def="Global Precipitation Measurement: misión conjunta de NASA y JAXA (agencia espacial japonesa) que combina un satélite central con radar y una constelación de satélites internacionales.">GPM</span> combina los datos de una constelación internacional de satélites. Su producto <span className="term" tabIndex={0} data-def="Integrated Multi-satellitE Retrievals for GPM: algoritmo de la NASA que fusiona las mediciones de todos los satélites de la constelación en una grilla global de lluvia.">IMERG</span> estima la lluvia en todo el planeta.</p>
            <table><tbody>
              <tr><td>Versión</td><td>Early Run (casi en tiempo real)</td></tr>
              <tr><td>Resolución espacial</td><td className="mono">0,1° ≈ 11 km</td></tr>
              <tr><td>Resolución temporal</td><td className="mono">30 minutos</td></tr>
              <tr><td>Demora de la fuente</td><td className="mono">≈ 4 horas</td></tr>
              <tr><td>Consulta del sistema</td><td>cada hora, vía NASA Earthdata</td></tr>
            </tbody></table></div>
          <div className="card"><h3 style={{ marginTop: '0' }}>Para qué se usa</h3>
            <ol className="steps">
              <li><b>Lluvia ya caída sobre cada escuela</b> en las últimas 24 y 72 horas: alimenta la “lluvia antecedente” del riesgo estimado. Para el horizonte de 24 h se usa lo observado en 24 h; para los de 72 y 240 h, lo observado en 72 h. Un suelo que ya recibió mucha agua se inunda con menos lluvia nueva.</li>
              <li><b>Control de calidad del pronóstico</b>: cada día se compara lo pronosticado con lo observado por NASA en cada departamento, para saber cuánto confiar en el pronóstico.</li>
            </ol></div>
        </div>
        <p>Para el motor, una estación SMN cercana con cobertura completa (SYNOP vía Ogimet) tiene prioridad sobre IMERG en cada ventana. Si no hay esa medición, se usa el satélite. Un acumulado de cero significa que se midió y no llovió; sin dato significa que no se pudo medir con cobertura suficiente.</p>
        <h3>Acumulados con control de cobertura</h3>
        <p>Cada medición cubre media hora. El acumulado de 24 horas suma los últimos 48 registros y el de 72 horas, los últimos 144. Si falta más del 20 % de los registros, el acumulado se informa como <b>sin dato</b>: es preferible reconocer que no se sabe a mostrar una cifra que subestime la lluvia real.</p>
        <Formula tex={String.raw`L_{24}=\sum_{k=1}^{48} r_k,\qquad \text{cobertura}=\frac{\text{registros disponibles}}{48}\ \ge\ 0{,}8`} />
        <div className="sim" id="sim-cob">
          <h4>Simulador: un día de mediciones satelitales</h4>
          <p className="hint">Cada barra es media hora de lluvia medida por NASA. Tocá las barras para simular registros faltantes.</p>
          <svg id="cob-svg" viewBox="0 0 760 170" role="img" aria-label="Registros de lluvia cada 30 minutos" style={{ cursor: 'pointer' }}></svg>
          <div className="result"><div><div className="why">Acumulado 24 h</div><div className="big" id="cob-mm"></div></div><div><div className="why">Cobertura</div><div className="big" id="cob-p"></div></div><span className="why" id="cob-why"></span></div>
        </div>
        <h3>¿Qué tan bien acierta el pronóstico?</h3>
        <p>Cada día se compara, por departamento, la lluvia pronosticada con la observada por NASA, usando solo mediciones con índice de calidad de al menos 0,5. Se considera “evento” un día con 10 mm o más. Sobre los últimos 14 días se calculan tres métricas estándar de verificación meteorológica:</p>
        <Formula tex={String.raw`\text{POD}=\frac{\text{aciertos}}{\text{aciertos}+\text{eventos no anticipados}}\qquad \text{FAR}=\frac{\text{falsas alarmas}}{\text{aciertos}+\text{falsas alarmas}}\qquad \text{sesgo}=\overline{P-O}`} />
        <p>Con menos de 14 días comparables o menos de 5 eventos, la muestra se declara insuficiente y no se publican métricas.</p>
        <div className="sim" id="sim-ver">
          <h4>Simulador: tabla de contingencia</h4>
          <div className="ctrls">
            <div className="ctrl"><label>Aciertos (anticipado y llovió) <output id="v-h-o"></output></label><input type="range" id="v-h" min="0" max="14" defaultValue="5" /></div>
            <div className="ctrl"><label>Eventos no anticipados <output id="v-m-o"></output></label><input type="range" id="v-m" min="0" max="14" defaultValue="2" /></div>
            <div className="ctrl"><label>Falsas alarmas <output id="v-f-o"></output></label><input type="range" id="v-f" min="0" max="14" defaultValue="1" /></div>
          </div>
          <div className="result"><div><div className="why">Probabilidad de detección</div><div className="big" id="v-pod"></div></div><div><div className="why">Tasa de falsas alarmas</div><div className="big" id="v-far"></div></div><span className="why" id="v-why"></span></div>
        </div>
      </section>

      <section id="riesgo">
        <h2>3 · Riesgo estimado</h2>
        <p className="question">¿Dónde conviene priorizar la verificación y la respuesta ante lluvia y crecidas?</p>
        <p>El motor operativo es <b>{MOTOR_VERSION}</b>, con reglas <b>{REGLAS_V04_VERSION}</b>. Calcula por separado los horizontes de {HORIZONTES.map((h) => `${h.horas} horas (${h.dias} días)`).join(', ')}. El puntaje combina amenaza y vulnerabilidad en una escala de 0 a 100; <b>no es un porcentaje de probabilidad de suspensión de clases</b>.</p>
        <Formula tex={FORMULAS_MOTOR.riesgo} />
        <p>La amenaza <Tex tex="A" /> reúne las señales disponibles. La vulnerabilidad <Tex tex="V" /> modula su efecto: con vulnerabilidad cero se conserva el {porcentaje(BASE_COMBINACION_V04)} de la amenaza; con vulnerabilidad máxima, toda. Si la vulnerabilidad es desconocida, el factor es 1 y el riesgo base coincide con la amenaza. Luego se aplican los pisos del río, que sólo pueden subir el resultado.</p>
        <div className="grid2">
          <div className="card">
            <h3 style={{ marginTop: '0' }}>Amenaza</h3>
            <table><tbody><tr><th>Componente</th><th>Peso base</th><th>Qué aporta</th></tr>
              <tr><td>Peligro en celda</td><td>{porcentaje(PESOS_AMENAZA.peligroCelda)}</td><td>ECMWF vía Open-Meteo: {NIVELES_PELIGRO.map(([n, v]) => `${n} ${v}`).join(' · ')}.</td></tr>
              <tr><td>Caudal asociado</td><td>{porcentaje(PESOS_AMENAZA.caudal)}</td><td>GloFAS vía Open-Meteo Flood: máximo pronosticado en (0, h], contra climatología de caudal. Sin climatología, queda sin dato.</td></tr>
              <tr><td>Río</td><td>{porcentaje(PESOS_AMENAZA.rioPrefectura)}</td><td>100 × probabilidad principal de superación del terreno, si es estimable. Si no, estado y tendencia de Prefectura con alcance evaluado para el horizonte.</td></tr>
              <tr><td>Lluvia antecedente</td><td>{porcentaje(PESOS_AMENAZA.lluviaAntecedente)}</td><td>IMERG o estación SMN: escala por tramos entre cero, P90, P95 y P99 (puntajes 0, 33, 66 y 100), con tope en 100 y un decimal. Sin climatología de la ventana, usa los umbrales absolutos de 24 o 72 h.</td></tr>
            </tbody></table>
          </div>
          <div className="card">
            <h3 style={{ marginTop: '0' }}>Vulnerabilidad</h3>
            <table><tbody><tr><th>Componente</th><th>Peso base</th><th>Qué aporta</th></tr>
              <tr><td>Historial</td><td>{porcentaje(PESOS_VULNERABILIDAD.historial)}</td><td>Afectaciones confirmadas en {VENTANA_HISTORIAL_DIAS} días, hasta el instante del cálculo.</td></tr>
              <tr><td>Susceptibilidad JRC</td><td>{porcentaje(PESOS_VULNERABILIDAD.susceptibilidad)}</td><td>Sólo profundidad fluvial RP100, en metros. Satura en 100 desde {numero(TOPE_PROFUNDIDAD_FLUVIAL_V04_M)} m; cero es un dato válido. No combina calor, viento ni inundación pluvial.</td></tr>
            </tbody></table>
            <Formula tex={FORMULAS_MOTOR.susceptibilidad} />
          </div>
        </div>
        <h3>Historial</h3>
        <Formula tex={FORMULAS_MOTOR.historial} />
        <p><Tex tex="n" /> es la cantidad de afectaciones confirmadas; <Tex tex="h" />, la suma de sus horas vigentes, cortadas al instante del cálculo; <Tex tex="c" />, las que tuvieron motivo Acceso interrumpido. Los términos saturan en 100. El tope de duración es {HISTORIAL_TOPE_DURACION_HORAS} horas. Si todavía no había ningún parte en todo el sistema, el historial es ausente. Si la fuente ya tenía partes y esta escuela no tiene antecedentes en la ventana, el cero es real.</p>
        <h3>Datos faltantes y confianza</h3>
        <p>Un insumo ausente no se reemplaza por cero. Dentro de cada dimensión se redistribuyen los pesos entre los componentes presentes, en la misma proporción:</p>
        <Formula tex={FORMULAS_MOTOR.dimension} />
        <p>Se redondea cada contribución y la suma a dos decimales; el riesgo base se redondea a entero antes de aplicar los pisos. Sin ninguna amenaza, el riesgo queda sin dato. Si faltan historial y susceptibilidad, la vulnerabilidad queda desconocida y no reduce la amenaza.</p>
        <p>La confianza es alta sin faltantes, media hasta {CONFIANZA_MEDIA_MAX_FALTANTES} y baja por encima de ese límite o sin amenaza. También cuentan la ausencia de aislamiento OSM, un peligro de celda calculado con umbral provisorio y la exposición fluvial de baja confianza cuando entra el río observado. Un río sin vinculación o no aplicable no cuenta como faltante; uno vinculado sin lectura sí, salvo que lo reemplace la probabilidad modelada. La lluvia antecedente con umbral absoluto no agrega por sí sola una penalización de confianza.</p>
        <h3 id="riesgo-rio">Probabilidad de superación del terreno</h3>
        <p>Las series diarias INA A5 y la última lectura de Prefectura alimentan trayectorias históricas análogas del nivel del río. En tramos aprobados del Paraná con estaciones que encierran a la escuela, ceros de escala, kilómetros de río y cotas válidas, el motor interpola el nivel absoluto del agua en el sitio. La probabilidad es la fracción de trayectorias cuyo máximo dentro del horizonte alcanza o supera el terreno. Las ventanas comparten trayectorias: al ampliar el horizonte, esta probabilidad no disminuye.</p>
        <Formula tex={String.raw`P_h=\frac{\#\{\text{trayectorias con }\max_{t\in(0,h]} Z_{\text{agua}}(t)\ge Z_{\text{terreno}}\}}{\#\{\text{trayectorias completas}\}}`} />
        <p>{esFabdem ? dem.cotaPrincipal : 'La cota principal usa Copernicus; la conservadora toma la menor estimación válida comparable entre las fuentes de altimetría, incluida IGN. Se conserva la incertidumbre de la conversión vertical. Superar el terreno supone conexión con el cauce principal: '}<b>no significa agua dentro del edificio</b>, porque no hay cota de piso relevada, ni equivale a una probabilidad de interrupción educativa. El pronóstico INA se ingesta para seguimiento, pero no alimenta esta probabilidad.</p>
        <p>Si la probabilidad principal es estimable, <b>reemplaza</b> al componente de Prefectura con el mismo peso de {porcentaje(PESOS_AMENAZA.rioPrefectura)}; no se cuentan dos veces. Prefectura sigue aportando los pisos observados. Sin probabilidad estimable, se evalúa el río observado bajo las reglas actuales de alcance; si tampoco hay evidencia utilizable, el peso se redistribuye. Sin alcance, la lectura observada queda como información y no entra al puntaje; con alcance reducido o completo, su valor depende del estado y de si el río está creciendo.</p>
        <h3>Pisos del río</h3>
        <p>Con lectura de Prefectura de hasta {MAX_ANTIGUEDAD_LECTURA_HORAS} horas, sin fecha futura, y alcance completo del agua posible, se fijan estos mínimos. El estado oficial es propio de cada estación; sus alturas de alerta y evacuación no son iguales en todos los tramos.</p>
        <table><tbody><tr><th>Estado</th><th>Amenaza mínima</th><th>Riesgo mínimo</th></tr>
          {(['alerta', 'evacuacion'] as const).map((estado) => <tr key={estado}><td>{estado === 'alerta' ? 'Alerta' : 'Evacuación'}</td><td>{PISO_AMENAZA_POR_ESTADO_RIO[estado]}</td><td>{PISO_RIESGO_POR_ESTADO_RIO[estado]} ({estado === 'alerta' ? 'moderado' : 'alto'})</td></tr>)}
        </tbody></table>
        <p>El alcance se evalúa por horizonte con la altura crítica de la escala, el margen vertical de {numero(MARGEN_ERROR_DEM_V04_M)} m y una banda adicional de {numero(BANDA_EXPOSICION_V04_M)} m. Es completo si la probabilidad de alcanzar esa altura es al menos {porcentaje(UMBRAL_ALCANZABLE_V04)}, o si la tendencia y la onda llegan; sin miembros de análogos se usa la subida posible. Las observaciones de terreno seco de Sentinel-2 pueden elevar la altura crítica. Fuera de ese cálculo se evalúa el DEM y, si no es evaluable, sólo se admite la clase fluvial JRC como respaldo de baja confianza.</p>
        <p>Si sólo se llega a la banda, el piso es reducido: evacuación deja amenaza mínima {PISO_AMENAZA_REDUCIDO_V04.evacuacion} y riesgo mínimo {PISO_RIESGO_REDUCIDO_V04.evacuacion}; alerta no fija piso. Sin alcance, no hay piso observado. En localidades con defensa costera y coronamiento desconocido, el alcance baja un nivel: completo a reducido, reducido a ninguno. Este ajuste es provisorio y se aplica por localidad, no por polígono protegido.</p>
        <ul>
          <li>Probabilidad <b>principal ≥ {numero(UMBRAL_P_ALTO_V04)}</b>: riesgo mínimo {PISO_RIESGO_P_ALTO_V04} (alto).</li>
          <li>Si no corresponde el anterior, probabilidad <b>conservadora ≥ {numero(UMBRAL_P_MODERADO_V04)}</b>: riesgo mínimo {PISO_RIESGO_P_MODERADO_V04} (moderado).</li>
        </ul>
        <p>Estos pisos probabilísticos usan las cotas sin el margen vertical. Sólo se habilitan si la probabilidad principal es estimable; el ajuste por defensa costera no los modifica. El resultado final es el máximo entre el riesgo base y los pisos que correspondan. Mapeo: {RIO_V04_MAPEO_VERSION}; sus umbrales siguen siendo provisorios.</p>
        <div className="sim" id="sim-riesgo">
          <h4>Simulador: riesgo estimado</h4>
          <p className="hint">Mové los insumos o desmarcalos. El alcance es un resultado previo del análisis del terreno, la tendencia y las defensas; acá podés elegirlo para ver su efecto. La lluvia usa umbrales absolutos de la ventana, sin climatología. El aislamiento se supone disponible.</p>
          <div className="ctrls">
            <div className="ctrl"><label htmlFor="r-horizonte">Horizonte</label><select id="r-horizonte" defaultValue="72">{HORIZONTES.map((h) => <option key={h.horas} value={h.horas}>{h.horas} horas</option>)}</select></div>
            <div className="ctrl"><label className="chk"><input type="checkbox" id="r-pc-on" defaultChecked /> Peligro en celda</label><select aria-label="Nivel de peligro en celda" defaultValue="66" id="r-pc">{NIVELES_PELIGRO.map(([n, v]) => <option key={n} value={v}>{n} ({v})</option>)}</select><label className="chk"><input type="checkbox" id="r-prov" /> Usa umbral provisorio</label></div>
            <div className="ctrl"><label className="chk"><input type="checkbox" id="r-cq-on" /> Caudal asociado</label><select aria-label="Nivel de caudal" defaultValue="33" id="r-cq">{NIVELES_PELIGRO.map(([n, v]) => <option key={n} value={v}>{n} ({v})</option>)}</select></div>
            <div className="ctrl"><label className="chk"><input type="checkbox" id="r-ll-on" defaultChecked /> Lluvia antecedente <output id="r-ll-o"></output></label><input aria-label="Lluvia antecedente en mm" type="range" id="r-ll" min="0" max="250" defaultValue="90" /></div>
            <div className="ctrl"><label className="chk"><input type="checkbox" id="r-hist-on" defaultChecked /> Fuente de historial disponible</label><label htmlFor="r-n">Afectaciones <output id="r-n-o"></output></label><input type="range" id="r-n" min="0" max="8" defaultValue="2" /></div>
            <div className="ctrl"><label htmlFor="r-h">Horas acumuladas <output id="r-h-o"></output></label><input type="range" id="r-h" min="0" max="1000" step="10" defaultValue="200" /></div>
            <div className="ctrl"><label htmlFor="r-c">Con acceso interrumpido <output id="r-c-o"></output></label><input type="range" id="r-c" min="0" max="5" defaultValue="1" /></div>
            <div className="ctrl"><label className="chk"><input type="checkbox" id="r-su-on" defaultChecked /> Profundidad JRC RP100 <output id="r-su-o"></output></label><input aria-label="Profundidad JRC en metros" type="range" id="r-su" min="0" max="2" step="0.01" defaultValue="0.4" /></div>
            <div className="ctrl"><label className="chk"><input type="checkbox" id="r-prob-on" /> Probabilidad principal estimable</label><label htmlFor="r-prob">Principal <output id="r-prob-o"></output></label><input type="range" id="r-prob" min="0" max="100" defaultValue="10" /></div>
            <div className="ctrl"><label className="chk"><input type="checkbox" id="r-cons-on" defaultChecked /> Cota conservadora estimable</label><label htmlFor="r-cons">Conservadora <output id="r-cons-o"></output></label><input type="range" id="r-cons" min="0" max="100" defaultValue="20" /></div>
            <div className="ctrl"><label htmlFor="r-estado">Río observado (ejemplo)</label><select id="r-estado"><option value="no_aplica">Sin vinculación / no aplica</option><option value="sin_dato">Vinculado sin lectura</option><option value="normal">Normal: lectura 4 m, alerta 5 m</option><option value="alerta">Alerta, estable</option><option value="crece">Alerta, creciendo</option><option value="evacuacion">Evacuación</option></select></div>
            <div className="ctrl"><label htmlFor="r-alcance">Alcance del agua posible (resuelto)</label><select id="r-alcance" defaultValue="completo"><option value="completo">Completo</option><option value="reducido">Reducido</option><option value="ninguno">Ninguno</option></select><label className="chk"><input type="checkbox" id="r-expo-incierta" /> Exposición de baja confianza</label></div>
          </div>
          <div className="result" aria-live="polite">
            <div><div className="why">Amenaza</div><div className="big" id="r-A"></div></div>
            <div><div className="why">Vulnerabilidad</div><div className="big" id="r-V"></div></div>
            <div><div className="why">Riesgo</div><div className="big" id="r-R"></div></div>
            <span className="badge" id="r-b"></span><span className="why" id="r-conf"></span>
          </div>
          <div id="r-weights" className="wf" style={{ marginTop: '14px' }}></div>
        </div>
        <h3>Superficie de riesgo base</h3>
        <p>El gráfico muestra la combinación de amenaza y vulnerabilidad antes de los pisos de riesgo del río. El punto indica los valores del simulador; si la vulnerabilidad es desconocida, no se dibuja un punto.</p>
        <div className="card"><canvas id="heat" width="560" height="420" style={{ width: '100%', maxWidth: '560px', height: 'auto' }} role="img" aria-label="Mapa de calor de riesgo base según amenaza y vulnerabilidad"></canvas></div>
        <table><tbody><tr><th>Puntaje final</th><th>Nivel</th></tr>
          <tr><td>0 a {UMBRAL_MODERADO - 1}</td><td>bajo</td></tr><tr><td>{UMBRAL_MODERADO} a {UMBRAL_ALTO - 1}</td><td>moderado</td></tr><tr><td>{UMBRAL_ALTO} a {UMBRAL_MUY_ALTO - 1}</td><td>alto</td></tr><tr><td>{UMBRAL_MUY_ALTO} a 100</td><td>muy alto</td></tr>
        </tbody></table>
        <h3>Degradación y frecuencia de cálculo</h3>
        <p>La cadencia base de cálculo es de {CADENCIAS['calcular-riesgo'].minutos / 60} horas, encadenada a las sincronizaciones de pronóstico; también puede dispararse después de IMERG. No es un cálculo continuo. Cada corrida conserva su versión, instante de cálculo y vigencia; la vigencia es la más temprana del peligro o caudal utilizado, o el instante del cálculo si ninguno aporta vigencia propia.</p>
        <p>Si faltan insumos del río, el cálculo continúa con la evidencia disponible. Los problemas generales de la corrida quedan en <code>metadatos.degradacion</code>. Ese registro no es lo mismo que la confianza de cada escuela ni enumera todas las abstenciones individuales.</p>
        <div className="tablewrap"><table><tbody><tr><th>Código</th><th>Qué significa</th></tr>{Object.entries(DEGRADACION).map(([codigo, texto]) => <tr key={codigo}><td><code>{codigo}</code></td><td>{texto}</td></tr>)}</tbody></table></div>
        <h3>Exposición educativa</h3>
        <p>El padrón y el corte educativo aportan matrícula y secciones para dimensionar cuántos estudiantes podrían verse afectados. Se muestran aparte y no multiplican el puntaje. Tampoco se suma el riesgo de acceso: tiene su propia regla y su propia confianza.</p>
        <div className="sim" id="sim-expo">
          <h4>Simulador: riesgo y exposición juntos</h4>
          <p className="hint">Cada círculo es una escuela de ejemplo. El tamaño es la matrícula; la posición horizontal, el riesgo estimado.</p>
          <svg id="expo-svg" viewBox="0 0 760 240" role="img" aria-label="Escuelas según riesgo y matrícula"></svg>
        </div>
      </section>

      <section id="aislamiento">
        <h2>4 · Aislamiento vial</h2>
        <p className="question">¿Qué tan difícil es llegar a la escuela por camino desde la red pavimentada?</p>
        <div id="metodologia-aislamiento">
          <h3>En pocas palabras</h3>
          <p>Para cada escuela se mide qué tan lejos queda, <b>por camino</b>, de la localidad urbana más cercana: una localidad de 2.000 habitantes o más según el listado de localidades del INDEC (servicio Georef). La distancia se calcula sobre la red de caminos de OpenStreetMap, no en línea recta.</p>
          <ul>
            <li><b>Distancia a la localidad urbana:</b> kilómetros de la ruta más conveniente desde la escuela hasta esa localidad.</li>
            <li><b>Kilómetros de tierra:</b> tramos de esa ruta sin pavimentar (tierra o ripio).</li>
            <li><b>Cruces de agua:</b> cada arroyo o río que cruza la ruta se clasifica como <b>puente</b> o como <b>vado sin puente</b>. Un vado puede quedar cortado con lluvia.</li>
            <li><b>Camino alternativo:</b> si existe otra ruta que evita esos cruces de agua (o que llega por pavimento).</li>
          </ul>
          <p>Con esas medidas se asigna un nivel de 0 a 3. Se evalúa en orden y la primera regla que se cumple define el nivel:</p>
          <ol className="steps">
            <li>Hay al menos un vado sin puente en la ruta: nivel <b>3</b>, o nivel <b>2</b> si existe un camino alternativo que lo evita.</li>
            <li>La localidad urbana queda a más de 30 km por camino: nivel <b>3</b>.</li>
            <li>La ruta tiene 15 km o más de tierra y no hay alternativa pavimentada: nivel <b>2</b>.</li>
            <li>Sin vados, la red pavimentada a 2 km o menos, la localidad a 10 km o menos y no más de 2 km de tierra: nivel <b>0</b>.</li>
            <li>Cualquier otro caso: nivel <b>1</b>.</li>
          </ol>
          <p>En Planificación se listan como <b>escuelas aisladas</b> las de nivel medio (2) y alto (3).</p>
        </div>
        <h3>Fuente</h3>
        <p>Red vial de <span className="term" tabIndex={0} data-def="OpenStreetMap: cartografía colaborativa abierta. Incluye tipo de vía, superficie, puentes y vados.">OpenStreetMap</span>, extracto del 26/09/2026, con tipo de vía, superficie, puentes, vados y cursos de agua. Se recalcula cuando se actualiza el extracto (versión 4 del cálculo).</p>
        <h3>Método</h3>
        <ol className="steps">
          <li>La red se convierte en un grafo. Cada tramo recibe un <b>costo</b> = longitud × factor según tipo de vía; los tramos de tierra o ripio (salvo huellas) multiplican el factor por 1,5.</li>
          <li>Se busca la ruta de menor costo desde la escuela hasta la red pavimentada y hasta la localidad urbana más cercana (2.000 habitantes o más).</li>
          <li>Sobre esa ruta se miden la distancia real, los kilómetros sin pavimentar (sin contar el último kilómetro urbano) y los cruces de agua.</li>
          <li>Cada cruce de agua se clasifica como puente, vado (marcado en OSM o a menos de 25 m), <b>vado probable</b> (sin puente ni túnel, sobre camino de tierra) o sin evidencia.</li>
          <li>Un árbol de decisión asigna un nivel de 0 a 3.</li>
        </ol>
        <div className="card"><svg id="chart-factor" viewBox="0 0 640 250" role="img" aria-label="Factor de costo por tipo de vía"></svg></div>
        <Formula tex={String.raw`\text{costo}=\text{longitud}\times f_{\text{vía}}\times\begin{cases}1{,}5 & \text{sin pavimentar (no huella)}\\1 & \text{en otro caso}\end{cases}`} />
        <div className="card"><svg viewBox="0 0 860 220" role="img" aria-label="Esquema de ruta de la escuela a la red pavimentada">
          <rect x="0" y="0" width="860" height="220" fill="var(--surface-2)" rx="10"/>
          <path d="M330 0 C 350 70, 300 140, 340 220" stroke="var(--water)" strokeWidth="14" fill="none" opacity=".55"/>
          <text x="352" y="22" fontSize="12" fill="var(--water)">arroyo</text>
          <path d="M70 120 L 330 120" stroke="var(--ground)" strokeWidth="6" strokeDasharray="10 6"/>
          <path d="M330 120 L 620 120" stroke="var(--ground)" strokeWidth="6" strokeDasharray="10 6"/>
          <path d="M620 120 L 820 120" stroke="var(--ink)" strokeWidth="8"/>
          <circle cx="330" cy="120" r="11" fill="var(--l2)"/><text x="304" y="152" fontSize="12">vado probable</text>
          <rect x="52" y="102" width="36" height="36" rx="6" fill="var(--accent)"/><text x="40" y="160" fontSize="12">escuela</text>
          <text x="150" y="108" fontSize="12" fill="var(--muted)">tierra · factor × 1,5</text>
          <text x="660" y="108" fontSize="12" fill="var(--muted)">ruta pavimentada</text>
          <path d="M70 120 C 120 40, 560 30, 620 120" stroke="var(--muted)" strokeWidth="3" fill="none" strokeDasharray="3 5"/>
          <text x="330" y="52" fontSize="12" fill="var(--muted)">¿alternativa sin cruce?</text>
        </svg></div>
        <h3>Árbol de decisión</h3>
        <p>Se evalúa en este orden; la primera regla que se cumple define el nivel.</p>
        <div className="sim" id="sim-ais">
          <h4>Simulador: nivel de aislamiento</h4>
          <p className="hint">Cargá las medidas de la ruta. Se resalta la regla que decide.</p>
          <div className="ctrls">
            <div className="ctrl"><label>Vados en la ruta <output id="i-v-o"></output></label><input type="range" id="i-v" min="0" max="4" defaultValue="0" /></div>
            <div className="ctrl"><label className="chk"><input type="checkbox" id="i-alt" /> Hay alternativa sin cruce de agua</label><label className="chk"><input type="checkbox" id="i-altp" /> Hay alternativa pavimentada</label></div>
            <div className="ctrl"><label>Distancia a red pavimentada <output id="i-dp-o"></output></label><input type="range" id="i-dp" min="0" max="40000" step="100" defaultValue="1500" /></div>
            <div className="ctrl"><label>Distancia a la localidad <output id="i-dl-o"></output></label><input type="range" id="i-dl" min="0" max="45000" step="100" defaultValue="8000" /></div>
            <div className="ctrl"><label>Km sin pavimentar <output id="i-km-o"></output></label><input type="range" id="i-km" min="0" max="30" step="0.5" defaultValue="1.5" /></div>
          </div>
          <ol id="i-rules" className="steps" style={{ marginTop: '16px' }}></ol>
          <div className="result"><span className="badge" id="i-b"></span><span className="why" id="i-why"></span></div>
        </div>
        <p className="why">Si falta la información de tramos o cruces, el nivel queda sin dato. Sin dato nunca se interpreta como “nivel 0”.</p>
      </section>

      <section id="acceso">
        <h2>5 · Riesgo de acceso</h2>
        <p className="question">¿Qué condiciones pueden dificultar o cortar el camino a la escuela?</p>
        <p>Combina el aislamiento vial con el peligro actual y el historial. Es una dimensión separada: <b>no</b> se suma al riesgo estimado de la sección 3. Se parte de un puntaje base según el nivel de aislamiento y se suman agravantes, con tope en 100.</p>
        <Formula tex={FORMULAS_MOTOR.acceso} />
        <div className="sim" id="sim-acc">
          <h4>Simulador: riesgo de acceso</h4>
          <div className="ctrls">
            <div className="ctrl"><label>Nivel de aislamiento</label><select defaultValue="2" id="c-n">{Object.entries(BASE_ACCESO_POR_NIVEL_AISLAMIENTO).map(([n, base]) => <option key={n} value={n}>{n} · base {base}</option>)}<option value="sin_dato">Sin dato</option></select></div>
            <div className="ctrl"><label className="chk"><input type="checkbox" id="c-cr" defaultChecked /> Cruce de riesgo (+{AGRAVANTES_ACCESO.cruceDeRiesgo})</label><label className="chk"><input type="checkbox" id="c-pa" /> Peligro naranja o rojo (+{AGRAVANTES_ACCESO.peligroAlto})</label><label className="chk"><input type="checkbox" id="c-hi" /> Hubo acceso interrumpido (+{AGRAVANTES_ACCESO.accesoInterrumpido})</label></div>
            <div className="ctrl"><label>Alternativa sin cruce</label><select defaultValue="nd" id="c-al"><option value="si">Existe (+0)</option><option value="no">No existe (+{AGRAVANTES_ACCESO.sinAlternativa})</option><option value="nd">Desconocida (+{AGRAVANTES_ACCESO.alternativaDesconocida})</option></select></div>
          </div>
          <div id="c-wf" className="wf" style={{ marginTop: '16px' }}></div>
          <div className="result"><div className="big" id="c-s"></div><span className="badge" id="c-b"></span></div>
        </div>
        <p>El riesgo de acceso es un índice, no una probabilidad calibrada ni la confirmación de un corte. Considera vados, cruces que no tienen todos sus puentes registrados (incluidos los conteos de puentes desconocidos), peligro naranja o rojo de celda o caudal e historial de accesos interrumpidos.</p>
        <p>Un dato desconocido suma más que un “no” confirmado (+{AGRAVANTES_ACCESO.alternativaDesconocida} contra +{AGRAVANTES_ACCESO.sinAlternativa}): <b>la falta de información nunca abarata el riesgo</b>. Si el aislamiento no tiene dato, el riesgo de acceso tampoco lo tiene.</p>
        <p className="why">A diferencia del riesgo estimado, el riesgo de acceso tiene tres niveles: bajo (menos de {UMBRAL_MODERADO}), moderado ({UMBRAL_MODERADO} a {UMBRAL_ALTO - 1}) y alto ({UMBRAL_ALTO} o más). Versión de la regla: {REGLA_ACCESO_VERSION}. La confianza es alta con conteos y alternativa completos, media si alguno falta y baja si no hay índice de aislamiento utilizable.</p>
      </section>

      <section id="inundacion">
        <h2>6 · Inundación</h2>
        <p className="question">¿Qué exposición a crecidas muestran los mapas estáticos de ríos y lagunas?</p>
        <h3>Fuentes</h3>
        <div className="tablewrap"><table><tbody>
          <tr><th>Fuente</th><th>Qué aporta</th><th>Resolución</th></tr>
          <tr><td>JRC Global River Flood Hazard Maps v2.1</td><td>Profundidad de crecida de río para períodos de retorno de 10, 100 y 500 años</td><td className="mono">~90 m</td></tr>
          <tr><td>JRC Global Surface Water</td><td>Porcentaje del tiempo con agua presente (1984–2021)</td><td className="mono">30 m</td></tr>
          <tr><td>{esFabdem ? dem.filaTerreno : 'Copernicus DEM GLO-30'}</td><td>Altura del terreno</td><td className="mono">30 m</td></tr>
        </tbody></table></div>
        <h3>Período de retorno</h3>
        <p>Una crecida de <span className="term" tabIndex={0} data-def="Tiempo medio entre dos eventos de igual o mayor magnitud. Una crecida de 100 años tiene 1 % de probabilidad de ocurrir en un año cualquiera.">período de retorno</span> <Tex tex={String.raw`T`} /> tiene probabilidad anual <Tex tex={String.raw`p=1/T`} />. La probabilidad de que ocurra al menos una vez en <Tex tex={String.raw`n`} /> años es:</p>
        <Formula tex={String.raw`P_n=1-\left(1-\tfrac{1}{T}\right)^{n}`} />
        <div className="sim">
          <h4>Calculadora: probabilidad en un horizonte</h4>
          <div className="ctrls">
            <div className="ctrl"><label>Período de retorno</label><select defaultValue="100" id="t-T"><option>10</option><option>100</option><option>500</option></select></div>
            <div className="ctrl"><label>Años de vida útil <output id="t-n-o"></output></label><input type="range" id="t-n" min="1" max="100" defaultValue="50" /></div>
          </div>
          <div className="result"><div className="big" id="t-p"></div><span className="why" id="t-why"></span></div>
        </div>
        <h3 id="inundacion-clases-rio">Clase por crecida de río</h3>
        <p>Un período “alcanza” la escuela si la profundidad modelada es de al menos <b>0,15 m</b> y el terreno queda por debajo del agua (margen negativo). Se toma el período más corto que alcanza:</p>
        <div className="tablewrap"><table><tbody>
          <tr><th>Clase</th><th>Condición</th><th>Probabilidad anual</th></tr>
          <tr><td><b style={{ color: 'var(--l3)' }}>Alto</b></td><td>alcanza con 10 años</td><td className="mono">≥ 10 %</td></tr>
          <tr><td><b style={{ color: 'var(--l2)' }}>Medio</b></td><td>alcanza con 100 años, no con 10</td><td className="mono">1 – 10 %</td></tr>
          <tr><td><b style={{ color: 'var(--l1)' }}>Bajo</b></td><td>sólo alcanza con 500 años</td><td className="mono">0,2 – 1 %</td></tr>
          <tr><td><b style={{ color: 'var(--l0)' }}>Sin riesgo</b></td><td>no alcanza ni con 500 años</td><td className="mono">&lt; 0,2 %</td></tr>
          <tr><td><b style={{ color: 'var(--nd)' }}>Sin dato</b></td><td>falta alguno de los tres períodos</td><td>—</td></tr>
        </tbody></table></div>
        <p>Si la profundidad es idéntica en los tres períodos se trata de agua permanente (laguna, embalse) y no de crecida: se clasifica como sin riesgo fluvial.</p>
        <h3>Verificación de terreno (margen)</h3>
        <p>Las capas de JRC no incluyen defensas como terraplenes o diques. Por eso se compara la altura de la escuela con el nivel del agua del río cercano más la crecida:</p>
        <Formula tex={String.raw`M_T=Z_{\text{escuela}}-\big(Z_{\text{río}}+\max d_T\big)`} />
        <p><Tex tex={String.raw`Z_{\text{escuela}}`} />: percentil 10 de la altura del terreno en 50 m alrededor de la escuela. <Tex tex={String.raw`Z_{\text{río}}`} />: percentil 10 de la altura de los píxeles de agua permanente (ocurrencia ≥ 90 %) en 2 km. <Tex tex={String.raw`\max d_T`} />: profundidad máxima de JRC en esos píxeles. El percentil 10 reduce el efecto de árboles y techos sobre el modelo de superficie.</p>
        <div className="sim" id="sim-inu">
          <h4>Simulador: corte transversal</h4>
          <p className="hint">Movilizá la altura de la escuela y las profundidades. Si <Tex tex={String.raw`M_T\ge 0`} />, el período no cuenta aunque haya profundidad.</p>
          <div className="ctrls">
            <div className="ctrl"><label>Altura de la escuela sobre el río <output id="u-z-o"></output></label><input type="range" id="u-z" min="0" max="8" step="0.1" defaultValue="2.4" /></div>
            <div className="ctrl"><label>Profundidad en la escuela, 10 años <output id="u-d10-o"></output></label><input type="range" id="u-d10" min="0" max="3" step="0.05" defaultValue="0.1" /></div>
            <div className="ctrl"><label>Profundidad en la escuela, 100 años <output id="u-d100-o"></output></label><input type="range" id="u-d100" min="0" max="3" step="0.05" defaultValue="0.6" /></div>
            <div className="ctrl"><label>Profundidad en la escuela, 500 años <output id="u-d500-o"></output></label><input type="range" id="u-d500" min="0" max="3" step="0.05" defaultValue="1.2" /></div>
            <div className="ctrl"><label>Crecida máxima en el río, 10 / 100 / 500 años</label><div className="mono" style={{ fontSize: 'var(--t-micro)' }}>1,5 · 2,8 · 3,6 m (ejemplo)</div></div>
          </div>
          <svg id="u-svg" viewBox="0 0 760 260" role="img" aria-label="Corte transversal de río y escuela" style={{ marginTop: '14px' }}></svg>
          <div className="result"><span className="badge" id="u-b"></span><span className="why" id="u-why"></span></div>
        </div>
        <h3 id="inundacion-junto-laguna">Junto a laguna</h3>
        <p>Marca aparte de la clase de río: se activa cuando hay agua presente al menos el <b>25 %</b> del tiempo dentro de <b>300 m</b> y el terreno de la escuela está a <b>6 m</b> o menos sobre esa agua.</p>
        <h3 id="inundacion-ruta-acceso">Ruta de acceso</h3>
        <p>Se recorre la ruta calculada en la sección 4 y se toma la peor clase sostenida en al menos unos 270 m (3 puntos cada 90 m). Así un píxel aislado no define la clase de todo el camino.</p>
        <AtribucionDem />
      </section>

      <section id="limites">
        <h2>Límites e incertidumbre</h2>
        <div className="grid2">
          <div className="card"><h3 style={{ marginTop: '0' }}>Datos</h3><ul>
            <li>OSM es colaborativo: puede faltar un puente o un vado, o el tipo de superficie.</li>
            <li>La lluvia satelital es una estimación sobre celdas de unos 11 km: puede no captar tormentas muy localizadas.</li>
            <li>El DEM incluye árboles y techos; su error vertical es de algunos metros.</li>
            <li>JRC y la probabilidad de superación del terreno suponen conexión con el cauce y no modelan defensas. El piso observado sí tiene un ajuste provisorio por defensas costeras.</li>
            <li>La afectación depende de que la escuela cargue el parte.</li>
          </ul></div>
          <div className="card"><h3 style={{ marginTop: '0' }}>Modelo</h3><ul>
            <li>Pesos y umbrales del riesgo estimado no están calibrados con eventos observados.</li>
            <li>Los umbrales provisorios de lluvia son de arranque, no oficiales.</li>
            <li>Los accesos cortados por lagunas no se detectan en esta versión.</li>
            <li>Inundación y aislamiento son estáticos: no cambian con el pronóstico.</li>
          </ul></div>
        </div>
        <div className="tablewrap"><table><tbody>
          <tr><th>Indicador</th><th>Versión</th><th>Actualización</th></tr>
          <tr><td>Afectación</td><td>—</td><td>en tiempo real (cada parte)</td></tr>
          <tr><td>Peligro por lluvia</td><td className="mono">{REGLAS_V04_VERSION}; respaldo {VERSION_UMBRALES_PROVISORIOS}</td><td>cada {CADENCIAS['sync-ensemble'].minutos / 60} h</td></tr>
          <tr><td>Lluvia observada (NASA)</td><td className="mono">IMERG Early Run</td><td>cada {CADENCIAS['sync-imerg'].minutos} min</td></tr>
          <tr><td>Riesgo estimado</td><td className="mono">{MOTOR_VERSION} · {REGLAS_V04_VERSION}</td><td>cadencia base {CADENCIAS['calcular-riesgo'].minutos / 60} h; también después de IMERG</td></tr>
          <tr><td>Aislamiento vial</td><td className="mono">v4 · OSM 26/09/2026</td><td>con cada extracto OSM</td></tr>
          <tr><td>Riesgo de acceso</td><td className="mono">{REGLA_ACCESO_VERSION}</td><td>en cada cálculo de riesgo</td></tr>
          <tr><td>Inundación</td><td className="mono">v2 · job 1</td><td>estático</td></tr>
        </tbody></table></div>
      </section>

      <section id="glosario">
        <h2>Glosario</h2>
        <dl className="gloss">
          <dt>Sección</dt><dd>Grupo de alumnos que cursa junto en un turno; unidad mínima de suspensión de clases.</dd>
          <dt>Corte</dt><dd>Fotografía oficial de la nómina de alumnos por sección en una fecha.</dd>
          <dt>Alumnos alcanzados</dt><dd>Estudiantes distintos que pertenecen a una sección afectada o fueron marcados individualmente.</dd>
          <dt>Período de retorno</dt><dd>Tiempo medio entre eventos de igual o mayor magnitud; equivale a una probabilidad anual de 1/T.</dd>
          <dt>Percentil P<sub>k</sub></dt><dd>Valor por debajo del cual queda el k % de las observaciones históricas.</dd>
          <dt>Ensamble</dt><dd>Conjunto de corridas del pronóstico que permite estimar probabilidades.</dd>
          <dt>DEM</dt><dd>Modelo digital de elevación: grilla de alturas del terreno.</dd>
          <dt>Vado probable</dt><dd>Cruce de un curso de agua por camino de tierra sin puente ni túnel registrado.</dd>
          <dt>Margen de terreno</dt><dd>Diferencia entre la altura de la escuela y el nivel de agua modelado; negativo significa que el agua la supera.</dd>
          <dt>Redistribución de pesos</dt><dd>Cuando falta un componente, su peso se reparte entre los presentes en lugar de asumir cero.</dd>
        </dl>
      </section>
      </div>
    </article>
  )
}
