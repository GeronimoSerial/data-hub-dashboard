'use client'

import { useId, useState } from 'react'
import type { DatosMatriculaNatalidad, MatriculaEscuelaAnual } from '@/lib/mapas/matricula-natalidad'
import { normalizarNombreDepartamento } from '@/lib/mapas/normalizar-departamento'
import { fmt } from '@/lib/mapas/estadisticas-natalidad'

interface Props {
  datos: DatosMatriculaNatalidad | null
  error?: boolean
  departamento?: string
  cueAnexo?: string
}

export function MatriculaNatalidadPanel({ datos, error, departamento, cueAnexo }: Props) {
  const id = useId()
  const [ciclo, setCiclo] = useState<number | null>(null)
  const serie = datos && (cueAnexo
    ? datos.escuelas[cueAnexo]
    : departamento
      ? datos.departamentos[normalizarNombreDepartamento(departamento)]
      : datos.provincia)
  const anio = ciclo ?? datos?.meta.anios.at(-1)
  const escuelaAnual = cueAnexo && anio != null ? serie?.[anio] as MatriculaEscuelaAnual | undefined : undefined
  const valor = (n: number | undefined) => n == null ? '—' : fmt(n)

  return (
    <details>
      <summary>Matrícula CGE 2021–2026</summary>
      <div style={{ maxHeight: 320, overflow: 'auto', fontSize: '0.8125rem' }}>
        {error ? <p role="status">No se pudo cargar la matrícula. El mapa de nacimientos sigue disponible.</p>
          : !datos ? <p role="status">Cargando matrícula…</p>
          : <>
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
                  <label htmlFor={id}>Ciclo lectivo de matrícula</label>{' '}
                  <select id={id} value={anio} onChange={(event) => setCiclo(Number(event.target.value))}>
                    {datos.meta.anios.map((year) => <option key={year} value={year}>{year}</option>)}
                  </select>
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
          </>}
      </div>
    </details>
  )
}
