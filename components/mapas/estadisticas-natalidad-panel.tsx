'use client'

import { useEffect, useMemo, useState, type JSX } from 'react'
import {
  construirKpis,
  construirOfertaInicialVsCohorte,
  construirSerieProvincialNacimientos,
  construirVariacionNacimientosPorDepartamento,
  type FiltroDepartamento,
} from '@/lib/mapas/estadisticas-natalidad'
import type { DatosNatalidad } from '@/lib/mapas/natalidad'
import {
  GraficoOfertaInicialVsCohorte,
  GraficoSerieNacimientos,
  GraficoVariacionPorDepartamento,
} from './estadisticas-natalidad-graficos'

function fmt(n: number): string {
  return new Intl.NumberFormat('es-AR').format(n)
}

function fmtPct(pct: number | null): string {
  if (pct == null) return '—'
  return `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%`
}

// T8: pestaña "Estadísticas" — mismo dato ya cargado por el mapa
// (public/data/natalidad/departamentos.json), sin pedir un endpoint nuevo.
// Feedback 2026-09-25: 3 gráficos, cada uno con un título y una línea de
// "por qué importa" — nada de un gráfico que no sirva para planificar
// inicial/primario a partir de la caída de nacidos. La matrícula (T7) se
// retiró del feature (ver odd/tasks/mapa-natalidad.md): la fuente sólo cubre
// un panel de 288 establecimientos rurales de baja matrícula, no era
// representativa a nivel departamento/provincia.
export function EstadisticasNatalidadPanel(): JSX.Element {
  const [datos, setDatos] = useState<DatosNatalidad | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<FiltroDepartamento>('Todos')

  useEffect(() => {
    let cancelado = false
    fetch('/data/natalidad/departamentos.json')
      .then((r) => {
        if (!r.ok) throw new Error(`No se pudo cargar departamentos.json (HTTP ${r.status})`)
        return r.json() as Promise<DatosNatalidad>
      })
      .then((resultado) => {
        if (!cancelado) setDatos(resultado)
      })
      .catch((causa: unknown) => {
        if (!cancelado) setError(causa instanceof Error ? causa.message : 'No se pudieron cargar las estadísticas')
      })
    return () => {
      cancelado = true
    }
  }, [])

  const serieNacimientos = useMemo(() => (datos ? construirSerieProvincialNacimientos(datos) : []), [datos])
  const variacionPorDepartamento = useMemo(
    () => (datos ? construirVariacionNacimientosPorDepartamento(datos) : []),
    [datos],
  )
  const ofertaVsCohorte = useMemo(
    () => (datos ? construirOfertaInicialVsCohorte(datos, filtro) : { anioCohorte: 0, filas: [] }),
    [datos, filtro],
  )
  const kpis = useMemo(
    () => (datos ? construirKpis(datos, filtro) : null),
    [datos, filtro],
  )

  if (error) return <div className="map-status map-status-error">{error}</div>
  if (!datos || !kpis) return <div className="map-status">Cargando estadísticas…</div>

  return (
    <div className="evolucion-panel">
      <div className="natalidad-filtro-departamento">
        <label>
          Departamento:{' '}
          <select value={filtro} onChange={(e) => setFiltro(e.target.value)}>
            <option value="Todos">Todos</option>
            {datos.departamentos.map((d) => (
              <option key={d.clave} value={d.clave}>
                {d.nombre}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="natalidad-kpis">
        <div className="natalidad-kpi-tile">
          <div className="natalidad-kpi-etiqueta">Nacidos vivos {datos.meta.anioFin}</div>
          <div className="natalidad-kpi-valor">{fmt(kpis.nacidosUltimoAnio)}</div>
        </div>
        <div className="natalidad-kpi-tile">
          <div className="natalidad-kpi-etiqueta">
            Variación {datos.meta.anioInicio}→{datos.meta.anioFin}
          </div>
          <div className="natalidad-kpi-valor">{fmtPct(kpis.variacionNacidos.pct)}</div>
        </div>
        <div className="natalidad-kpi-tile">
          <div className="natalidad-kpi-etiqueta">Secciones de nivel inicial</div>
          <div className="natalidad-kpi-valor">{fmt(kpis.seccionesInicialTotal)}</div>
        </div>
        <div className="natalidad-kpi-tile">
          <div className="natalidad-kpi-etiqueta">Escuelas con oferta de inicial</div>
          <div className="natalidad-kpi-valor">{fmt(kpis.escuelasInicialTotal)}</div>
        </div>
      </div>

      <div className="evolucion-vista">
        <h3 className="evolucion-subtitulo">Nacidos vivos — tendencia provincial</h3>
        <p className="evolucion-descripcion">
          Por qué importa: la generación que hoy ocupa las salas de 3 a 5 años nació en estos años — ver cómo bajó
          ayuda a anticipar cuánto va a achicarse la demanda de inicial.
        </p>
        <GraficoSerieNacimientos puntos={serieNacimientos} />
      </div>

      <div className="evolucion-vista">
        <h3 className="evolucion-subtitulo">Variación de nacidos vivos por departamento</h3>
        <p className="evolucion-descripcion">
          Por qué importa: ubica dónde cayó más fuerte la natalidad, para priorizar dónde revisar primero la oferta
          de inicial y primario.
        </p>
        <GraficoVariacionPorDepartamento barras={variacionPorDepartamento} />
      </div>

      <div className="evolucion-vista">
        <h3 className="evolucion-subtitulo">
          Oferta de inicial vs. cohorte de Sala de 3 (nacidos en {ofertaVsCohorte.anioCohorte})
        </h3>
        <p className="evolucion-descripcion">
          Por qué importa: compara, por departamento, las secciones de nivel inicial disponibles hoy contra el
          tamaño de la cohorte que efectivamente entra a Sala de 3 este ciclo (nacidos {ofertaVsCohorte.anioCohorte}
          , ~3 años atrás de {datos.meta.anioFin}) — la comparación central del mapa, por departamento.
        </p>
        <GraficoOfertaInicialVsCohorte filas={ofertaVsCohorte.filas} />
      </div>
    </div>
  )
}
