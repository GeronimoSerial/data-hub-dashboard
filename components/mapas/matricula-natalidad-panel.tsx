'use client'

import { useId, useState } from 'react'
import type { DatosMatriculaNatalidad, MatriculaEscuelaAnual } from '@/lib/mapas/matricula-natalidad'
import { normalizarNombreDepartamento } from '@/lib/mapas/normalizar-departamento'
import { resumirMatricula } from '@/lib/mapas/diagnostico-matricula-natalidad'
import styles from './natalidad-diagnostico.module.css'
import { fmt } from '@/lib/mapas/estadisticas-natalidad'

interface Props {
  datos: DatosMatriculaNatalidad | null
  error?: boolean
  departamento?: string
  cueAnexo?: string
  cicloSeleccionado?: number
  onCicloChange?: (ciclo: number) => void
}

export function MatriculaNatalidadPanel({ datos, error, departamento, cueAnexo, cicloSeleccionado, onCicloChange }: Props) {
  const id = useId()
  const [ciclo, setCiclo] = useState<number | null>(null)
  const serie = datos && (cueAnexo
    ? datos.escuelas[cueAnexo]
    : departamento
      ? datos.departamentos[normalizarNombreDepartamento(departamento)]
      : datos.provincia)
  const anio = cicloSeleccionado ?? ciclo ?? datos?.meta.anios.at(-1)
  const escuelaAnual = cueAnexo && anio != null ? serie?.[anio] as MatriculaEscuelaAnual | undefined : undefined
  const resumen = datos && anio != null ? resumirMatricula(datos, anio, { departamento, cueAnexo }) : null
  const valor = (n: number | undefined) => n == null ? '—' : fmt(n)

  return (
    <section aria-label="Matrícula CGE">
      <strong>Matrícula CGE {anio}</strong>
      <div className={styles.matricula}>
        {error ? <p role="status">No se pudo cargar la matrícula. El mapa de nacimientos sigue disponible.</p>
          : !datos ? <p role="status">Cargando matrícula…</p>
          : <>
            <label htmlFor={id}>Ciclo lectivo de matrícula</label>{' '}
            <select id={id} value={anio} onChange={(event) => { const valor = Number(event.target.value); if (onCicloChange) onCicloChange(valor); else setCiclo(valor) }}>
              {datos.meta.anios.map((year) => <option key={year} value={year}>{year}</option>)}
            </select>
            {resumen ? <p><b>{fmt(resumen.matricula)} estudiantes</b> · {fmt(resumen.secciones)} secciones activas · Alumnos por sección activa: {resumen.alumnosPorSeccion == null ? '—' : resumen.alumnosPorSeccion.toFixed(1)}</p> : <p>Sin registro para el ciclo seleccionado.</p>}
            <p>Secciones con alumnos; no mide capacidad ni vacantes. Cobertura parcial CGE; 2026 provisional.</p>
            <details><summary>Ver evolución y cobertura</summary>
            <p>{datos.meta.cobertura}</p>
            <p>Fecha del reporte: 28/09/2026. Los ciclos de matrícula son independientes del año de nacimiento.</p>
            {!serie ? <p>Sin registros para {cueAnexo ? 'esta escuela' : 'este departamento'} en el reporte. No equivale a matrícula cero.</p>
              : <>
                <table style={{ width: '100%', textAlign: 'right' }}>
                  <caption>Matrícula {cueAnexo ? 'de la escuela' : departamento ? `de ${departamento}` : 'del conjunto informado en Corrientes'}</caption>
                  <thead><tr><th scope="col">Ciclo</th><th scope="col">Inicial</th><th scope="col">Primario</th><th scope="col">Total</th></tr></thead>
                  <tbody>{datos.meta.anios.map((year) => (
                    <tr key={year}><th scope="row">{year}</th><td>{valor(serie[year]?.porNivel.Inicial)}</td><td>{valor(serie[year]?.porNivel.Primario)}</td><td>{valor(serie[year]?.matricula)}</td></tr>
                  ))}</tbody>
                </table>
                <p>—: sin registro en el reporte; 0: valor informado como cero.</p>
                {cueAnexo && <>
                  {escuelaAnual ? <table style={{ width: '100%' }}>
                    <caption>Detalle de matrícula {anio}</caption>
                    <thead><tr><th scope="col">Nivel</th><th scope="col">Curso</th><th scope="col">Matrícula</th><th scope="col">Secciones</th></tr></thead>
                    <tbody>{escuelaAnual.cursos.map((curso) => <tr key={`${curso.nivel}-${curso.curso}`}>
                      <td>{curso.nivel}</td><td>{curso.curso}</td><td>{fmt(curso.matricula)}</td><td>{fmt(curso.secciones)}</td>
                    </tr>)}</tbody>
                  </table> : <p>Sin registro para el ciclo seleccionado.</p>}
                </>}
                {!cueAnexo && anio != null && <p>{valor(serie[anio]?.escuelas)} establecimientos informados en {anio}. Los totales incluyen los que no tienen ubicación en el mapa.</p>}
              </>}
            {!cueAnexo && !departamento && <p>{datos.meta.cueSinCoincidencia.length} CUE-anexo sin coincidencia con el archivo de escuelas del mapa. Permanecen incluidos en los totales.</p>}
            <p>Fuente: {datos.meta.fuente}. No se publican cantidades de alumnos con CUD.</p>
            </details>
          </>}
      </div>
    </section>
  )
}
