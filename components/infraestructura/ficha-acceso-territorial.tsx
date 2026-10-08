import type { JSX } from 'react'
import { Button } from '@/components/ui/button'
import { MOSTRAR_AGUA_ESTIMADA } from '@/lib/mapas/flags'
import {
  DESCRIPCIONES_AISLAMIENTO,
  ETIQUETAS_AISLAMIENTO,
  ETIQUETAS_INUNDACION,
  TEXTOS_ACCESOS,
  claseInundacion,
  textoMotivoSinRuta,
  textoConPeriodo,
  type ClaseInundacion,
} from '@/lib/mapas/accesos-capas'
import type {
  AislamientoEscuelaMapa,
  GeometriaAccesoRespuesta,
  NivelAislamientoMapa,
  TerritorioMapa,
} from '@/lib/infraestructura/territorio-mapa'
import type { ExposicionRutaRespuesta } from '@/lib/infraestructura/exposicion-ruta'

// Sección de sólo lectura: contexto de acceso territorial ESTÁTICO de una
// escuela (aislamiento OSM + susceptibilidad physrisk + estado del recorrido
// dibujado). Deliberadamente NO hace fetch: el padre resuelve `territorio` y
// `geometria` (con sus loading/error) y los pasa por props. Ningún dato acá es
// un pronóstico ni el estado confirmado del edificio: son capas de contexto.
//
// La ficha es CORTA a propósito: tres líneas (dificultad del camino, cruces de
// agua, inundación histórica EN la escuela) y la acción "Ver recorrido". La
// escala 0-3, la metodología, el período de retorno y las fuentes viven en UN
// `<details>` secundario: son texto de referencia y compiten por altura con lo
// que el usuario vino a ver.
export interface FichaAccesoTerritorialProps {
  territorio: TerritorioMapa | null
  territorioLoading: boolean
  territorioError: string | null
  cueAnexo: string
  geometria: GeometriaAccesoRespuesta | null
  geometriaLoading: boolean
  geometriaError: string | null
  exposicion?: ExposicionRutaRespuesta | null
  exposicionLoading?: boolean
  exposicionError?: string | null
  // Encuadrar el recorrido en el mapa. Opcional a propósito: sin esta prop la
  // ficha no ofrece la acción, en vez de ofrecer un botón que nadie atiende.
  onVerRutaEnMapa?: () => void
}

const ID_TITULO = 'ficha-acceso-territorial-titulo'

// Profundidad en metros con dos decimales y coma decimal (es-AR): 1.234 -> '1,23'.
function formatearMetros(valor: number): string {
  return valor.toFixed(2).replace('.', ',')
}

// Motivos de recorrido no disponible. Son continuaciones en minúscula de
// "Sin recorrido para mostrar:", así que se leen como una sola frase. Un
// motivo nuevo cae al texto genérico en vez de tragarse el dato. La fuente de
// verdad es la leyenda del mapa; acá va en lenguaje llano porque la ficha la
// va a leer alguien que no sabe de grafos ni de OSM.
// Línea visible de dificultad: sólo el nombre del nivel, en minúscula porque ya
// va después de "dificultad". 'sin_datos_red' usa su propio nombre ("no
// calculable"): no hay índice que mostrar, y NO es un nivel 0.
function textoDificultad(nivel: NivelAislamientoMapa): string {
  if (nivel === 'sin_datos_red') return 'Llegar por camino: no calculable'
  return `Llegar por camino: dificultad ${ETIQUETAS_AISLAMIENTO[nivel].toLowerCase()}`
}

// Detalle: acá sí aparece la escala, porque sin ella "dificultad alta" no dice
// cómo se calculó.
function textoIndiceDificultad(nivel: NivelAislamientoMapa): string {
  if (nivel === 'sin_datos_red') return 'Índice de dificultad: no calculable'
  return `Índice de dificultad: ${nivel} de 3`
}

// Línea visible de cruces. "sin puente registrado" es lo que dice el dato: OSM
// no tiene tag de puente en ese punto, lo que NO confirma que el puente falte
// (también cuenta el vado). Con cero cruces no se inventa un desglose en cero.
function textoCruces(fila: AislamientoEscuelaMapa | undefined): string {
  if (fila === undefined || fila.cruces === null) return 'Cruces de agua: sin dato'
  if (fila.cruces === 0) return 'Sin cruces de agua en el camino'
  if (fila.sinPuente === 0) return `Cruces de agua en el camino: ${fila.cruces} (todos con puente registrado)`
  return `Cruces de agua en el camino: ${fila.cruces} (${fila.sinPuente ?? 0} sin puente registrado)`
}

// Estilo del tag de clase de río, reutilizando los badges de globals.css.
const BADGE_CLASE_INUNDACION: Record<ClaseInundacion, string> = {
  alto: 'badge--danger',
  medio: 'badge--warning',
  bajo: 'badge--neutral',
  sin_riesgo: 'badge--success',
  sin_dato: 'badge--neutral',
}

function textoExposicionRuta(exposicion: ExposicionRutaRespuesta): string {
  if (!exposicion.disponible) return 'Agua estimada junto al camino: sin dato.'
  const cobertura = exposicion.resumen.cobertura < 1
    ? ` Dato en ${Math.round(exposicion.resumen.cobertura * 100)} % de la ruta.`
    : ''
  if (exposicion.estado === 'con_profundidad') {
    return `Agua estimada junto al camino: ${exposicion.resumen.celdasConProfundidad} zonas de ~1 km (hasta ${formatearMetros(exposicion.resumen.profundidadMaxM ?? 0)} m).${cobertura}`
  }
  return `Agua estimada junto al camino: ninguna según el modelo.${cobertura}`
}

// Resumen de lo que el cálculo realmente dibujó. Sólo con geometría
// disponible: nunca se resume un recorrido que no existe.
function textoResumenRuta(geometria: GeometriaAccesoRespuesta): string {
  const resumen = geometria.resumen
  return (
    `Cruces en el camino dibujado: ${resumen?.puente ?? 0} con puente · ` +
    `${resumen?.vado ?? 0} vado · ${resumen?.sinEvidencia ?? 0} sin puente registrado.`
  )
}

function textoAlternativa(alternativaSinCruce: boolean | null): string {
  if (alternativaSinCruce === null) return 'Desconocida'
  return alternativaSinCruce ? 'Sí' : 'No'
}

// Significado del nivel DE ESTA escuela (nombre + su regla), no el de los cinco
// niveles: la ficha es de una escuela, no un manual del índice.
function significadoNivel(nivel: NivelAislamientoMapa): string {
  const descripcion = DESCRIPCIONES_AISLAMIENTO[nivel]
  return `${descripcion.nombre}: ${descripcion.detalle}`
}

// El valor almacenado de `licencia` puede ya incluir la atribución OSM. Si es
// así se usa tal cual para no repetir "© OpenStreetMap contributors" dos veces;
// si no, se compone con la atribución estándar.
function textoFuenteOsm(
  fuente: string,
  atribucion: string,
  licencia: string,
  fechaExtractoOsm: string,
  versionJob: string,
): string {
  const credito = licencia.includes('OpenStreetMap contributors')
    ? licencia
    : `${atribucion}, ${licencia}`
  return `Fuente: ${fuente} (${credito}) · extracto ${fechaExtractoOsm} · job v${versionJob}`
}

export function FichaAccesoTerritorial({
  territorio,
  territorioLoading,
  territorioError,
  cueAnexo,
  geometria,
  geometriaLoading,
  geometriaError,
  exposicion,
  exposicionLoading = false,
  exposicionError = null,
  onVerRutaEnMapa,
}: FichaAccesoTerritorialProps): JSX.Element {
  const aislamiento = territorio?.aislamiento ?? null
  const filaAislamiento = aislamiento?.escuelas[cueAnexo]
  const susceptibilidad = territorio?.susceptibilidad ?? null
  const filaSusceptibilidad = susceptibilidad?.escuelas[cueAnexo]
  const profundidad = MOSTRAR_AGUA_ESTIMADA ? filaSusceptibilidad?.inundacionFluvialM ?? null : null
  // El 0 m es "el modelo no estima agua en ese punto", no "se inundó 0 m": se
  // cuenta como ausencia de agua estimada, nunca como nivel bajo.
  const sinAguaEstimada = profundidad !== null && !(profundidad > 0)
  // Sin ninguna de las dos capas no hay nada que detallar: alcanza con decir
  // que no hay datos importados.
  const hayDetalle = aislamiento !== null || (MOSTRAR_AGUA_ESTIMADA && susceptibilidad !== null) || (MOSTRAR_AGUA_ESTIMADA && exposicion != null)

  return (
    <section
      className="ficha-territorial ficha-acceso-territorial"
      aria-labelledby={ID_TITULO}
      data-testid="ficha-acceso-territorial"
    >
      <p className="ficha-territorial__titulo" id={ID_TITULO}>
        <strong>{MOSTRAR_AGUA_ESTIMADA ? 'Acceso por camino y agua estimada' : 'Acceso por camino'}</strong>
      </p>

      {territorioLoading ? (
        <p
          className="ficha-territorial__estado"
          role="status"
          data-testid="ficha-acceso-territorial-cargando"
        >
          Cargando datos territoriales…
        </p>
      ) : territorioError !== null ? (
        <p
          className="ficha-territorial__error"
          role="alert"
          data-testid="ficha-acceso-territorial-error"
        >
          {territorioError}
        </p>
      ) : (
        <>
          {/* Las tres líneas de siempre. Fila ausente = sin cobertura, NUNCA
              nivel 0 ni profundidad 0: se dice "sin dato" y se sigue. */}
          <div className="ficha-territorial__dato" data-testid="ficha-acceso-aislamiento">
            {aislamiento === null ? (
              <p data-testid="ficha-acceso-aislamiento-sin-datos">
                Sin datos de caminos cargados.
              </p>
            ) : filaAislamiento === undefined ? (
              <p data-testid="ficha-acceso-aislamiento-sin-cobertura">
                Llegar por camino: sin dato
              </p>
            ) : (
              <p data-testid="ficha-acceso-aislamiento-indice">
                {textoDificultad(filaAislamiento.nivel)}
              </p>
            )}
            {aislamiento !== null && (
              <p data-testid="ficha-acceso-aislamiento-cruces">
                {textoCruces(filaAislamiento)}
              </p>
            )}
          </div>

          {/* Bloque de inundación aislado: sólo tags. Clase de río (sin fila o
              sin clase = "Sin dato") y, si aplica, "Junto a laguna". */}
          {MOSTRAR_AGUA_ESTIMADA && <div className="ficha-territorial__dato" data-testid="ficha-acceso-susceptibilidad">
            {susceptibilidad === null ? (
              <p data-testid="ficha-acceso-susceptibilidad-sin-datos">
                Sin datos de agua estimada cargados.
              </p>
            ) : (
              <p data-testid="ficha-acceso-susceptibilidad-valor">
                <span
                  className={`badge ${BADGE_CLASE_INUNDACION[claseInundacion(filaSusceptibilidad?.claseRio)]}`}
                  data-testid="ficha-acceso-clase-rio"
                >
                  {ETIQUETAS_INUNDACION[claseInundacion(filaSusceptibilidad?.claseRio)]}
                </span>
                {filaSusceptibilidad?.juntoLaguna === true && (
                  <>
                    {' '}
                    <span className="badge badge--neutral" data-testid="ficha-acceso-junto-laguna">
                      Junto a laguna
                    </span>
                  </>
                )}
              </p>
            )}
          </div>}

          {MOSTRAR_AGUA_ESTIMADA && (exposicionLoading || exposicionError !== null || exposicion != null) && (
            <p data-testid="ficha-acceso-exposicion-ruta">
              {exposicionLoading
                ? 'Agua estimada en el camino: cargando…'
                : exposicionError !== null
                  ? 'Agua estimada en el camino: sin dato.'
                  : textoExposicionRuta(exposicion!)}
            </p>
          )}
          <p className="ficha-territorial__fuente">{TEXTOS_ACCESOS.detalleDatos}</p>

          {/* Acción. El recorrido vive en el mapa, no en la ficha: el botón
              sólo aparece si el padre sabe encuadrarlo. Si la geometría no
              existe se explica POR QUÉ en vez de ofrecer un botón que no puede
              hacer nada (nunca se dibuja ni se promete una ruta inexistente). */}
          {geometriaError !== null ? (
            <p
              className="ficha-territorial__error"
              role="alert"
              data-testid="ficha-acceso-ruta-error"
            >
              {geometriaError}
            </p>
          ) : geometria?.disponible === true ? (
            onVerRutaEnMapa !== undefined && (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="ficha-territorial__accion"
                data-testid="ficha-acceso-ver-ruta"
                onClick={() => onVerRutaEnMapa()}
              >
                {TEXTOS_ACCESOS.verRecorrido}
              </Button>
            )
          ) : geometriaLoading ? (
            onVerRutaEnMapa !== undefined && (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="ficha-territorial__accion"
                data-testid="ficha-acceso-ver-ruta"
                disabled
              >
                Cargando recorrido…
              </Button>
            )
          ) : geometria !== null ? (
            <p className="ficha-territorial__estado" data-testid="ficha-acceso-sin-ruta">
              <strong>{TEXTOS_ACCESOS.sinRuta}.</strong> {textoMotivoSinRuta(geometria.motivo)}
            </p>
          ) : null}

          {/* Único bloque secundario: escala, metodología, período y fuentes.
              Cerrado por defecto; su contenido sigue en el DOM, así que los
              tests lo pueden leer sin abrirlo. */}
          {hayDetalle && (
            <details className="ficha-territorial__ayuda" data-testid="ficha-acceso-detalle">
              <summary>Detalle, metodología y fuentes</summary>

              <p className="ficha-territorial__subtitulo">
                <strong>Acceso por camino</strong>
              </p>
              {filaAislamiento !== undefined && (
                <>
              <p data-testid="ficha-acceso-detalle-indice">
                    {textoIndiceDificultad(filaAislamiento.nivel)}
                  </p>
                  <p data-testid="ficha-acceso-detalle-nivel">
                    {significadoNivel(filaAislamiento.nivel)}
                  </p>
                  <p data-testid="ficha-acceso-aislamiento-alternativa">
                    Camino alternativo sin cruces: {filaAislamiento.alternativaSinCruce === null ? 'Sin dato' : textoAlternativa(filaAislamiento.alternativaSinCruce)}
                  </p>
                </>
              )}
              <p data-testid="ficha-acceso-detalle-que-mide">{TEXTOS_ACCESOS.queMideAcceso}</p>
              <p data-testid="ficha-acceso-detalle-no-representa">
                {TEXTOS_ACCESOS.noRepresentaAcceso}
              </p>
              {geometria?.disponible === true && (
                <p data-testid="ficha-acceso-ruta">{textoResumenRuta(geometria)}</p>
              )}
              {aislamiento !== null && (
                <p
                  className="ficha-territorial__fuente"
                  data-testid="ficha-acceso-aislamiento-fuente"
                >
                  {textoFuenteOsm(
                    aislamiento.fuente,
                    aislamiento.atribucion,
                    aislamiento.licencia,
                    aislamiento.fechaExtractoOsm,
                    aislamiento.versionJob,
                  )}
                </p>
              )}

              {MOSTRAR_AGUA_ESTIMADA && <p className="ficha-territorial__subtitulo">
                <strong>Agua estimada en la escuela</strong>
              </p>}
              {MOSTRAR_AGUA_ESTIMADA && susceptibilidad !== null && (
                <>
                  <p data-testid="ficha-acceso-susceptibilidad-subtitulo">
                    {textoConPeriodo(
                      TEXTOS_ACCESOS.subtituloInundacion,
                      susceptibilidad.periodoRetornoAnios,
                    )}
                  </p>
                  <p data-testid="ficha-acceso-susceptibilidad-que-mide">
                    {textoConPeriodo(
                      TEXTOS_ACCESOS.queMideInundacion,
                      susceptibilidad.periodoRetornoAnios,
                    )}
                  </p>
                  <p data-testid="ficha-acceso-susceptibilidad-periodo">
                    {textoConPeriodo(TEXTOS_ACCESOS.periodoEscenario, susceptibilidad.periodoRetornoAnios)}
                  </p>
                </>
              )}
              {exposicion != null && (
                <p data-testid="ficha-acceso-exposicion-detalle">
                  Resolución {exposicion.resolucionArcsec ?? 30} arcsec (≈ 1 km): un valor por celda, no por tramo ni por cruce · período de retorno {exposicion.periodoRetornoAnios ?? 100} años · escenario histórico · fuente WRI Aqueduct v2 vía OS-Climate physrisk (Apache-2.0) · corrida {exposicion.fechaCorrida ?? 'sin fecha'}. No es un pronóstico, ni el estado del camino, ni el trazado de un río.
                </p>
              )}
              {sinAguaEstimada && (
                <p data-testid="ficha-acceso-susceptibilidad-sin-profundidad">
                  {TEXTOS_ACCESOS.sinProfundidad}
                </p>
              )}
              {(susceptibilidad === null ||
                filaSusceptibilidad === undefined ||
                profundidad === null) && (
                <p data-testid="ficha-acceso-detalle-sin-cobertura">
                  {TEXTOS_ACCESOS.sinCobertura}
                </p>
              )}
              <p data-testid="ficha-acceso-susceptibilidad-no-representa">
                {TEXTOS_ACCESOS.noRepresentaInundacion}
              </p>
              {susceptibilidad !== null && (
                <p
                  className="ficha-territorial__fuente"
                  data-testid="ficha-acceso-susceptibilidad-fuente"
                >
                  Fuente: OS-Climate physrisk (Apache-2.0) · corrida {susceptibilidad.fechaCorrida}
                </p>
              )}

              <p className="ficha-territorial__fuente" data-testid="ficha-acceso-nota">
                {TEXTOS_ACCESOS.detalleDatos}
              </p>
            </details>
          )}
        </>
      )}
    </section>
  )
}
