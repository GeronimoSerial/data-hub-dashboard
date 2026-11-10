'use client'

import { useEffect, useMemo, useState, type JSX } from 'react'
import type { DatosNatalidad } from '@/lib/mapas/natalidad'
import type { DatosMatriculaNatalidad, NivelMatricula } from '@/lib/mapas/matricula-natalidad'
import { resumirMatricula } from '@/lib/mapas/diagnostico-matricula-natalidad'
import { construirSerieNacimientos, fmt, type FiltroDepartamento } from '@/lib/mapas/estadisticas-natalidad'
import { etiquetaNacimientos } from '@/lib/mapas/datos-natalidad-renaper'
import styles from './natalidad-diagnostico.module.css'
import { GraficoAlumnosPorSeccion, GraficoMatriculaObservada, GraficoSerieNacimientos } from './estadisticas-natalidad-graficos'

export function EstadisticasNatalidadPanel({ datos }: { datos: DatosNatalidad }): JSX.Element {
  const [matricula, setMatricula] = useState<DatosMatriculaNatalidad | null>(null)
  const [error, setError] = useState(false)
  const [filtro, setFiltro] = useState<FiltroDepartamento>('Todos')
  const [nivel, setNivel] = useState<'Todos' | NivelMatricula>('Todos')
  const [ciclo, setCiclo] = useState<number | null>(null)
  useEffect(() => {
    let activo = true
    fetch('/data/natalidad/matricula.json')
      .then((response) => { if (!response.ok) throw new Error('Matrícula no disponible'); return response.json() as Promise<DatosMatriculaNatalidad> })
      .then((valor) => { if (activo) setMatricula(valor) })
      .catch(() => { if (activo) setError(true) })
    return () => { activo = false }
  }, [])
  const serie = useMemo(() => construirSerieNacimientos(datos, filtro), [datos, filtro])
  const medida = etiquetaNacimientos(datos)
  const departamento = datos.departamentos.find((d) => d.clave === filtro)
  const anio = ciclo ?? matricula?.meta.anios.at(-1)
  const ratio = (valor: number | null | undefined) => valor == null ? '—' : valor.toFixed(1)
  const puntosMatricula = matricula?.meta.anios.map((year) => ({ anio: year, matricula: resumirMatricula(matricula, year, departamento ? { departamento: departamento.nombre } : { nivel: nivel === 'Todos' ? undefined : nivel })?.matricula ?? null })) ?? []
  const filasRatio = matricula && anio != null ? datos.departamentos.map((d) => ({ clave: d.clave, departamento: d.nombre, valor: resumirMatricula(matricula, anio, { departamento: d.nombre })?.alumnosPorSeccion ?? null })) : []
  const ultimo = matricula && anio != null ? resumirMatricula(matricula, anio, departamento ? { departamento: departamento.nombre } : { nivel: nivel === 'Todos' ? undefined : nivel }) : null

  return <div className={`evolucion-panel ${styles.diagnostico}`}>
    <div className="map-filtro-campo">
      <label className="map-filtro-label" htmlFor="estadisticas-departamento">Departamento</label>
      <select id="estadisticas-departamento" className="map-filtro-input" value={filtro} onChange={(event) => setFiltro(event.target.value)}>
        <option value="Todos">Toda la provincia</option>
        {datos.departamentos.map((d) => <option key={d.clave} value={d.clave}>{d.nombre}</option>)}
      </select>
    </div>
    {error && <p role="status">No se pudo cargar la matrícula. Los nacimientos siguen disponibles.</p>}
    {!matricula && !error && <p role="status">Cargando matrícula…</p>}
    {matricula && <>
      <section className="evolucion-vista">
        <h3 className="evolucion-subtitulo">Evolución de matrícula observada · {departamento?.nombre ?? 'provincia'}</h3>
        {!departamento && <label>Nivel{' '}<select value={nivel} onChange={(event) => setNivel(event.target.value as 'Todos' | NivelMatricula)}>
          <option value="Todos">Todos</option><option value="Inicial">Inicial</option><option value="Primario">Primario</option>
        </select></label>}
        <p className="evolucion-descripcion">{matricula.meta.cobertura} Las escuelas informadas pueden cambiar entre ciclos; los totales no constituyen una comparación de cobertura constante. Incluyen establecimientos sin ubicación en el mapa.</p>
        {ultimo && <p><b>{fmt(ultimo.matricula)} estudiantes</b> · {fmt(ultimo.secciones)} secciones activas · {ratio(ultimo.alumnosPorSeccion)} estudiantes por sección ({anio})</p>}
        <GraficoMatriculaObservada puntos={puntosMatricula} />
        <details><summary>Ver datos por ciclo</summary><table><caption>Matrícula y secciones con alumnos por ciclo</caption><thead><tr><th scope="col">Ciclo</th><th scope="col">Estudiantes</th><th scope="col">Secciones activas</th><th scope="col">Estudiantes por sección</th><th scope="col">Escuelas</th></tr></thead><tbody>
          {matricula.meta.anios.map((year) => {
            const dato = resumirMatricula(matricula, year, departamento ? { departamento: departamento.nombre } : { nivel: nivel === 'Todos' ? undefined : nivel })
            return <tr key={year}><th scope="row">{year}{year === 2026 ? ' (provisional)' : ''}</th><td>{dato ? fmt(dato.matricula) : '—'}</td><td>{dato ? fmt(dato.secciones) : '—'}</td><td>{ratio(dato?.alumnosPorSeccion)}</td><td>{dato ? fmt(dato.escuelas) : '—'}</td></tr>
          })}
        </tbody></table></details>
        {departamento && <p className="evolucion-descripcion">El desglose departamental de secciones por nivel no está disponible para toda la cobertura; se muestra el total de Inicial y Primario.</p>}
      </section>
      <section className="evolucion-vista">
        <h3 className="evolucion-subtitulo">Alumnos por sección activa por departamento</h3>
        <label>Ciclo lectivo{' '}<select value={anio} onChange={(event) => setCiclo(Number(event.target.value))}>{matricula.meta.anios.map((year) => <option key={year} value={year}>{year}</option>)}</select></label>
        <p className="evolucion-descripcion">Inicial y Primario, suma de estudiantes dividida por la suma de secciones con alumnos en el mismo ciclo. El indicador no mide capacidad ni vacantes.</p>
        <GraficoAlumnosPorSeccion filas={filasRatio} />
        <details><summary>Ver datos por departamento</summary><table><caption>Comparación territorial CGE {anio}</caption><thead><tr><th scope="col">Departamento</th><th scope="col">Estudiantes</th><th scope="col">Secciones activas</th><th scope="col">Estudiantes por sección</th></tr></thead><tbody>
          {datos.departamentos.map((d) => { const dato = anio == null ? null : resumirMatricula(matricula, anio, { departamento: d.nombre }); return <tr key={d.clave}><th scope="row">{d.nombre}</th><td>{dato ? fmt(dato.matricula) : '—'}</td><td>{dato ? fmt(dato.secciones) : '—'}</td><td>{ratio(dato?.alumnosPorSeccion)}</td></tr> })}
        </tbody></table></details>
      </section>
    </>}
    <section className="evolucion-vista">
      <p><b>{medida} {datos.meta.anioFin}</b> · {serie.puntos.at(-1)?.valor == null ? '—' : fmt(serie.puntos.at(-1)!.valor)}</p>
      <h3 className="evolucion-subtitulo">{medida} — {serie.titulo}</h3>
      <p className="evolucion-descripcion">Contexto de cohortes de nacimiento, independiente de la matrícula y de las secciones. La correspondencia entre año de nacimiento y ciclo escolar es aproximada por el corte de edad a mitad de año; no es una proyección de demanda.</p>
      <GraficoSerieNacimientos puntos={serie.puntos} medida={medida} />
    </section>
  </div>
}
