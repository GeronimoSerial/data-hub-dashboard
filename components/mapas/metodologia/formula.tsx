import katex from 'katex'
import 'katex/dist/katex.min.css'
import {
  BASE_COMBINACION_V04, HISTORIAL_TOPE_CANTIDAD,
  HISTORIAL_TOPE_DURACION_HORAS, HISTORIAL_TOPE_ACCESO_INTERRUMPIDO,
  TOPE_PROFUNDIDAD_FLUVIAL_V04_M, BASE_ACCESO_POR_NIVEL_AISLAMIENTO,
} from '@/lib/infraestructura/riesgo/motor/config'

const decimal = (x: number) => String(x).replace('.', '{,}')
export const FORMULAS_MOTOR = {
  riesgo: String.raw`R_0=\operatorname{round}\!\left(A\left[${decimal(BASE_COMBINACION_V04)}+${decimal(1 - BASE_COMBINACION_V04)}\frac{V}{100}\right]\right)`,
  historial: String.raw`H=\frac{1}{3}\left[\min\!\left(100,\tfrac{n}{${HISTORIAL_TOPE_CANTIDAD}}\cdot100\right)+\min\!\left(100,\tfrac{h}{${HISTORIAL_TOPE_DURACION_HORAS}}\cdot100\right)+\min\!\left(100,\tfrac{c}{${HISTORIAL_TOPE_ACCESO_INTERRUMPIDO}}\cdot100\right)\right]`,
  susceptibilidad: String.raw`S=\min\!\left(100,\max\!\left(0,\operatorname{round}_2\!\left(100\frac{d_{\mathrm{RP100}}}{${TOPE_PROFUNDIDAD_FLUVIAL_V04_M}}\right)\right)\right)`,
  dimension: String.raw`D=\operatorname{round}_2\!\left(\sum_{i\in P}\operatorname{round}_2\!\left(\frac{w_i}{\sum_{j\in P}w_j}\,x_i\right)\right)`,
  acceso: String.raw`S_a=\min\!\Big(100,\ B(\text{nivel})+\sum_k a_k\Big)\qquad B=(${Object.values(BASE_ACCESO_POR_NIVEL_AISLAMIENTO).join(String.raw`,\,`)})`,
}

// KaTeX renders to static HTML on the server and the client alike, so the
// formulas need no client-side script.
function renderizar(tex: string, displayMode: boolean): string {
  return katex.renderToString(tex, { displayMode, throwOnError: false, output: 'html' })
}

export function Formula({ tex }: { tex: string }) {
  return <div className="metodologia__formula" dangerouslySetInnerHTML={{ __html: renderizar(tex, true) }} />
}

export function Tex({ tex }: { tex: string }) {
  return <span dangerouslySetInnerHTML={{ __html: renderizar(tex, false) }} />
}
