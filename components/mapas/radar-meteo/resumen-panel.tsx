'use client'

import { useMemo, useState } from 'react'
import { formatearLluviaMm } from '@/lib/infraestructura/radar-meteo/formato'

export type DiaDepartamento = {
  fecha: string
  lluvia24h: number | null
  lluviaLocalMax: number | null
  rafagaMaxKmh: number | null
  picoHora: string | null
  tormenta: boolean
  granizoMax: number | null
  cobertura: number
  resaltado: {
    lluvia: 'atencion' | 'importante' | null
    rafaga: 'atencion' | 'importante' | null
  }
}

export type DepartamentoResumen = {
  id: string
  nombre: string
  dias: DiaDepartamento[]
  proximas48h: Array<{
    hora: string
    lluviaMm: number | null
    rafagaMaxKmh: number | null
    probabilidadMax: number | null
    cobertura: number
  }>
}

export function ordenarDepartamentos(departamentos: DepartamentoResumen[]) {
  return [...departamentos].sort((a, b) => {
    const maxA = Math.max(0, ...a.dias.slice(0, 3).map((dia) => dia.lluvia24h ?? 0))
    const maxB = Math.max(0, ...b.dias.slice(0, 3).map((dia) => dia.lluvia24h ?? 0))
    return maxB - maxA || a.nombre.localeCompare(b.nombre, 'es')
  })
}

function mmColor(mm: number | null) {
  if (mm === null) return 'rgba(125,145,160,.16)'
  if (mm < 1) return 'rgba(65,145,185,.2)'
  if (mm < 5) return 'rgba(38,176,185,.42)'
  if (mm < 15) return 'rgba(62,190,104,.52)'
  if (mm < 25) return 'rgba(193,207,63,.62)'
  if (mm < 50) return 'rgba(238,151,48,.7)'
  return 'rgba(214,69,66,.78)'
}

function horaCorta(fecha: string | null) {
  if (!fecha) return 'sin pico'
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    weekday: 'short',
    hour: '2-digit',
  }).format(new Date(fecha))
}

function etiquetaDia(dia: string) {
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    weekday: 'short',
    day: 'numeric',
  }).format(new Date(`${dia}T12:00:00-03:00`))
}

function maxLluvia48h(departamento: DepartamentoResumen) {
  return Math.max(0, ...departamento.proximas48h.map((hora) => hora.lluviaMm ?? 0))
}

function totalLluvia48h(departamento: DepartamentoResumen) {
  return departamento.proximas48h.reduce((total, hora) => total + Math.max(0, hora.lluviaMm ?? 0), 0)
}

function pico48h(departamento: DepartamentoResumen) {
  return departamento.proximas48h.reduce(
    (pico, hora) => (hora.lluviaMm ?? 0) > (pico?.lluviaMm ?? 0) ? hora : pico,
    departamento.proximas48h[0],
  )?.hora ?? null
}

export function ResumenPanel({
  departamentos,
  dias,
  actualizadoHace,
  onDepartamento,
}: {
  departamentos: DepartamentoResumen[]
  dias: string[]
  actualizadoHace: number | null
  onDepartamento?: (id: string) => void
}) {
  const [vista, setVista] = useState<'dias' | 'horas'>('dias')
  const [busqueda, setBusqueda] = useState('')
  const [seleccion, setSeleccion] = useState<string | null>(null)
  const [abierto, setAbierto] = useState(false)
  const ordenados = useMemo(() => ordenarDepartamentos(departamentos)
    .filter((depto) => depto.nombre.toLocaleLowerCase('es')
      .includes(busqueda.toLocaleLowerCase('es'))), [departamentos, busqueda])
  const filas = vista === 'horas'
    ? [...ordenados].sort((a, b) => totalLluvia48h(b) - totalLluvia48h(a)
      || a.nombre.localeCompare(b.nombre, 'es'))
    : ordenados
  const topDos3Dias = ordenarDepartamentos(departamentos).slice(0, 2).map((depto) => ({
    nombre: depto.nombre,
    lluvia: Math.max(0, ...depto.dias.slice(0, 3).map((dia) => dia.lluvia24h ?? 0)),
  }))
  const seleccionado = departamentos.find((depto) => depto.id === seleccion)

  return (
    <section className={`radar-resumen${abierto ? ' is-open' : ''}`} aria-label="Pronóstico por departamento">
      <header className="radar-resumen-header">
        <div>
          <h2>Pronóstico por departamento</h2>
          <small>{actualizadoHace === null ? 'Sin actualización reciente' : `Actualizado hace ${actualizadoHace} min`}</small>
        </div>
        <div className="radar-resumen-tabs" role="group" aria-label="Período del pronóstico">
          <button type="button" aria-pressed={vista === 'horas'} onClick={() => setVista('horas')}>
            Próximas 48 h
          </button>
          <button type="button" aria-pressed={vista === 'dias'} onClick={() => setVista('dias')}>
            7 días
          </button>
        </div>
        <button
          className="radar-resumen-toggle"
          type="button"
          aria-expanded={abierto}
          onClick={() => setAbierto((value) => !value)}
        >
          {abierto ? 'Cerrar tabla' : 'Ver tabla'}
        </button>
      </header>
      <div className="radar-resumen-peek" role="group" aria-label="Departamentos con más lluvia en los próximos tres días">
        {topDos3Dias.map((depto) => (
          <span key={depto.nombre}>{depto.nombre} <strong>{formatearLluviaMm(depto.lluvia)}</strong></span>
        ))}
      </div>
      <label className="radar-resumen-search">
        Buscar departamento
        <input value={busqueda} onChange={(event) => setBusqueda(event.target.value)} placeholder="Ej. Capital" />
      </label>
      <div className="radar-resumen-table-wrap">
        {departamentos.length === 0 && (
          <p className="radar-resumen-empty" role="status">
            Todavía no hay un pronóstico disponible.
          </p>
        )}
        <table className="radar-resumen-table">
          <thead>
            <tr>
              <th scope="col">Departamento</th>
              {vista === 'dias'
                ? dias.map((dia) => {
                  const parcial = departamentos.some((depto) => (depto.dias.find((item) => item.fecha === dia)?.cobertura ?? 100) < 100)
                  return <th scope="col" key={dia}>{etiquetaDia(dia)}{parcial && <small className="radar-dia-parcial"> parcial</small>}</th>
                })
                : <th scope="col">Lluvia por hora en las próximas 48 h</th>}
            </tr>
          </thead>
          <tbody>
            {filas.map((depto) => (
              <tr key={depto.id} className={seleccion === depto.id ? 'is-selected' : ''}>
                <th scope="row">
                  <button type="button" onClick={() => {
                    setSeleccion(seleccion === depto.id ? null : depto.id)
                    onDepartamento?.(depto.id)
                  }}>{depto.nombre}</button>
                </th>
                {vista === 'dias' ? depto.dias.map((dia) => {
                  const threshold = dia.resaltado.lluvia !== null || (dia.rafagaMaxKmh ?? 0) >= 60
                  const detalle = `${depto.nombre}: ${formatearLluviaMm(dia.lluvia24h)}/día; máximo local `
                    + `${formatearLluviaMm(dia.lluviaLocalMax)}; hora de mayor lluvia ${horaCorta(dia.picoHora)}`
                  return (
                    <td key={dia.fecha}>
                      <button
                        type="button"
                        className={`radar-dia-cell${threshold ? ' is-highlighted' : ''}`}
                        style={{ backgroundColor: mmColor(dia.lluvia24h) }}
                        title={detalle}
                        onClick={() => setSeleccion(seleccion === depto.id ? null : depto.id)}
                      >
                        <strong className={threshold ? 'threshold' : ''}>
                          {formatearLluviaMm(dia.lluvia24h)}
                        </strong>
                        <small>
                          {dia.rafagaMaxKmh === null ? '—' : `↗ ${dia.rafagaMaxKmh}`}
                          {dia.tormenta ? ' ⛈' : ''}{dia.granizoMax ? ' ◈' : ''}
                        </small>
                      </button>
                    </td>
                  )
                }) : (
                  <td>
                    {maxLluvia48h(depto) < 0.1 ? (
                      <small>Sin lluvia prevista en 48 h</small>
                    ) : (
                      <>
                        <div className="radar-hour-row" title="Lluvia media por hora, próximas 48 horas">
                          {depto.proximas48h.map((hora, index) => {
                            const lluvia = Math.max(0, hora.lluviaMm ?? 0)
                            const escala = Math.max(1, maxLluvia48h(depto))
                            return (
                              <i
                                key={`${hora.hora}-${index}`}
                                style={{
                                  height: `${lluvia === 0 ? 1 : Math.max(2, (lluvia / escala) * 36)}px`,
                                  backgroundColor: mmColor(hora.lluviaMm),
                                }}
                                title={`${new Date(hora.hora).toLocaleString('es-AR')}: ${formatearLluviaMm(hora.lluviaMm)}`}
                              />
                            )
                          })}
                        </div>
                        <small>Pico: {horaCorta(pico48h(depto))}</small>
                      </>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {seleccionado && (
        <div className="radar-resumen-detail" aria-live="polite">
          <strong>{seleccionado.nombre} · {vista === 'dias' ? 'detalle diario' : 'próximas 48 h'}</strong>
          {vista === 'dias' ? seleccionado.dias.map((dia) => (
            <p key={dia.fecha}>
              {dia.fecha}: área {dia.lluvia24h ?? '—'} mm · máximo local {dia.lluviaLocalMax ?? '—'} mm ·
              hora de mayor lluvia {horaCorta(dia.picoHora)}
            </p>
          )) : (
            maxLluvia48h(seleccionado) < 0.1
              ? <p>Sin lluvia prevista en 48 h</p>
              : <p>
                  {seleccionado.proximas48h.map((hora) => formatearLluviaMm(hora.lluviaMm)).join(' · ')} ·
                  {' '}pico {horaCorta(pico48h(seleccionado))}
                </p>
          )}
        </div>
      )}
    </section>
  )
}
