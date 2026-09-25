'use client'

import { useEffect, useMemo, useState, type JSX } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
import {
  construirKpis,
  construirNacidosPorSeccionCohorte,
  construirSerieProvincialNacimientos,
  construirVariacionNacimientosPorDepartamento,
  type FiltroDepartamento,
} from '@/lib/mapas/estadisticas-natalidad'
import type { DatosNatalidad } from '@/lib/mapas/natalidad'
import {
  GraficoNacidosPorSeccion,
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
  const nacidosPorSeccion = useMemo(
    () =>
      datos
        ? construirNacidosPorSeccionCohorte(datos, filtro)
        : { ciclo: 0, aniosCohorte: [], filas: [], provincia: { departamento: '', nacidosCohorte: 0, secciones: 0, nacidosPorSeccion: null } },
    [datos, filtro],
  )
  const kpis = useMemo(
    () => (datos ? construirKpis(datos, filtro) : null),
    [datos, filtro],
  )
  const itemsDepartamento = useMemo(() => {
    if (!datos) return { Todos: 'Todos' }
    return {
      Todos: 'Todos',
      ...Object.fromEntries(datos.departamentos.map((d) => [d.clave, d.nombre])),
    }
  }, [datos])

  if (error) return <div className="map-status map-status-error">{error}</div>
  if (!datos || !kpis) return <div className="map-status">Cargando estadísticas…</div>

  return (
    <div className="evolucion-panel">
      <div className="natalidad-filtro-departamento map-filtro-campo">
        <span className="map-filtro-label">Departamento</span>
        <Select value={filtro} items={itemsDepartamento} onValueChange={(v) => v != null && setFiltro(String(v))}>
          <SelectTrigger className="map-filtro-input" aria-label="Departamento" />
          <SelectContent>
            <SelectItem value="Todos">Todos</SelectItem>
            {datos.departamentos.map((d) => (
              <SelectItem key={d.clave} value={d.clave}>
                {d.nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
        <h3 className="evolucion-subtitulo">Nacidos por sección de Sala de 3 a 5 (ciclo {nacidosPorSeccion.ciclo})</h3>
        <p className="evolucion-descripcion">
          Por qué importa: nacidos de las cohortes que hoy ocupan Sala de 3 a 5 (
          {nacidosPorSeccion.aniosCohorte.join(', ')}) sobre las secciones que las reciben (Sala de 3/4/5, Plurisala
          y Sala Integrada) — pocos nacidos por sección sugieren sobreoferta o secciones muy chicas; muchos,
          presión sobre la oferta actual.
        </p>
        <GraficoNacidosPorSeccion filas={nacidosPorSeccion.filas} provincia={nacidosPorSeccion.provincia} />
        <p className="evolucion-descripcion natalidad-nota-metodologica">
          Alineación de cohorte: Sala de 5 ≈ nacidos {nacidosPorSeccion.ciclo - 6}, Sala de 4 ≈ nacidos{' '}
          {nacidosPorSeccion.ciclo - 5}, Sala de 3 ≈ nacidos {nacidosPorSeccion.ciclo - 4} (cumple la edad al 30/6 del
          ciclo). Nacidos vivos por domicilio de la madre (DEIS), no del establecimiento. Departamentos sin
          secciones de ese tramo quedan excluidos del gráfico (división inválida), no en 0.
        </p>
      </div>
    </div>
  )
}
