'use client'

import { type JSX } from 'react'

// Panel de explicación del "modo Radar" (E4). Es una vista de sólo lectura que
// recibe TODO ya resuelto por props: no hace fetch propio. La decisión de un
// único componente exportado `RiskExplanationPanel` con una prop discriminada
// `tipo` (en vez de dos componentes sueltos) es deliberada: el dispatch de
// integración importa una sola pieza desde map-infraestructura-page y el
// discriminante deja que TypeScript narrowe los props de cada variante sin
// duplicar el wrapper/encabezado.
//
// Las etiquetas de nivel viven acá porque este panel debe ser autocontenido y
// no acoplarse a archivos que otro dispatch está escribiendo en paralelo.
// Replicamos (no importamos) los textos de `ETIQUETA_NIVEL_PELIGRO` de
// `lib/mapas/peligro-capas.ts` para que el panel y la leyenda del mismo modo
// Radar hablen igual. Si esa fuente cambia, hay que actualizar este mapa A
// MANO; la integración puede migrar a importarla cuando ese archivo esté
// congelado.

export type NivelPeligroPanel = 'verde' | 'amarillo' | 'naranja' | 'rojo' | 'sin_dato'

export type BaseNivelPanel = 'ensemble' | 'deterministico' | 'sin_dato'

export type HorizontePeligroPanel = 24 | 72 | 240

export type ConfianzaNivel = 'baja' | 'media' | 'alta'

export interface NivelHorizontePanel {
  horizonteHoras: HorizontePeligroPanel
  nivel: NivelPeligroPanel
  base: BaseNivelPanel
  precipitacionMm: number | null
  percentilReferencia: string | null
  emitidoEn: string
  validoHasta: string
}

export interface CaudalPanel {
  nivel: string
  percentilActual: number | null
  emitidoEn: string
}

export interface LluviaObservadaPanel {
  acumuladoMm24h: number | null
  acumuladoMm72h: number | null
  observadoEn: string | null
}

export interface FactorRiesgoPanel {
  tipo: string
  fuente: string
  fecha: string
  detalle: string
}

// Tarjeta opcional "Perspectiva 30-90 días" (Open-Meteo Seasonal, batch
// SEASONAL): SIEMPRE una tendencia REGIONAL por departamento, nunca un valor
// por escuela — el rótulo lo deja explícito en el título y en el texto, no
// sólo con un color. `probabilidadSobreNormal` es una simplificación v0 (ver
// providers/seasonal.ts): fracción de miembros perturbados que superan al
// miembro de control, NO un percentil climatológico independiente.
export interface TendenciaEstacionalPanel {
  emisionEn: string
  validoDesde: string
  validoHasta: string
  miembrosTotal: number
  miembrosValidos: number
  probabilidadSobreNormal: number | null
  mediaMm: number | null
}

interface BaseProps {
  // El padre puede pasar `cargando` mientras resuelve los datos. Como el panel
  // no hace fetch, no hay loading implícito: este flag es la única señal.
  cargando?: boolean
}

export type RiskExplanationPanelProps =
  | (BaseProps & {
      tipo: 'departamento'
      departamento: string
      niveles: NivelHorizontePanel[]
      caudal: CaudalPanel | null
      lluviaObservada: LluviaObservadaPanel | null
      // Opcional a propósito, detrás de SEASONAL_ENABLED (E5+): si el llamador
      // no pasa nada, la tarjeta no se muestra (ni cargando ni vacía). `undefined`
      // = capa apagada/no consultada; `null` = consultada, sin datos todavía.
      tendenciaEstacional?: TendenciaEstacionalPanel | null
    })
  | (BaseProps & {
      tipo: 'escuela'
      cueAnexo: string
      nivelRiesgo: string | null
      confianza: ConfianzaNivel
      scoreAmenaza: number | null
      scoreVulnerabilidad: number | null
      // Opcional a propósito: los factores individuales con fuente y fecha
      // viven en `infra_risk_factor` y NO los trae `/api/infraestructura/radar`
      // (ver gap documentado en el resumen). Si no vienen, no se inventan.
      factores?: FactorRiesgoPanel[]
    })

// Etiquetas replicadas de `lib/mapas/peligro-capas.ts` (ver nota de cabecera).
const ETIQUETA_NIVEL_PELIGRO: Record<NivelPeligroPanel, string> = {
  verde: 'Bajo',
  amarillo: 'Medio',
  naranja: 'Alto',
  rojo: 'Muy alto',
  sin_dato: 'Sin dato',
}

const ETIQUETA_CONFIANZA: Record<ConfianzaNivel, string> = {
  baja: 'Baja',
  media: 'Media',
  alta: 'Alta',
}

// Rótulo fijo y no negociable: esto es una estimación propia, nunca un aviso
// oficial. "alerta" y el SMN quedan deliberadamente afuera del copy.
export const TITULO_PELIGRO = 'Peligro meteorológico estimado'

function etiquetaHorizonte(horas: HorizontePeligroPanel): string {
  if (horas === 24) return 'Próximas 24h (riesgo inmediato)'
  if (horas === 72) return 'Próximas 72h (riesgo probable)'
  return '7-10 días (tendencia)'
}

function etiquetaBase(base: BaseNivelPanel): string {
  if (base === 'ensemble') return 'ensemble'
  if (base === 'deterministico') return 'determinístico'
  return 'sin dato de amenaza'
}

/** El color es refuerzo: el nivel siempre se muestra como texto, nunca sólo color. */
function etiquetaNivel(nivel: NivelPeligroPanel): string {
  return ETIQUETA_NIVEL_PELIGRO[nivel]
}

/**
 * Mapea un nivel crudo (p. ej. el `nivel` de caudal, tipado `string`) a su
 * etiqueta cuando coincide con los 5 conocidos; si no, devuelve el valor tal
 * cual en vez de tragárselo.
 */
function etiquetaNivelGenerico(nivel: string): string {
  if (nivel in ETIQUETA_NIVEL_PELIGRO) {
    return ETIQUETA_NIVEL_PELIGRO[nivel as NivelPeligroPanel]
  }
  return nivel
}

function etiquetaNivelRiesgo(nivelRiesgo: string): string {
  if (nivelRiesgo === 'bajo') return 'Bajo'
  if (nivelRiesgo === 'moderado') return 'Moderado'
  if (nivelRiesgo === 'alto') return 'Alto'
  if (nivelRiesgo === 'muy_alto') return 'Muy alto'
  return nivelRiesgo
}

function formatearNumero(valor: number): string {
  return Number.isInteger(valor) ? String(valor) : String(Math.round(valor * 10) / 10)
}

function formatearFecha(iso: string | null): string | null {
  if (!iso) return null
  const fecha = new Date(iso)
  if (Number.isNaN(fecha.getTime())) return null
  return fecha.toLocaleString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Un acumulado ausente NUNCA se muestra como 0: siempre "sin dato". */
function textoAcumulado(valor: number | null): string {
  return valor === null ? 'sin dato' : `${formatearNumero(valor)} mm`
}

/** Porcentaje entero, siempre con signo "%"; null cuando no hay miembros válidos. */
function textoPorcentaje(valor: number | null): string {
  return valor === null ? 'sin dato' : `${Math.round(valor * 100)}%`
}

function TarjetaTendenciaEstacional({
  tendencia,
}: {
  tendencia: TendenciaEstacionalPanel
}): JSX.Element {
  return (
    <section
      className="risk-explanation-panel__seasonal"
      data-testid="risk-explanation-seasonal"
      aria-label="Perspectiva 30-90 días (pronóstico probabilístico regional)"
    >
      <p className="risk-explanation-panel__subtitulo">
        <strong>Perspectiva 30–90 días (pronóstico probabilístico regional)</strong>
      </p>
      <p className="risk-explanation-panel__dato" data-testid="risk-explanation-seasonal-aviso">
        Tendencia REGIONAL estimada, no es un valor por escuela.
      </p>
      <p className="risk-explanation-panel__dato" data-testid="risk-explanation-seasonal-emision">
        Emitido el {formatearFecha(tendencia.emisionEn) ?? tendencia.emisionEn} · válido{' '}
        {formatearFecha(tendencia.validoDesde) ?? tendencia.validoDesde} a{' '}
        {formatearFecha(tendencia.validoHasta) ?? tendencia.validoHasta}
      </p>
      <p className="risk-explanation-panel__dato" data-testid="risk-explanation-seasonal-probabilidad">
        Probabilidad de precipitación por encima del escenario de control:{' '}
        <strong>{textoPorcentaje(tendencia.probabilidadSobreNormal)}</strong> (
        {tendencia.miembrosValidos} de {tendencia.miembrosTotal} miembros del ensamble)
      </p>
    </section>
  )
}

function PanelDepartamento(
  props: Extract<RiskExplanationPanelProps, { tipo: 'departamento' }>,
): JSX.Element {
  const { departamento, niveles, caudal, lluviaObservada, tendenciaEstacional } = props

  return (
    <section className="risk-explanation-panel" data-testid="risk-explanation-panel">
      <h3 className="risk-explanation-panel__titulo">{TITULO_PELIGRO}</h3>
      <p className="risk-explanation-panel__subtitulo" data-testid="risk-explanation-departamento">
        Departamento: {departamento}
      </p>

      {niveles.length === 0 ? (
        <p role="status" data-testid="risk-explanation-sin-datos">
          Sin datos de peligro para mostrar en este departamento.
        </p>
      ) : (
        <ul className="risk-explanation-panel__niveles">
          {niveles.map((fila) => (
            <li
              key={fila.horizonteHoras}
              className="risk-explanation-panel__nivel"
              data-testid={`risk-explanation-horizonte-${fila.horizonteHoras}`}
            >
              <strong>{etiquetaHorizonte(fila.horizonteHoras)}</strong>:{' '}
              <span className={`risk-explanation-panel__nivel--${fila.nivel}`}>
                {etiquetaNivel(fila.nivel)}
              </span>{' '}
              <span className="risk-explanation-panel__base">({etiquetaBase(fila.base)})</span>
              {fila.precipitacionMm !== null && (
                <span className="risk-explanation-panel__detalle">
                  {' '}
                  · Precipitación pronosticada: {formatearNumero(fila.precipitacionMm)} mm
                </span>
              )}
              {fila.percentilReferencia !== null && (
                <span className="risk-explanation-panel__detalle">
                  {' '}
                  · Percentil de referencia: {fila.percentilReferencia}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      <p className="risk-explanation-panel__dato" data-testid="risk-explanation-caudal">
        Caudal ribereño:{' '}
        {caudal === null
          ? 'No disponible'
          : `nivel ${etiquetaNivelGenerico(caudal.nivel)}, percentil ${
              caudal.percentilActual === null ? 'sin dato' : formatearNumero(caudal.percentilActual)
            }`}
      </p>

      <p className="risk-explanation-panel__dato" data-testid="risk-explanation-lluvia-observada">
        Lluvia observada (24 h / 72 h):{' '}
        {lluviaObservada === null
          ? 'No disponible'
          : `24 h ${textoAcumulado(lluviaObservada.acumuladoMm24h)} · 72 h ${textoAcumulado(
              lluviaObservada.acumuladoMm72h,
            )}`}
        {lluviaObservada !== null && formatearFecha(lluviaObservada.observadoEn)
          ? ` · observado el ${formatearFecha(lluviaObservada.observadoEn)}`
          : ''}
      </p>

      {tendenciaEstacional !== undefined && tendenciaEstacional !== null && (
        <TarjetaTendenciaEstacional tendencia={tendenciaEstacional} />
      )}
    </section>
  )
}

function PanelEscuela(
  props: Extract<RiskExplanationPanelProps, { tipo: 'escuela' }>,
): JSX.Element {
  const {
    cueAnexo,
    nivelRiesgo,
    confianza,
    scoreAmenaza,
    scoreVulnerabilidad,
    factores,
  } = props

  return (
    <section className="risk-explanation-panel" data-testid="risk-explanation-panel">
      <h3 className="risk-explanation-panel__titulo">{TITULO_PELIGRO}</h3>
      <p className="risk-explanation-panel__subtitulo" data-testid="risk-explanation-cue">
        Escuela: {cueAnexo}
      </p>

      <p className="risk-explanation-panel__dato" data-testid="risk-explanation-nivel-riesgo">
        Nivel de riesgo: {nivelRiesgo === null ? 'Sin dato' : etiquetaNivelRiesgo(nivelRiesgo)}
      </p>
      <p className="risk-explanation-panel__dato" data-testid="risk-explanation-confianza">
        Confianza: {ETIQUETA_CONFIANZA[confianza]}
      </p>
      <p className="risk-explanation-panel__dato" data-testid="risk-explanation-amenaza">
        Amenaza: {scoreAmenaza === null ? 'sin dato' : formatearNumero(scoreAmenaza)}
      </p>
      <p className="risk-explanation-panel__dato" data-testid="risk-explanation-vulnerabilidad">
        Vulnerabilidad: {scoreVulnerabilidad === null ? 'sin dato' : formatearNumero(scoreVulnerabilidad)}
      </p>

      {factores !== undefined && factores.length > 0 && (
        <div className="risk-explanation-panel__factores" data-testid="risk-explanation-factores">
          <p className="risk-explanation-panel__subtitulo">
            <strong>Factores considerados</strong>
          </p>
          <ul>
            {factores.map((factor, indice) => (
              <li key={`${factor.tipo}-${indice}`}>
                <strong>{factor.tipo}</strong> — {factor.detalle} · fuente: {factor.fuente} ·{' '}
                {factor.fecha}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

/**
 * Explicación del peligro estimado para el modo Radar: variante
 * `tipo="departamento"` (niveles por horizonte, caudal y lluvia observada) o
 * `tipo="escuela"` (nivel de riesgo, confianza, scores y factores opcionales).
 *
 * Todo llega por props; no hay estado ni fetch. El estado de carga se expresa
 * con `cargando`, y una colección vacía en departamento muestra un estado
 * vacío accesible (`role="status"`), nunca una fila inventada.
 */
export function RiskExplanationPanel(props: RiskExplanationPanelProps): JSX.Element {
  if (props.cargando) {
    return (
      <section className="risk-explanation-panel" data-testid="risk-explanation-panel">
        <h3 className="risk-explanation-panel__titulo">{TITULO_PELIGRO}</h3>
        <p role="status" data-testid="risk-explanation-cargando">
          Cargando explicación del peligro estimado…
        </p>
      </section>
    )
  }

  return props.tipo === 'departamento' ? (
    <PanelDepartamento {...props} />
  ) : (
    <PanelEscuela {...props} />
  )
}
