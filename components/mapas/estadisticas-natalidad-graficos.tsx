'use client'

import { useMemo, type CSSProperties } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Label,
  LabelList,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useThemeMode } from '@/app/providers'
import type {
  BarraVariacionDepartamento,
  FilaNacidosPorSeccion,
  PuntoSerieAnual,
} from '@/lib/mapas/estadisticas-natalidad'

// ── Paleta ───────────────────────────────────────────────────────────────
//
// Mismo enfoque que components/infraestructura/evolucion-graficos.tsx (Manual
// de Marca: flat, sin gradientes, sin sombras, colores oficiales, Barlow):
// los colores se LEEN de las variables CSS de :root en el momento del
// render, nunca hardcodeados, así el gráfico sigue el tema claro/oscuro.
//
// COLOR_INICIAL usa el mismo teal que el mapa (map-natalidad-page.tsx,
// COLOR_INICIAL = '#0f766e' ~ --teal) para que "inicial" se lea igual en el
// mapa y en los gráficos. La variación (positiva/negativa) usa --ok/--danger
// (verde/rojo ya reservados en el Manual de Marca para ese propósito, nunca
// para "serie 4").
type Paleta = {
  nacimientos: string
  positivo: string
  negativo: string
  inicial: string
  grilla: string
  eje: string
  texto: string
  superficie: string
  resalte: string
}

const PALETA_RESPALDO: Paleta = {
  nacimientos: '#1f5d9b', // --blue
  positivo: '#356f23', // --green-dark (--ok)
  negativo: '#ea2f09', // --red-dark (--danger-mark)
  inicial: '#008275', // --teal-dark
  grilla: '#e0dfde', // --line
  eje: '#e0dfde',
  texto: '#5f5e5c', // --ink-soft
  superficie: '#ffffff', // --card
  resalte: '#f5f5f4', // --fill
}

function leerVarCSS(nombre: string, respaldo: string): string {
  if (typeof document === 'undefined') return respaldo
  const valor = getComputedStyle(document.documentElement).getPropertyValue(nombre).trim()
  return valor === '' ? respaldo : valor
}

function leerPaleta(_modo: 'light' | 'dark'): Paleta {
  return {
    nacimientos: leerVarCSS('--blue', PALETA_RESPALDO.nacimientos),
    positivo: leerVarCSS('--green-dark', PALETA_RESPALDO.positivo),
    negativo: leerVarCSS('--red-dark', PALETA_RESPALDO.negativo),
    inicial: leerVarCSS('--teal-dark', PALETA_RESPALDO.inicial),
    grilla: leerVarCSS('--line', PALETA_RESPALDO.grilla),
    eje: leerVarCSS('--line', PALETA_RESPALDO.eje),
    texto: leerVarCSS('--ink-soft', PALETA_RESPALDO.texto),
    superficie: leerVarCSS('--card', PALETA_RESPALDO.superficie),
    resalte: leerVarCSS('--fill', PALETA_RESPALDO.resalte),
  }
}

function usePaleta(): Paleta {
  const { mode } = useThemeMode()
  return useMemo(() => leerPaleta(mode), [mode])
}

function estiloTooltip(paleta: Paleta): CSSProperties {
  return {
    background: paleta.superficie,
    border: `1px solid ${paleta.grilla}`,
    borderRadius: 2,
    boxShadow: 'none',
    fontFamily: 'inherit',
    fontSize: 'var(--t-small)',
    color: 'inherit',
    padding: '0.4rem 0.6rem',
  }
}

const ESTILO_ETIQUETA_TOOLTIP: CSSProperties = { fontFamily: 'inherit', fontWeight: 600, color: 'inherit', marginBottom: 2 }
const ESTILO_DATO_TOOLTIP: CSSProperties = { fontFamily: 'inherit' }
const CLASE_EJE = { fill: 'var(--ink-soft)', fontSize: 11 }

function formatearMiles(valor: number): string {
  return valor.toLocaleString('es-AR')
}

// Recharts tipa el formatter del Tooltip con `ValueType = number | string |
// Array<number|string> | undefined` (nunca sólo `number`) — estos wrappers
// aceptan ese tipo ancho y hacen la conversión puntual que necesita cada
// gráfico, sin repetir un cast en cada `<Tooltip formatter=...>`.
function formatearValorTooltipMiles(valor: unknown): string {
  return typeof valor === 'number' ? formatearMiles(valor) : String(valor)
}

function formatearValorTooltipPct(valor: unknown): string {
  return typeof valor === 'number' ? `${valor.toFixed(1)}%` : 'Sin base comparable'
}

function GraficoContenedor(props: { etiqueta: string; alto?: number; children: React.ReactNode }) {
  return (
    <div
      className="grafico-contenedor"
      style={props.alto != null ? { height: `${props.alto}px` } : undefined}
      role="img"
      aria-label={props.etiqueta}
    >
      <ResponsiveContainer width="100%" height="100%">
        {props.children}
      </ResponsiveContainer>
    </div>
  )
}

function etiquetaValorMiles(
  x: number | string | undefined,
  y: number | string | undefined,
  value: number | string | null | undefined,
): React.ReactElement | undefined {
  if (x == null || y == null || value == null) return undefined
  return (
    <text x={x} y={Number(y) - 6} textAnchor="middle" fontSize={11} fill="currentColor">
      {typeof value === 'number' ? formatearMiles(value) : value}
    </text>
  )
}

// 1. Nacidos vivos — tendencia provincial 2014–2023.
//
// Bug corregido (2026-09-25): la caída sólo se veía si el contenedor tenía
// alto suficiente — el genérico de 17rem la aplanaba demasiado. Se sube a
// 20rem (sólo para este gráfico, via el `alto` opcional de
// GraficoContenedor) y se agregan las etiquetas de valor en el primer y
// último punto (2014/2023), que son los que importan para leer la caída sin
// pasar el mouse. El eje sigue arrancando en 0 (honesto: no exagerar la
// pendiente cortando el eje).
export function GraficoSerieNacimientos(props: { puntos: PuntoSerieAnual[] }) {
  const paleta = usePaleta()
  const primero = props.puntos[0]
  const ultimo = props.puntos[props.puntos.length - 1]
  return (
    <GraficoContenedor etiqueta="Nacidos vivos en Corrientes por año" alto={320}>
      <LineChart data={props.puntos} margin={{ top: 20, right: 24, bottom: 4, left: -4 }}>
        <CartesianGrid vertical={false} stroke={paleta.grilla} strokeWidth={1} />
        <XAxis
          dataKey="anio"
          tick={{ ...CLASE_EJE, fill: paleta.texto }}
          tickLine={false}
          axisLine={{ stroke: paleta.eje, strokeWidth: 1 }}
        />
        <YAxis
          allowDecimals={false}
          domain={[0, 'auto']}
          width={44}
          tickFormatter={formatearMiles}
          tick={{ ...CLASE_EJE, fill: paleta.texto }}
          tickLine={false}
          axisLine={{ stroke: paleta.eje, strokeWidth: 1 }}
        />
        <Tooltip
          contentStyle={estiloTooltip(paleta)}
          labelStyle={ESTILO_ETIQUETA_TOOLTIP}
          itemStyle={ESTILO_DATO_TOOLTIP}
          cursor={{ stroke: paleta.grilla, strokeWidth: 1 }}
          formatter={formatearValorTooltipMiles}
        />
        <Line
          type="monotone"
          dataKey="valor"
          name="Nacidos vivos"
          stroke={paleta.nacimientos}
          strokeWidth={2}
          dot={(dotProps: { cx?: number; cy?: number; payload?: PuntoSerieAnual }) => {
            const destacado =
              dotProps.payload != null && (dotProps.payload.anio === primero?.anio || dotProps.payload.anio === ultimo?.anio)
            return destacado ? (
              <circle
                key={`punto-${dotProps.payload?.anio}`}
                cx={dotProps.cx}
                cy={dotProps.cy}
                r={3}
                fill={paleta.nacimientos}
                stroke={paleta.superficie}
                strokeWidth={1}
              />
            ) : (
              <g key={`punto-${dotProps.payload?.anio}`} />
            )
          }}
          activeDot={{ r: 3, strokeWidth: 1, fill: paleta.nacimientos, stroke: paleta.nacimientos }}
          isAnimationActive={false}
          label={(labelProps) => {
            if (labelProps.index !== 0 && labelProps.index !== props.puntos.length - 1) return undefined
            const valor = typeof labelProps.value === 'number' ? labelProps.value : undefined
            return etiquetaValorMiles(labelProps.x, labelProps.y, valor)
          }}
        />
      </LineChart>
    </GraficoContenedor>
  )
}

// 2. Variación de nacidos vivos por departamento — barras horizontales divergentes, ordenadas.
//
// Bug corregido (2026-09-25): 25 filas apretadas en 17rem hacían que los
// nombres de departamento se superpusieran. Alto dinámico (24px por fila +
// márgenes, "dale a cada fila el alto que necesita" en vez de un contenedor
// fijo) y `<LabelList>` con el valor al final de cada barra (p. ej. "-47%"),
// para no depender del tooltip para leer el número.
const ALTO_FILA_VARIACION = 24
const MARGEN_VARIACION = 40

// Item 4 (feedback 2026-09-25): el departamento seleccionado se resalta (color
// pleno + borde de acento) mientras el resto se atenúa (opacidad reducida),
// en vez de recortar las barras — así el gráfico sigue sirviendo para
// comparar entre departamentos aunque haya uno elegido.
const OPACIDAD_ATENUADA = 0.35

export function GraficoVariacionPorDepartamento(props: {
  barras: BarraVariacionDepartamento[]
  seleccionado?: string
  onSeleccionar?: (clave: string) => void
}) {
  const paleta = usePaleta()
  const alto = props.barras.length * ALTO_FILA_VARIACION + MARGEN_VARIACION
  const hayResaltado = props.seleccionado != null && props.seleccionado !== 'Todos'
  return (
    <GraficoContenedor etiqueta="Variación de nacidos vivos por departamento" alto={alto}>
      <BarChart
        data={props.barras}
        layout="vertical"
        barCategoryGap={4}
        margin={{ top: 8, right: 44, bottom: 4, left: 4 }}
      >
        <CartesianGrid horizontal={false} stroke={paleta.grilla} strokeWidth={1} />
        <XAxis
          type="number"
          tickFormatter={(v: number) => `${v}%`}
          tick={{ ...CLASE_EJE, fill: paleta.texto }}
          tickLine={false}
          axisLine={{ stroke: paleta.eje, strokeWidth: 1 }}
        />
        <YAxis
          type="category"
          dataKey="departamento"
          interval={0}
          width={130}
          tick={{ ...CLASE_EJE, fill: paleta.texto }}
          tickLine={false}
          axisLine={{ stroke: paleta.eje, strokeWidth: 1 }}
        />
        <Tooltip
          contentStyle={estiloTooltip(paleta)}
          labelStyle={ESTILO_ETIQUETA_TOOLTIP}
          itemStyle={ESTILO_DATO_TOOLTIP}
          cursor={{ fill: paleta.resalte }}
          formatter={formatearValorTooltipPct}
        />
        <Bar
          dataKey="pct"
          name="Variación"
          isAnimationActive={false}
          onClick={(data) => {
            const barra = data.payload as BarraVariacionDepartamento | undefined
            if (barra) props.onSeleccionar?.(barra.clave)
          }}
          cursor={props.onSeleccionar ? 'pointer' : undefined}
        >
          {props.barras.map((barra, i) => {
            const esSeleccionado = barra.clave === props.seleccionado
            const colorBase = barra.pct == null ? paleta.eje : barra.pct < 0 ? paleta.negativo : paleta.positivo
            return (
              <Cell
                key={`${barra.departamento}-${i}`}
                fill={colorBase}
                fillOpacity={hayResaltado && !esSeleccionado ? OPACIDAD_ATENUADA : 1}
                stroke={esSeleccionado ? colorBase : undefined}
                strokeWidth={esSeleccionado ? 1 : 0}
              />
            )
          })}
          <LabelList
            dataKey="pct"
            position="right"
            content={(labelProps) => {
              const { x, y, width, height, value, index } = labelProps
              if (x == null || y == null || value == null || index == null) return undefined
              const barra = props.barras[Number(index)]
              const esSeleccionado = barra?.clave === props.seleccionado
              const texto =
                typeof value === 'number' ? `${value > 0 ? '+' : ''}${value.toFixed(1)}%` : 'S/D'
              const cx = Number(x) + Number(width ?? 0) + 4
              const cy = Number(y) + Number(height ?? 0) / 2 + 3
              return (
                <text
                  x={cx}
                  y={cy}
                  fontSize={11}
                  fontWeight={esSeleccionado ? 700 : 400}
                  fill={hayResaltado && !esSeleccionado ? paleta.texto : 'currentColor'}
                  opacity={hayResaltado && !esSeleccionado ? OPACIDAD_ATENUADA + 0.3 : 1}
                >
                  {texto}
                </text>
              )
            }}
          />
        </Bar>
      </BarChart>
    </GraficoContenedor>
  )
}

// 3. Nacidos por sección de Sala de 3 a 5 (ciclo 2026) — barras horizontales
// ordenadas, valor provincial como línea de referencia. Reemplaza el
// gráfico anterior de dos ejes (secciones vs. nacidos): ver el comentario en
// lib/mapas/estadisticas-natalidad.ts (construirNacidosPorSeccionCohorte).
export function GraficoNacidosPorSeccion(props: {
  filas: FilaNacidosPorSeccion[]
  provincia: FilaNacidosPorSeccion
  seleccionado?: string
  onSeleccionar?: (clave: string) => void
}) {
  const paleta = usePaleta()
  const alto = props.filas.length * ALTO_FILA_VARIACION + MARGEN_VARIACION
  const hayResaltado = props.seleccionado != null && props.seleccionado !== 'Todos'
  return (
    <GraficoContenedor etiqueta="Nacidos por sección de Sala de 3 a 5, por departamento" alto={alto}>
      <BarChart
        data={props.filas}
        layout="vertical"
        barCategoryGap={4}
        margin={{ top: 8, right: 44, bottom: 4, left: 4 }}
      >
        <CartesianGrid horizontal={false} stroke={paleta.grilla} strokeWidth={1} />
        <XAxis
          type="number"
          tick={{ ...CLASE_EJE, fill: paleta.texto }}
          tickLine={false}
          axisLine={{ stroke: paleta.eje, strokeWidth: 1 }}
        />
        <YAxis
          type="category"
          dataKey="departamento"
          interval={0}
          width={130}
          tick={{ ...CLASE_EJE, fill: paleta.texto }}
          tickLine={false}
          axisLine={{ stroke: paleta.eje, strokeWidth: 1 }}
        />
        <Tooltip
          contentStyle={estiloTooltip(paleta)}
          labelStyle={ESTILO_ETIQUETA_TOOLTIP}
          itemStyle={ESTILO_DATO_TOOLTIP}
          cursor={{ fill: paleta.resalte }}
          formatter={(v: unknown) => (typeof v === 'number' ? v.toFixed(1) : 'Sin secciones (excluido)')}
        />
        <Bar
          dataKey="nacidosPorSeccion"
          name="Nacidos por sección"
          isAnimationActive={false}
          onClick={(data) => {
            const fila = data.payload as FilaNacidosPorSeccion | undefined
            if (fila) props.onSeleccionar?.(fila.clave)
          }}
          cursor={props.onSeleccionar ? 'pointer' : undefined}
        >
          {props.filas.map((f, i) => {
            const esSeleccionado = f.clave === props.seleccionado
            return (
              <Cell
                key={`${f.clave}-${i}`}
                fill={paleta.inicial}
                fillOpacity={hayResaltado && !esSeleccionado ? OPACIDAD_ATENUADA : 1}
                stroke={esSeleccionado ? paleta.inicial : undefined}
                strokeWidth={esSeleccionado ? 1 : 0}
              />
            )
          })}
          <LabelList
            dataKey="nacidosPorSeccion"
            position="right"
            content={(labelProps) => {
              const { x, y, width, height, value, index } = labelProps
              if (x == null || y == null || value == null || index == null) return undefined
              const fila = props.filas[Number(index)]
              const esSeleccionado = fila?.clave === props.seleccionado
              const texto = typeof value === 'number' ? value.toFixed(1) : 'S/D'
              const cx = Number(x) + Number(width ?? 0) + 4
              const cy = Number(y) + Number(height ?? 0) / 2 + 3
              return (
                <text
                  x={cx}
                  y={cy}
                  fontSize={11}
                  fontWeight={esSeleccionado ? 700 : 400}
                  fill={hayResaltado && !esSeleccionado ? paleta.texto : 'currentColor'}
                  opacity={hayResaltado && !esSeleccionado ? OPACIDAD_ATENUADA + 0.3 : 1}
                >
                  {texto}
                </text>
              )
            }}
          />
        </Bar>
        {props.provincia.nacidosPorSeccion != null && (
          <ReferenceLine x={props.provincia.nacidosPorSeccion} stroke={paleta.negativo} strokeDasharray="4 3">
            <Label
              value={`Provincia: ${props.provincia.nacidosPorSeccion.toFixed(1)}`}
              position="insideTopRight"
              fill={paleta.texto}
              fontSize={11}
            />
          </ReferenceLine>
        )}
      </BarChart>
    </GraficoContenedor>
  )
}
