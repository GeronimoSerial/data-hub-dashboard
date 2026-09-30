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

export type MetodoNivelPanel = 'percentiles' | 'umbral_provisorio' | 'sin_dato'

export interface NivelHorizontePanel {
  horizonteHoras: HorizontePeligroPanel
  nivel: NivelPeligroPanel
  base: BaseNivelPanel
  // P1: método que produjo el nivel (mirror de NivelPeligroCelda.metodo).
  // Opcional para no romper a los callers previos a este batch.
  metodo?: MetodoNivelPanel
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
      // Dimensión SEPARADA "riesgo de acceso": espejo del resultado del motor
      // (motor/riesgo-acceso.ts), sin importar sus tipos. NUNCA es parte del
      // estado del edificio. `undefined` = el caller no la pasa y no se
      // renderiza; `null` o un objeto = sí se renderiza la sección "Acceso".
      riesgoAcceso?: {
        nivel: 'bajo' | 'moderado' | 'alto' | null
        confianza: ConfianzaNivel
        explicacion: string
      } | null
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

// P1: rótulo fijo del puente de umbrales provisorios (mismo texto que la
// leyenda del Radar, ver components/mapas/peligro-legend.tsx). "alerta" y el
// SMN quedan deliberadamente afuera acá también.
export const ROTULO_NIVEL_PROVISORIO =
  'Nivel provisorio (umbrales fijos de lluvia) mientras se calcula la climatología de la zona.'

function etiquetaHorizonte(horas: HorizontePeligroPanel): string {
  if (horas === 24) return 'Próximas 24h (riesgo inmediato)'
  if (horas === 72) return 'Próximas 72h (riesgo probable)'
  return '7-10 días (tendencia)'
}

function etiquetaBase(base: BaseNivelPanel): string {
  if (base === 'ensemble') return 'conjunto de pronósticos (ensemble)'
  if (base === 'deterministico') return 'determinístico'
  return 'Sin dato'
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

const ETIQUETAS_NIVEL_RIESGO: Record<string, string> = {
  bajo: 'Bajo', moderado: 'Moderado', alto: 'Alto', muy_alto: 'Muy alto',
}

function etiquetaNivelRiesgo(nivelRiesgo: string): string {
  return ETIQUETAS_NIVEL_RIESGO[nivelRiesgo] ?? nivelRiesgo
}

// Etiqueta de la dimensión "Acceso". `null` es "Sin dato", NUNCA "Bajo".
function etiquetaNivelAcceso(nivel: 'bajo' | 'moderado' | 'alto' | null): string {
  return nivel === null ? 'Sin dato' : ETIQUETAS_NIVEL_RIESGO[nivel]
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
        Probabilidad de lluvia mayor que la del pronóstico base (escenario de control){' '}
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
          Sin dato de peligro para mostrar en este departamento.
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
              {fila.metodo === 'umbral_provisorio' && (
                <span className="risk-explanation-panel__provisorio">
                  {ROTULO_NIVEL_PROVISORIO}
                </span>
              )}
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
    factoresCargando,
    factoresError,
    riesgoAcceso,
  } = props

  return (
    <section className="risk-explanation-panel" data-testid="risk-explanation-panel">
      <h3 className="risk-explanation-panel__titulo">{TITULO_PELIGRO}</h3>
      <p className="risk-explanation-panel__subtitulo" data-testid="risk-explanation-cue">
        Escuela: {cueAnexo}
      </p>

      <p className="risk-explanation-panel__dato" data-testid="risk-explanation-nivel-riesgo">
        Nivel de riesgo pronosticado: {nivelRiesgo === null ? 'Sin dato' : etiquetaNivelRiesgo(nivelRiesgo)}
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

      {riesgoAcceso !== undefined && (
        <section
          className="risk-explanation-panel__acceso"
          data-testid="risk-explanation-acceso"
          aria-label="Riesgo pronosticado de llegar a la escuela"
        >
          <p className="risk-explanation-panel__subtitulo">
            <strong>Acceso</strong>
          </p>
          <p className="risk-explanation-panel__dato" data-testid="risk-explanation-acceso-nivel">
            Riesgo pronosticado de llegar: {etiquetaNivelAcceso(riesgoAcceso?.nivel ?? null)}
          </p>
          {riesgoAcceso === null || riesgoAcceso.nivel === null ? (
            <p className="risk-explanation-panel__dato" data-testid="risk-explanation-acceso-sin-dato">
              Sin dato
            </p>
          ) : (
            <>
              <p className="risk-explanation-panel__dato" data-testid="risk-explanation-acceso-confianza">
                Confianza: {ETIQUETA_CONFIANZA[riesgoAcceso.confianza]}
              </p>
              <p className="risk-explanation-panel__dato" data-testid="risk-explanation-acceso-explicacion">
                {riesgoAcceso.explicacion}
              </p>
            </>
          )}
        </section>
      )}

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
