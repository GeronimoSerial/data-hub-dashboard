'use client'

import { useEffect, useRef } from 'react'
import { Formula, Tex } from './formula'
import { iniciarSimuladores } from './simuladores'

// Methodology of every model behind the infrastructure map, written for
// non-programmer specialists. The markup is static; `iniciarSimuladores`
// wires the interactive charts and simulators onto it. Numbers mirror the
// code: change both together.
export function MetodologiaMapa() {
  const raiz = useRef<HTMLElement>(null)

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
          <a href="#metodologia/riesgo"><b>Riesgo estimado</b><span>¿Qué escuelas pueden ver interrumpidas sus clases?</span></a>
          <a href="#metodologia/aislamiento"><b>Aislamiento</b><span>¿Qué tan difícil es para alumnos y docentes llegar?</span></a>
          <a href="#metodologia/acceso"><b>Riesgo de acceso</b><span>¿Puede cortarse el camino a la escuela?</span></a>
          <a href="#metodologia/inundacion"><b>Inundación</b><span>¿Llegó históricamente el agua al edificio o al camino?</span></a>
        </div>
        <h3>Con datos de las principales agencias científicas del mundo</h3>
        <div className="sources">
          <a href="#metodologia/nasa"><b>NASA</b><span>Lluvia observada por satélite cada 30 minutos (misión GPM, junto a JAXA)</span></a>
          <a href="#metodologia/inundacion"><b>Comisión Europea · JRC</b><span>Mapas globales de crecidas de río y de agua superficial</span></a>
          <a href="#metodologia/inundacion"><b>Copernicus</b><span>Modelo de elevación del terreno a 30 m</span></a>
          <a href="#metodologia/lluvia"><b>ECMWF · ERA5</b><span>Climatología histórica de lluvia</span></a>
          <a href="#metodologia/lluvia"><b>Open-Meteo</b><span>Pronóstico de lluvia a 24, 72 y 240 horas</span></a>
          <a href="#metodologia/aislamiento"><b>OpenStreetMap</b><span>Red vial, puentes y vados</span></a>
          <a href="#metodologia/afectacion"><b>Gestión Educativa</b><span>Padrón de escuelas, secciones y matrícula</span></a>
        </div>
      </header>

      <section id="linaje">
        <h2>Trazabilidad de los datos</h2>
        <p>Cada fuente pasa por un proceso propio antes de llegar al mapa. Las líneas muestran qué datos alimentan a qué indicador.</p>
        <div className="card">
        <svg viewBox="0 0 900 440" role="img" aria-label="Diagrama de linaje de datos">
          <defs><marker id="ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0L10,5L0,10z" fill="var(--muted)"/></marker></defs>
          <g fontSize="13">
            <text x="20" y="24" fontWeight="600" fill="var(--muted)">FUENTES</text>
            <text x="350" y="24" fontWeight="600" fill="var(--muted)">PROCESO</text>
            <text x="680" y="24" fontWeight="600" fill="var(--muted)">INDICADOR</text>
          </g>
          <g id="lin-src"></g>
        </svg>
        </div>
        <p className="why">El padrón de escuelas (con coordenadas) es la base común: todo indicador se calcula para cada escuela del padrón, incluidas las que no reportan problemas.</p>
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
        <p>Pronóstico de precipitación de Open-Meteo, actualizado cada 6 horas, por celda de grilla y para tres horizontes: 24, 72 y 240 horas. La referencia de “normal” es la <span className="term" tabIndex={0} data-def="Distribución histórica de la lluvia en un lugar. Aquí se usan los percentiles 90, 95 y 99 de la serie ERA5.">climatología</span> de cada celda.</p>
        <h3>Método</h3>
        <p>Se compara la lluvia acumulada con los percentiles históricos de la celda. La comparación es estricta: igualar un percentil no lo supera.</p>
        <Formula tex={String.raw`\text{nivel}(mm)=\begin{cases}\text{rojo} & mm>P_{99}\\ \text{naranja} & mm>P_{95}\\ \text{amarillo} & mm>P_{90}\\ \text{verde} & \text{en otro caso}\end{cases}`} />
        <p>Cuando hay pronóstico por <span className="term" tabIndex={0} data-def="Conjunto de corridas del modelo con condiciones iniciales levemente distintas. Permite estimar la probabilidad de superar un umbral.">ensamble</span>, se usa la probabilidad de superar cada percentil: rojo si <Tex tex={String.raw`P(mm>P_{99})\ge 0{,}5`} />; naranja si <Tex tex={String.raw`P(mm>P_{95})\ge 0{,}5`} />; amarillo si <Tex tex={String.raw`P(mm>P_{95})>0{,}1`} />.</p>
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
              <li><b>Lluvia ya caída sobre cada escuela</b> en las últimas 24 y 72 horas: alimenta la “lluvia antecedente” del riesgo estimado. Un suelo que ya recibió mucha agua se inunda con menos lluvia nueva.</li>
              <li><b>Control de calidad del pronóstico</b>: cada día se compara lo pronosticado con lo observado por NASA en cada departamento, para saber cuánto confiar en el pronóstico.</li>
            </ol></div>
        </div>
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
        <p className="question">Combinando peligro y vulnerabilidad, ¿qué tan expuesta está la escuela?</p>
        <p>Se sigue el esquema clásico <b>riesgo = amenaza × vulnerabilidad</b>. Ambas dimensiones se expresan en una escala de 0 a 100 y el producto se reescala a 0–100.</p>
        <Formula tex={String.raw`R=\operatorname{round}\!\left(\frac{A\cdot V}{100}\right),\qquad A,V,R\in[0,100]`} />
        <div className="grid2">
          <div className="card">
            <h3 style={{ marginTop: '0' }}>Amenaza <Tex tex={String.raw`A`} /></h3>
            <table><tbody><tr><th>Componente</th><th>Peso</th><th>Escala</th></tr>
            <tr><td>Peligro en la celda</td><td className="mono">0,5</td><td>verde 0 · amarillo 33 · naranja 66 · rojo 100</td></tr>
            <tr><td>Caudal del río asociado</td><td className="mono">0,3</td><td>misma escala</td></tr>
            <tr><td>Lluvia ya caída (NASA GPM IMERG)</td><td className="mono">0,2</td><td><Tex tex={String.raw`\min(100,\ mm/150\cdot 100)`} /></td></tr></tbody></table>
          </div>
          <div className="card">
            <h3 style={{ marginTop: '0' }}>Vulnerabilidad <Tex tex={String.raw`V`} /></h3>
            <table><tbody><tr><th>Componente</th><th>Peso</th><th>Escala</th></tr>
            <tr><td>Historial de afectaciones (365 días)</td><td className="mono">0,7</td><td>promedio de tres términos saturados</td></tr>
            <tr><td>Susceptibilidad física</td><td className="mono">0,3</td><td>promedio de indicadores × 100</td></tr></tbody></table>
          </div>
        </div>
        <h3>Historial</h3>
        <Formula tex={String.raw`H=\frac{1}{3}\left[\min\!\left(100,\tfrac{n}{5}\cdot100\right)+\min\!\left(100,\tfrac{h}{720}\cdot100\right)+\min\!\left(100,\tfrac{c}{3}\cdot100\right)\right]`} />
        <p><Tex tex={String.raw`n`} />: cantidad de partes en el último año; <Tex tex={String.raw`h`} />: horas acumuladas con parte vigente (720 h = 30 días); <Tex tex={String.raw`c`} />: partes con acceso interrumpido. Cada término satura en 100.</p>
        <h3>Datos faltantes: redistribución de pesos</h3>
        <p>Un dato faltante <b>nunca</b> se reemplaza por cero. Su peso se reparte proporcionalmente entre los componentes presentes:</p>
        <Formula tex={String.raw`D=\sum_{i\in P}\frac{w_i}{\sum_{j\in P}w_j}\,x_i\qquad P=\{\text{componentes con dato}\}`} />
        <p>A cambio, la <b>confianza</b> baja: alta sin faltantes, media con uno, baja con dos o más o sin evidencia de amenaza. Un umbral provisorio cuenta como faltante.</p>
        <div className="sim" id="sim-riesgo">
          <h4>Simulador: riesgo estimado</h4>
          <p className="hint">Mové cada componente o desmarcalo para ver cómo se redistribuyen los pesos.</p>
          <div className="ctrls">
            <div className="ctrl"><label className="chk"><input type="checkbox" id="r-pc-on" defaultChecked /> Peligro en celda</label><select defaultValue="66" id="r-pc"><option value="0">verde (0)</option><option value="33">amarillo (33)</option><option value="66">naranja (66)</option><option value="100">rojo (100)</option></select></div>
            <div className="ctrl"><label className="chk"><input type="checkbox" id="r-cq-on" /> Caudal (si hay río asociado)</label><select defaultValue="33" id="r-cq"><option value="0">verde (0)</option><option value="33">amarillo (33)</option><option value="66">naranja (66)</option><option value="100">rojo (100)</option></select></div>
            <div className="ctrl"><label className="chk"><input type="checkbox" id="r-ll-on" defaultChecked /> Lluvia antecedente <output id="r-ll-o"></output></label><input type="range" id="r-ll" min="0" max="250" defaultValue="90" /></div>
            <div className="ctrl"><label>Partes en el año <output id="r-n-o"></output></label><input type="range" id="r-n" min="0" max="8" defaultValue="2" /></div>
            <div className="ctrl"><label>Horas con parte vigente <output id="r-h-o"></output></label><input type="range" id="r-h" min="0" max="1000" step="10" defaultValue="200" /></div>
            <div className="ctrl"><label>Partes con acceso interrumpido <output id="r-c-o"></output></label><input type="range" id="r-c" min="0" max="5" defaultValue="1" /></div>
            <div className="ctrl"><label className="chk"><input type="checkbox" id="r-su-on" defaultChecked /> Susceptibilidad <output id="r-su-o"></output></label><input type="range" id="r-su" min="0" max="100" defaultValue="40" /></div>
          </div>
          <div className="result">
            <div><div className="why">Amenaza</div><div className="big" id="r-A"></div></div>
            <div><div className="why">Vulnerabilidad</div><div className="big" id="r-V"></div></div>
            <div><div className="why">Riesgo</div><div className="big" id="r-R"></div></div>
            <span className="badge" id="r-b"></span><span className="why" id="r-conf"></span>
          </div>
          <div id="r-weights" className="wf" style={{ marginTop: '14px' }}></div>
        </div>
        <h3>Superficie de riesgo</h3>
        <p>Como el riesgo es un producto, las curvas de nivel son hipérbolas: una amenaza muy alta con vulnerabilidad baja da el mismo riesgo que valores intermedios en ambas. El punto marca el caso del simulador.</p>
        <div className="card"><canvas id="heat" width="560" height="420" style={{ width: '100%', maxWidth: '560px', height: 'auto' }} role="img" aria-label="Mapa de calor de riesgo según amenaza y vulnerabilidad"></canvas></div>
        <table><tbody><tr><th>Riesgo</th><th>Nivel</th></tr><tr><td className="mono">0 – 24</td><td>bajo</td></tr><tr><td className="mono">25 – 49</td><td>moderado</td></tr><tr><td className="mono">50 – 74</td><td>alto</td></tr><tr><td className="mono">75 – 100</td><td>muy alto</td></tr></tbody></table>
        <h3>Exposición educativa</h3>
        <p>Junto al riesgo, cada escuela muestra su <b>matrícula y su cantidad de secciones</b>. Es una dimensión aparte que nunca se mezcla en el puntaje: el riesgo dice qué tan probable es una interrupción; la exposición dice cuántos estudiantes perderían clases. Leídas juntas permiten priorizar, por ejemplo, una escuela de riesgo moderado con 600 alumnos frente a una de riesgo alto con 15.</p>
        <div className="sim" id="sim-expo">
          <h4>Simulador: riesgo y exposición juntos</h4>
          <p className="hint">Cada círculo es una escuela de ejemplo. El tamaño es la matrícula; la posición horizontal, el riesgo estimado.</p>
          <svg id="expo-svg" viewBox="0 0 760 240" role="img" aria-label="Escuelas según riesgo y matrícula"></svg>
        </div>
        <p className="why">Versión del modelo: motor v0.2.</p>
      </section>

      <section id="aislamiento">
        <h2>4 · Aislamiento vial</h2>
        <p className="question">¿Qué tan difícil es llegar a la escuela por camino desde la red pavimentada?</p>
        <h3>Fuente</h3>
        <p>Red vial de <span className="term" tabIndex={0} data-def="OpenStreetMap: cartografía colaborativa abierta. Incluye tipo de vía, superficie, puentes y vados.">OpenStreetMap</span>, extracto del 26/09/2026, con tipo de vía, superficie, puentes, vados y cursos de agua. Se recalcula cuando se actualiza el extracto (versión 4 del cálculo).</p>
        <h3>Método</h3>
        <ol className="steps">
          <li>La red se convierte en un grafo. Cada tramo recibe un <b>costo</b> = longitud × factor según tipo de vía; los tramos de tierra o ripio (salvo huellas) multiplican el factor por 1,5.</li>
          <li>Se busca la ruta de menor costo desde la escuela hasta la red pavimentada y hasta la localidad cabecera.</li>
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
        <p className="question">¿Qué probabilidad hay de que el camino a la escuela quede cortado?</p>
        <p>Combina el aislamiento vial con el peligro actual y el historial. Es una dimensión separada: <b>no</b> se suma al riesgo estimado de la sección 3. Se parte de un puntaje base según el nivel de aislamiento y se suman agravantes, con tope en 100.</p>
        <Formula tex={String.raw`S=\min\!\Big(100,\ B(\text{nivel})+\sum_k a_k\Big)\qquad B=(0,\,20,\,45,\,70)`} />
        <div className="sim" id="sim-acc">
          <h4>Simulador: riesgo de acceso</h4>
          <div className="ctrls">
            <div className="ctrl"><label>Nivel de aislamiento</label><select defaultValue="2" id="c-n"><option value="0">0 · base 0</option><option value="1">1 · base 20</option><option value="2">2 · base 45</option><option value="3">3 · base 70</option></select></div>
            <div className="ctrl"><label className="chk"><input type="checkbox" id="c-cr" defaultChecked /> Cruce de agua sin puente confirmado (+25)</label><label className="chk"><input type="checkbox" id="c-pa" /> Peligro naranja o rojo (+25)</label><label className="chk"><input type="checkbox" id="c-hi" /> Hubo acceso interrumpido (+15)</label></div>
            <div className="ctrl"><label>Alternativa sin cruce</label><select defaultValue="nd" id="c-al"><option value="si">Existe (+0)</option><option value="no">No existe (+15)</option><option value="nd">Desconocida (+20)</option></select></div>
          </div>
          <div id="c-wf" className="wf" style={{ marginTop: '16px' }}></div>
          <div className="result"><div className="big" id="c-s"></div><span className="badge" id="c-b"></span></div>
        </div>
        <p>El riesgo de acceso anticipa exactamente lo que el directivo declara después como “problema de los alumnos”: demoras, inasistencias o un trayecto peligroso. También anticipa la llegada de docentes que viven lejos de la escuela.</p>
        <p>Un dato desconocido suma más que un “no” confirmado (+20 contra +15): <b>la falta de información nunca abarata el riesgo</b>. Si el aislamiento no tiene dato, el riesgo de acceso tampoco lo tiene.</p>
        <p className="why">A diferencia del riesgo estimado, el riesgo de acceso tiene tres niveles: bajo (menos de 25), moderado (25 a 49) y alto (50 o más). Versión de la regla: acceso v1.</p>
      </section>

      <section id="inundacion">
        <h2>6 · Inundación</h2>
        <p className="question">¿Hasta dónde llegó históricamente el agua de los ríos y lagunas cercanos?</p>
        <h3>Fuentes</h3>
        <div className="tablewrap"><table><tbody>
          <tr><th>Fuente</th><th>Qué aporta</th><th>Resolución</th></tr>
          <tr><td>JRC Global River Flood Hazard Maps v2.1</td><td>Profundidad de crecida de río para períodos de retorno de 10, 100 y 500 años</td><td className="mono">~90 m</td></tr>
          <tr><td>JRC Global Surface Water</td><td>Porcentaje del tiempo con agua presente (1984–2021)</td><td className="mono">30 m</td></tr>
          <tr><td>Copernicus DEM GLO-30</td><td>Altura del terreno</td><td className="mono">30 m</td></tr>
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
            <div className="ctrl"><label>Crecida máxima en el río, 10 / 100 / 500 años</label><div className="mono" style={{ fontSize: '.85rem' }}>1,5 · 2,8 · 3,6 m (ejemplo)</div></div>
          </div>
          <svg id="u-svg" viewBox="0 0 760 260" role="img" aria-label="Corte transversal de río y escuela" style={{ marginTop: '14px' }}></svg>
          <div className="result"><span className="badge" id="u-b"></span><span className="why" id="u-why"></span></div>
        </div>
        <h3 id="inundacion-junto-laguna">Junto a laguna</h3>
        <p>Marca aparte de la clase de río: se activa cuando hay agua presente al menos el <b>25 %</b> del tiempo dentro de <b>300 m</b> y el terreno de la escuela está a <b>6 m</b> o menos sobre esa agua.</p>
        <h3 id="inundacion-ruta-acceso">Ruta de acceso</h3>
        <p>Se recorre la ruta calculada en la sección 4 y se toma la peor clase sostenida en al menos unos 270 m (3 puntos cada 90 m). Así un píxel aislado no define la clase de todo el camino.</p>
      </section>

      <section id="limites">
        <h2>Límites e incertidumbre</h2>
        <div className="grid2">
          <div className="card"><h3 style={{ marginTop: '0' }}>Datos</h3><ul>
            <li>OSM es colaborativo: puede faltar un puente o un vado, o el tipo de superficie.</li>
            <li>La lluvia satelital es una estimación sobre celdas de unos 11 km: puede no captar tormentas muy localizadas.</li>
            <li>El DEM incluye árboles y techos; su error vertical es de algunos metros.</li>
            <li>JRC no modela defensas; la verificación de terreno sólo lo compensa en parte.</li>
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
          <tr><td>Peligro por lluvia</td><td className="mono">umbrales provisorios v0.1</td><td>cada 6 h</td></tr>
          <tr><td>Lluvia observada (NASA)</td><td className="mono">IMERG Early Run</td><td>cada hora</td></tr>
          <tr><td>Riesgo estimado</td><td className="mono">motor v0.2</td><td>con cada pronóstico</td></tr>
          <tr><td>Aislamiento vial</td><td className="mono">v4 · OSM 26/09/2026</td><td>con cada extracto OSM</td></tr>
          <tr><td>Riesgo de acceso</td><td className="mono">acceso v1</td><td>con cada pronóstico</td></tr>
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
