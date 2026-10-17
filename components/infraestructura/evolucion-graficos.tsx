'use client'

import { useMemo, type CSSProperties, type ReactNode } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useThemeMode } from '@/app/providers'
// Frontera servidor/cliente: evolucion.ts importa getDb (libsql + node:fs).
// De ese módulo sólo puede salir un TIPO — `import type` se elimina en
// compilación y no arrastra un solo byte de libsql al bundle del navegador;
// importar un valor de ahí rompería `pnpm build` con "the chunking context
// does not support external modules (request: node:fs)".
import type {
  DistribucionMotivo,
  PuntoAlumnosAcumulados,
  PuntoEscuelasServicioCaido,
} from '@/lib/infraestructura/evolucion'

// ── Paleta: leída de las variables CSS, nunca la de Recharts ───────────────
//
// Manual de Marca (app/globals.css:1-16): flat, rellenos sólidos, bordes
// hairline, sin gradientes, sin sombras, color oficial, Barlow. Recharts
// trae defaults que rompen esas reglas (defs con <linearGradient> en Area,
// sombra en el tooltip, tipografía propia y una paleta arbitraria), así que
// acá se fija TODO lo visual de los gráficos de forma explícita.
//
// Ninguna de las cuatro vistas codifica severidad —son escuelas con servicio
// caído, departamentos, motivos y acumulado de alumnos—, así que no hay una
// segunda escala de color en juego. Si alguna la codificara, el color saldría
// de colorSeveridad (lib/infraestructura/severidad.ts), la única escala de
// severidad del producto, mapa incluido.
//
// Los colores NO se escriben a mano en cada chart: se LEEN de las variables
// de :root en el momento del render, así el gráfico sigue el tema
// (claro/oscuro) y no puede desincronizarse del resto de la interfaz. Los
// literales de abajo sólo son el respaldo para el caso sin documento (SSR),
// que con el panel cargado vía `ssr: false` no llega a ocurrir.
type PaletaGraficos = {
  serieServicio: string
  serieMotivos: string
  serieAcumulados: string
  grilla: string
  eje: string
  texto: string
  superficie: string
  resalte: string
}

const PALETA_RESPALDO: PaletaGraficos = {
  serieServicio: '#1f5d9b', // --blue
  serieMotivos: '#f68e13', // --orange
  serieAcumulados: '#58a89a', // --teal
  grilla: '#e0dfde', // --line
  eje: '#e0dfde', // --line
  texto: '#4a4947', // --ink-soft
  superficie: '#ffffff', // --card
  resalte: '#f5f5f4', // --fill
}

function leerVarCSS(nombre: string, respaldo: string): string {
  if (typeof document === 'undefined') return respaldo
  const valor = getComputedStyle(document.documentElement)
    .getPropertyValue(nombre)
    .trim()
  return valor === '' ? respaldo : valor
}

// El parámetro NO se usa para calcular nada: existe para que useMemo tenga
// una dependencia real y vuelva a leer las variables CSS cuando el usuario
// cambia el tema. Sin esa dependencia, react-hooks/exhaustive-deps excluiría
// `mode` y la paleta quedaría congelada en los colores del tema anterior
// (data-theme vive en documentElement, así que getComputedStyle ya devuelve
// los valores correctos del tema activo en el momento del render).
function leerPaleta(_modo: 'light' | 'dark'): PaletaGraficos {
  return {
    serieServicio: leerVarCSS('--blue', PALETA_RESPALDO.serieServicio),
    serieMotivos: leerVarCSS('--orange', PALETA_RESPALDO.serieMotivos),
    serieAcumulados: leerVarCSS('--teal', PALETA_RESPALDO.serieAcumulados),
    grilla: leerVarCSS('--line', PALETA_RESPALDO.grilla),
    eje: leerVarCSS('--line', PALETA_RESPALDO.eje),
    texto: leerVarCSS('--ink-soft', PALETA_RESPALDO.texto),
    superficie: leerVarCSS('--card', PALETA_RESPALDO.superficie),
    resalte: leerVarCSS('--fill', PALETA_RESPALDO.resalte),
  }
}

function usePaletaGraficos(): PaletaGraficos {
  const { mode } = useThemeMode()
  return useMemo(() => leerPaleta(mode), [mode])
}

// Borde hairline y fondo sólido para el tooltip: la sombra y el radio por
// defecto de Recharts son exactamente lo que el manual prohíbe.
function estiloTooltip(paleta: PaletaGraficos): CSSProperties {
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

const estiloEtiquetaTooltip: CSSProperties = {
  fontFamily: 'inherit',
  fontWeight: 600,
  color: 'inherit',
  marginBottom: 2,
}

const estiloDatoTooltip: CSSProperties = {
  fontFamily: 'inherit',
}

// Cortar el texto "YYYY-MM-DD" en vez de pasar por `new Date()`: la fecha ya
// viene resuelta en UTC por el endpoint y reparsearla en el huso del navegador
// puede mostrar el día anterior en la etiqueta del eje.
function fechaCorta(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
}

// Recharts tipa labelFormatter con `label: ReactNode`, no con string: el
// formato corto se aplica sólo cuando el label viene como texto (que es lo
// que hace este eje) y cualquier otra forma se muestra tal cual.
function etiquetaFechaCorta(label: ReactNode): ReactNode {
  return typeof label === 'string' ? fechaCorta(label) : label
}

function formatearMiles(valor: number): string {
  return valor.toLocaleString('es-AR')
}

const CLASE_EJE = { fill: 'var(--ink-soft)', fontSize: 13 }

function GraficoContenedor(props: { etiqueta: string; children: React.ReactNode }) {
  // Altura fija y explícita: ResponsiveContainer mide su contenedor, y un
  // contenedor sin altura medible devuelve 0 y el gráfico queda en blanco.
  return (
    <div className="grafico-contenedor" role="img" aria-label={props.etiqueta}>
      <ResponsiveContainer width="100%" height="100%">
        {props.children}
      </ResponsiveContainer>
    </div>
  )
}

// Vista 1 — escuelas con servicio caído (suspendido o parcial) día por día
// durante el período. El punto de la derecha es hoy.
export function GraficoSerieServicioCaido(props: {
  puntos: PuntoEscuelasServicioCaido[]
}) {
  const paleta = usePaletaGraficos()
  // Los datos son diarios: no existe un valor "entre días". Una curva suave
  // inventaría valores intermedios, así que la línea es ESCALONADA y cambia
  // una sola vez por día (stepAfter). El eje X fija un interval numérico
  // —no `preserveStartEnd`, que respeta los extremos y puede dejar el resto
  // desparejo— para que las marcas queden igualmente espaciadas sin importar
  // desde qué punto arrancó el recorte.
  const intervaloTicks = Math.max(0, Math.ceil(props.puntos.length / 8) - 1)
  return (
    <GraficoContenedor etiqueta="Serie temporal de escuelas con servicio caído">
      <LineChart data={props.puntos} margin={{ top: 8, right: 12, bottom: 4, left: -4 }}>
        <CartesianGrid vertical={false} stroke={paleta.grilla} strokeWidth={1} />
        <XAxis
          dataKey="fecha"
          tickFormatter={fechaCorta}
          interval={intervaloTicks}
          tick={{ ...CLASE_EJE, fill: paleta.texto }}
          tickLine={false}
          axisLine={{ stroke: paleta.eje, strokeWidth: 1 }}
        />
        <YAxis
          allowDecimals={false}
          width={36}
          tickFormatter={formatearMiles}
          tick={{ ...CLASE_EJE, fill: paleta.texto }}
          tickLine={false}
          axisLine={{ stroke: paleta.eje, strokeWidth: 1 }}
        />
        <Tooltip
          contentStyle={estiloTooltip(paleta)}
          labelStyle={estiloEtiquetaTooltip}
          itemStyle={estiloDatoTooltip}
          cursor={{ stroke: paleta.grilla, strokeWidth: 1 }}
          labelFormatter={etiquetaFechaCorta}
          formatter={(valor) => [`${formatearMiles(Number(valor))} escuelas`, null]}
        />
        <Line
          type="stepAfter"
          dataKey="escuelas"
          name="Escuelas con servicio caído"
          stroke={paleta.serieServicio}
          strokeWidth={1}
          dot={(punto) => punto.index === punto.points.length - 1 ? (
            <circle cx={punto.cx} cy={punto.cy} r={4} fill={paleta.serieServicio} stroke={paleta.serieServicio} />
          ) : null}
          activeDot={{ r: 3, strokeWidth: 1, fill: paleta.serieServicio, stroke: paleta.serieServicio }}
          isAnimationActive={false}
        />
      </LineChart>
    </GraficoContenedor>
  )
}

// Vista 3 — motivos, barras HORIZONTALES: los nombres de motivo son frases
// ("Otro problema en el establecimiento") y en un eje X se pisarían entre sí;
// en el eje Y cada uno tiene su fila y se lee completo.
export function GraficoMotivos(props: { motivos: DistribucionMotivo[] }) {
  const paleta = usePaletaGraficos()
  return (
    <GraficoContenedor etiqueta="Distribución de afectaciones vigentes por motivo">
      <BarChart
        data={props.motivos}
        layout="vertical"
        margin={{ top: 8, right: 16, bottom: 4, left: 4 }}
      >
        <CartesianGrid horizontal={false} stroke={paleta.grilla} strokeWidth={1} />
        <XAxis
          type="number"
          allowDecimals={false}
          tick={{ ...CLASE_EJE, fill: paleta.texto }}
          tickLine={false}
          axisLine={{ stroke: paleta.eje, strokeWidth: 1 }}
        />
        <YAxis
          type="category"
          dataKey="motivo"
          interval={0}
          width={200}
          tick={{ ...CLASE_EJE, fill: paleta.texto }}
          tickLine={false}
          axisLine={{ stroke: paleta.eje, strokeWidth: 1 }}
        />
        <Tooltip
          contentStyle={estiloTooltip(paleta)}
          labelStyle={estiloEtiquetaTooltip}
          itemStyle={estiloDatoTooltip}
          cursor={{ fill: paleta.resalte }}
        />
        <Bar
          dataKey="afectacionesVigentes"
          name="Afectaciones vigentes"
          fill={paleta.serieMotivos}
          isAnimationActive={false}
        />
      </BarChart>
    </GraficoContenedor>
  )
}

// Vista 4 — alumnos acumulados. El relleno es SÓLIDO con una opacidad fija:
// nada de <LinearGradient> (el manual prohíbe degradados) y nada de sombra.
export function GraficoAlumnosAcumulados(props: {
  puntos: PuntoAlumnosAcumulados[]
}) {
  const paleta = usePaletaGraficos()
  return (
    <GraficoContenedor etiqueta="Alumnos acumulados alcanzados a lo largo del período">
      <AreaChart data={props.puntos} margin={{ top: 8, right: 12, bottom: 4, left: -4 }}>
        <CartesianGrid vertical={false} stroke={paleta.grilla} strokeWidth={1} />
        <XAxis
          dataKey="fecha"
          tickFormatter={fechaCorta}
          minTickGap={28}
          interval="preserveStartEnd"
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
          labelStyle={estiloEtiquetaTooltip}
          itemStyle={estiloDatoTooltip}
          cursor={{ stroke: paleta.grilla, strokeWidth: 1 }}
          labelFormatter={etiquetaFechaCorta}
        />
        <Area
          type="monotone"
          dataKey="alumnosAcumulados"
          name="Alumnos acumulados"
          stroke={paleta.serieAcumulados}
          strokeWidth={1}
          fill={paleta.serieAcumulados}
          fillOpacity={0.18}
          dot={(punto) => punto.index === punto.points.length - 1 ? (
            <circle cx={punto.cx} cy={punto.cy} r={4} fill={paleta.serieAcumulados} stroke={paleta.serieAcumulados} />
          ) : null}
          activeDot={{ r: 3, strokeWidth: 1, fill: paleta.serieAcumulados, stroke: paleta.serieAcumulados }}
          isAnimationActive={false}
        />
      </AreaChart>
    </GraficoContenedor>
  )
}
