'use client'

import type { construirSnapshotRenaper } from '@/lib/mapas/renaper-natalidad'
import { normalizarNombreDepartamento } from '@/lib/mapas/normalizar-departamento'
import { fmt } from '@/lib/mapas/estadisticas-natalidad'

export type DatosRenaperNatalidad = ReturnType<typeof construirSnapshotRenaper>

export function RenaperNatalidadPanel({ datos, error, departamento }: {
  datos: DatosRenaperNatalidad | null
  error?: boolean
  departamento?: string
}) {
  const entidad = datos && (departamento
    ? datos.departamentos[normalizarNombreDepartamento(departamento)]
    : datos.provincia)
  return (
    <details>
      <summary>RENAPER · nacimientos hasta 2025</summary>
      <div style={{ maxHeight: 320, overflow: 'auto', fontSize: '0.8125rem' }}>
        {error ? <p role="status">No se pudo cargar RENAPER. El mapa DEIS sigue disponible.</p>
          : !datos ? <p role="status">Cargando RENAPER…</p>
          : <>
            <p>{datos.meta.metodologia}</p>
            <p>No se empalma con DEIS ni reemplaza los valores del mapa. Corte de la fuente: {datos.meta.corteFuente}.</p>
            {!entidad ? <p>Sin datos RENAPER para el departamento seleccionado.</p>
              : <table style={{ width: '100%', textAlign: 'right' }}>
                <caption>Nacimientos identificados · {entidad.nombre}</caption>
                <thead><tr><th scope="col">Año</th><th scope="col">Nacimientos</th>{!departamento && <th scope="col">Diferencia departamental</th>}</tr></thead>
                <tbody>{datos.meta.anios.map((anio) => <tr key={anio}>
                  <th scope="row">{anio}</th>
                  <td>{entidad.serie[anio] == null ? '—' : fmt(entidad.serie[anio])}</td>
                  {!departamento && <td>{datos.conciliacion[anio] == null ? '—' : fmt(datos.conciliacion[anio].diferenciaProvincia)}</td>}
                </tr>)}</tbody>
              </table>}
            {!departamento && <p>La diferencia publicada es el total provincial menos la suma de los 25 departamentos. Se conserva sin redistribuir ni atribuir una causa no verificada.</p>}
            <p>Fuente: <a href={datos.meta.fuente.url} target="_blank" rel="noreferrer">{datos.meta.fuente.nombre}</a>.</p>
          </>}
      </div>
    </details>
  )
}
