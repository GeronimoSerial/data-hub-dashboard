'use client'

import { useEffect, useMemo, useState, type JSX } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
import {
  buscarPuestoNacidosPorSeccion,
  buscarPuestoVariacion,
  construirKpis,
  construirNacidosPorSeccionCohorte,
  construirSerieNacimientos,
  construirVariacionNacimientosPorDepartamento,
  fmt,
  fmtPct,
  type FiltroDepartamento,
} from '@/lib/mapas/estadisticas-natalidad'
import type { DatosNatalidad } from '@/lib/mapas/natalidad'
import {
  GraficoNacidosPorSeccion,
  GraficoSerieNacimientos,
  GraficoVariacionPorDepartamento,
} from './estadisticas-natalidad-graficos'

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

  const serieNacimientos = useMemo(
    () => (datos ? construirSerieNacimientos(datos, filtro) : { titulo: '', puntos: [] }),
    [datos, filtro],
  )
  const variacionPorDepartamento = useMemo(
    () => (datos ? construirVariacionNacimientosPorDepartamento(datos) : []),
    [datos],
  )
  const nacidosPorSeccion = useMemo(
    () =>
      datos
        ? construirNacidosPorSeccionCohorte(datos)
        : {
            ciclo: 0,
            aniosCohorte: [],
            filas: [],
            provincia: { clave: '__provincia__', departamento: '', nacidosCohorte: 0, secciones: 0, nacidosPorSeccion: null },
          },
    [datos],
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

  // Item 4: una sola fuente de selección (el select de arriba) resalta en
  // ambos gráficos de comparación y muestra "Departamento: valor · puesto N
  // de 25" debajo de cada uno. Clic en una barra selecciona ese
  // departamento (mismo estado que el select).
  const puestoVariacion = useMemo(
    () => (filtro !== 'Todos' ? buscarPuestoVariacion(variacionPorDepartamento, filtro) : null),
    [variacionPorDepartamento, filtro],
  )
  const puestoNacidosPorSeccion = useMemo(
    () => (filtro !== 'Todos' ? buscarPuestoNacidosPorSeccion(nacidosPorSeccion.filas, filtro) : null),
    [nacidosPorSeccion.filas, filtro],
  )
  const barraSeleccionada = useMemo(
    () => (filtro !== 'Todos' ? variacionPorDepartamento.find((b) => b.clave === filtro) : undefined),
    [variacionPorDepartamento, filtro],
  )
  const filaSeleccionada = useMemo(
    () => (filtro !== 'Todos' ? nacidosPorSeccion.filas.find((f) => f.clave === filtro) : undefined),
    [nacidosPorSeccion.filas, filtro],
  )

  // Item 2: departamentos con 0 secciones en el tramo (Sala 3/4/5 + Plurisala
  // + Sala Integrada) son una división inválida, no un 0 — se excluyen de las
  // barras y se listan en la nota metodológica, en vez de graficarse como
  // "S/D" mezclados con los valores reales.
  const filasNacidosPorSeccionConSecciones = useMemo(
    () => nacidosPorSeccion.filas.filter((f) => f.nacidosPorSeccion != null),
    [nacidosPorSeccion.filas],
  )
  const departamentosSinSecciones = useMemo(
    () => nacidosPorSeccion.filas.filter((f) => f.nacidosPorSeccion == null).map((f) => f.departamento),
    [nacidosPorSeccion.filas],
  )

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
        <h3 className="evolucion-subtitulo">Nacidos vivos — {serieNacimientos.titulo}</h3>
        <p className="evolucion-descripcion">
          Por qué importa: la generación que hoy ocupa las salas de 3 a 5 años nació en estos años — ver cómo bajó
          ayuda a anticipar cuánto va a achicarse la demanda de inicial.
        </p>
        <GraficoSerieNacimientos puntos={serieNacimientos.puntos} />
      </div>

      <div className="evolucion-vista">
        <h3 className="evolucion-subtitulo">Variación de nacidos vivos por departamento</h3>
        <p className="evolucion-descripcion">
          Por qué importa: ubica dónde cayó más fuerte la natalidad, para priorizar dónde revisar primero la oferta
          de inicial y primario.
        </p>
        <GraficoVariacionPorDepartamento
          barras={variacionPorDepartamento}
          seleccionado={filtro}
          onSeleccionar={setFiltro}
        />
        {barraSeleccionada && puestoVariacion && (
          <p className="evolucion-descripcion natalidad-nota-seleccion">
            {barraSeleccionada.departamento}: {fmtPct(barraSeleccionada.pct)} · puesto {puestoVariacion.puesto} de{' '}
            {puestoVariacion.total}
          </p>
        )}
      </div>

      <div className="evolucion-vista">
        <h3 className="evolucion-subtitulo">Nacidos por sección de Sala de 3 a 5 (ciclo {nacidosPorSeccion.ciclo})</h3>
        <p className="evolucion-descripcion">
          Por qué importa: nacidos de las cohortes que hoy ocupan Sala de 3 a 5 (
          {nacidosPorSeccion.aniosCohorte.join(', ')}) sobre las secciones que las reciben (Sala de 3/4/5, Plurisala
          y Sala Integrada) — pocos nacidos por sección sugieren sobreoferta o secciones muy chicas; muchos,
          presión sobre la oferta actual.
        </p>
        <GraficoNacidosPorSeccion
          filas={filasNacidosPorSeccionConSecciones}
          provincia={nacidosPorSeccion.provincia}
          seleccionado={filtro}
          onSeleccionar={setFiltro}
        />
        {filaSeleccionada && (
          <p className="evolucion-descripcion natalidad-nota-seleccion">
            {puestoNacidosPorSeccion
              ? `${filaSeleccionada.departamento}: ${filaSeleccionada.nacidosPorSeccion?.toFixed(1)} · puesto ${puestoNacidosPorSeccion.puesto} de ${puestoNacidosPorSeccion.total}`
              : `${filaSeleccionada.departamento}: sin secciones de ese tramo (excluido del gráfico)`}
          </p>
        )}
        <p className="evolucion-descripcion natalidad-nota-metodologica">
          Alineación de cohorte: Sala de 5 ≈ nacidos {nacidosPorSeccion.ciclo - 6}, Sala de 4 ≈ nacidos{' '}
          {nacidosPorSeccion.ciclo - 5}, Sala de 3 ≈ nacidos {nacidosPorSeccion.ciclo - 4} (cumple la edad al 30/6 del
          ciclo). Nacidos vivos por domicilio de la madre (DEIS), no del establecimiento.
          {departamentosSinSecciones.length > 0
            ? ` Excluidos del gráfico por no tener secciones de ese tramo (división inválida, no 0): ${departamentosSinSecciones.join(', ')}.`
            : ''}
        </p>
      </div>
    </div>
  )
}
