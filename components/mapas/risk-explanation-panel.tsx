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

// Espejo (sin importar) de `FactorRiesgoSnapshot` de
// `lib/infraestructura/use-riesgo-snapshot.ts`, con `tipo` ya resuelto a su
// etiqueta legible por el caller (vía `ETIQUETA_TIPO_FACTOR` de
// `lib/infraestructura/riesgo/etiquetas.ts`): el panel no conoce el enum
// crudo, sólo formatea número/fecha, igual que hace con caudal/lluvia.
export interface FactorRiesgoPanel {
  tipo: string
  fuente: string
  valor: number | null
  unidad: string | null
  contribucion: number
  observadoEn: string | null
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
    })
  | (BaseProps & {
      tipo: 'escuela'
      cueAnexo: string
      nivelRiesgo: string | null
      confianza: ConfianzaNivel
      scoreAmenaza: number | null
      scoreVulnerabilidad: number | null
      // Factores individuales con fuente/valor/contribución/fecha, resueltos
      // desde `infra_risk_factor` vía `/api/infraestructura/riesgo/[snapshotId]`
      // (follow-up 4 del Gate de E4: `/api/infraestructura/radar` no los trae).
      // Semántica de los 3 estados:
      //   - `factores === undefined` (y sin cargando/error): el caller no
      //     pidió factores (comportamiento previo, no se inventa nada).
      //   - `factoresCargando === true`: el caller está pidiéndolos.
      //   - `factoresError` presente: el pedido falló.
      //   - `factores` es un array (incluso vacío): el pedido resolvió; un
      //     array vacío se muestra como "Sin dato" explícito, nunca en
      //     silencio y nunca con la semántica visual de "nivel bajo/verde".
      factores?: FactorRiesgoPanel[]
      factoresCargando?: boolean
      factoresError?: string | null
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

function PanelDepartamento(
  props: Extract<RiskExplanationPanelProps, { tipo: 'departamento' }>,
): JSX.Element {
  const { departamento, niveles, caudal, lluviaObservada } = props

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
    factoresCargando,
    factoresError,
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

      {factoresCargando ? (
        <p role="status" data-testid="risk-explanation-factores-cargando">
          Cargando factores…
        </p>
      ) : factoresError ? (
        <p role="alert" data-testid="risk-explanation-factores-error">
          {factoresError}
        </p>
      ) : factores !== undefined ? (
        factores.length > 0 ? (
          <div className="risk-explanation-panel__factores" data-testid="risk-explanation-factores">
            <p className="risk-explanation-panel__subtitulo">
              <strong>Factores considerados</strong>
            </p>
            <ul>
              {factores.map((factor, indice) => (
                <li key={`${factor.tipo}-${indice}`}>
                  <strong>{factor.tipo}</strong> · fuente: {factor.fuente} · valor:{' '}
                  {factor.valor === null
                    ? 'sin dato'
                    : `${formatearNumero(factor.valor)}${factor.unidad ? ` ${factor.unidad}` : ''}`}{' '}
                  · contribución: {formatearNumero(factor.contribucion)} · observado en:{' '}
                  {formatearFecha(factor.observadoEn) ?? 'sin dato'}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          // Explícito y nunca verde: un array vacío significa "se consultó y
          // no hay factores registrados", distinto de "no se consultó".
          <p data-testid="risk-explanation-factores-sin-dato">
            Factores considerados: Sin dato
          </p>
        )
      ) : null}
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
