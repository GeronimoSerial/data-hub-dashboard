'use client'

import { useMemo, type CSSProperties } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useThemeMode } from '@/app/providers'
import type {
  BarraVariacionDepartamento,
  FilaOfertaInicialVsCohorte,
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

function GraficoContenedor(props: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="grafico-contenedor" role="img" aria-label={props.etiqueta}>
      <ResponsiveContainer width="100%" height="100%">
        {props.children}
      </ResponsiveContainer>
    </div>
  )
}

// 1. Nacidos vivos — tendencia provincial 2014–2023.
export function GraficoSerieNacimientos(props: { puntos: PuntoSerieAnual[] }) {
  const paleta = usePaleta()
  return (
    <GraficoContenedor etiqueta="Nacidos vivos en Corrientes por año">
      <LineChart data={props.puntos} margin={{ top: 8, right: 12, bottom: 4, left: -4 }}>
        <CartesianGrid vertical={false} stroke={paleta.grilla} strokeWidth={1} />
        <XAxis
          dataKey="anio"
          tick={{ ...CLASE_EJE, fill: paleta.texto }}
          tickLine={false}
          axisLine={{ stroke: paleta.eje, strokeWidth: 1 }}
        />
        <YAxis
          allowDecimals={false}
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
          dot={false}
          activeDot={{ r: 3, strokeWidth: 1, fill: paleta.nacimientos, stroke: paleta.nacimientos }}
          isAnimationActive={false}
        />
      </LineChart>
    </GraficoContenedor>
  )
}

// 2. Variación de nacidos vivos por departamento — barras horizontales divergentes, ordenadas.
export function GraficoVariacionPorDepartamento(props: { barras: BarraVariacionDepartamento[] }) {
  const paleta = usePaleta()
  return (
    <GraficoContenedor etiqueta="Variación de nacidos vivos por departamento">
      <BarChart
        data={props.barras}
        layout="vertical"
        margin={{ top: 8, right: 24, bottom: 4, left: 4 }}
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
          width={110}
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
        <Bar dataKey="pct" name="Variación" isAnimationActive={false}>
          {props.barras.map((barra, i) => (
            <Cell
              key={`${barra.departamento}-${i}`}
              fill={barra.pct == null ? paleta.eje : barra.pct < 0 ? paleta.negativo : paleta.positivo}
            />
          ))}
        </Bar>
      </BarChart>
    </GraficoContenedor>
  )
}

// 3. Oferta de inicial (secciones) vs. nacidos vivos de la cohorte que hoy
// entra a Sala de 3 — barras agrupadas por departamento. `anioCohorte` va en
// el título del panel (ver estadisticas-natalidad-panel.tsx), no acá.
export function GraficoOfertaInicialVsCohorte(props: { filas: FilaOfertaInicialVsCohorte[] }) {
  const paleta = usePaleta()
  return (
    <GraficoContenedor etiqueta="Secciones de nivel inicial vs. nacidos vivos de la cohorte de Sala de 3, por departamento">
      <BarChart data={props.filas} margin={{ top: 8, right: 12, bottom: 24, left: -4 }}>
        <CartesianGrid vertical={false} stroke={paleta.grilla} strokeWidth={1} />
        <XAxis
          dataKey="departamento"
          interval={0}
          angle={-35}
          textAnchor="end"
          height={56}
          tick={{ ...CLASE_EJE, fill: paleta.texto }}
          tickLine={false}
          axisLine={{ stroke: paleta.eje, strokeWidth: 1 }}
        />
        <YAxis
          allowDecimals={false}
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
          cursor={{ fill: paleta.resalte }}
          formatter={formatearValorTooltipMiles}
        />
        <Bar dataKey="nacidosCohorte" name="Nacidos vivos (cohorte)" fill={paleta.nacimientos} isAnimationActive={false} />
        <Bar dataKey="secciones" name="Secciones de Inicial" fill={paleta.inicial} isAnimationActive={false} />
      </BarChart>
    </GraficoContenedor>
  )
}
