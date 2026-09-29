import type { JSX } from 'react'
import {
  ETIQUETAS_AISLAMIENTO,
  ETIQUETAS_INUNDACION,
  claseInundacion,
} from '@/lib/mapas/accesos-capas'
import type {
  GeometriaAccesoRespuesta,
  TerritorioMapa,
} from '@/lib/infraestructura/territorio-mapa'

// Sección de sólo lectura: contexto de acceso territorial ESTÁTICO de una
// escuela (aislamiento OSM + susceptibilidad physrisk + estado de la ruta
// dibujada). Deliberadamente NO hace fetch: el padre resuelve `territorio` y
// `geometria` (con sus loading/error) y los pasa por props. Ningún dato acá es
// un pronóstico ni el estado confirmado del edificio: son capas de contexto.
export interface FichaAccesoTerritorialProps {
  territorio: TerritorioMapa | null
  territorioLoading: boolean
  territorioError: string | null
  cueAnexo: string
  geometria: GeometriaAccesoRespuesta | null
  geometriaLoading: boolean
  geometriaError: string | null
}

const ID_TITULO = 'ficha-acceso-territorial-titulo'

// Profundidad en metros con dos decimales y coma decimal (es-AR): 1.234 -> '1,23'.
function formatearMetros(valor: number): string {
  return valor.toFixed(2).replace('.', ',')
}

// Motivos de geometría no disponible: los mismos textos que la leyenda del
// mapa. Un motivo nuevo cae al texto genérico en vez de tragarse el dato.
const MOTIVOS_RUTA: Record<string, string> = {
  sin_geometria_importada: 'La geometría de accesos no está importada para esta escuela.',
  sin_conexion_red: 'La escuela no conecta con la red vial OSM: no hay ruta calculada.',
  ruta_degenerada: 'La escuela está junto a la cabecera departamental: no hay ruta que dibujar.',
}

function textoRuta(
  geometria: GeometriaAccesoRespuesta | null,
  loading: boolean,
  error: string | null,
): string | null {
  if (loading) return 'Cargando ruta de acceso…'
  if (error !== null) return error
  if (geometria === null) return null

  if (geometria.disponible) {
    const resumen = geometria.resumen
    return (
      `Ruta y cruces dibujados en el mapa: ${resumen?.puente ?? 0} puente(s), ` +
      `${resumen?.vado ?? 0} vado(s), ${resumen?.sinEvidencia ?? 0} sin evidencia de puente.`
    )
  }

  const motivo = geometria.motivo ?? ''
  return MOTIVOS_RUTA[motivo] ?? 'Sin geometría de acceso para esta escuela.'
}

function textoAlternativa(alternativaSinCruce: boolean | null): string {
  if (alternativaSinCruce === null) return 'Desconocida'
  return alternativaSinCruce ? 'Sí' : 'No'
}

function textoProfundidad(valor: number): string {
  if (!(valor > 0)) {
    return 'Profundidad estimada de inundación fluvial: 0 m (sin profundidad estimada)'
  }
  const clase = claseInundacion(valor)
  const etiqueta =
    clase === 'baja' || clase === 'media' || clase === 'alta' ? ETIQUETAS_INUNDACION[clase] : ''
  return `Profundidad estimada de inundación fluvial: ${formatearMetros(valor)} m (${etiqueta})`
}

export function FichaAccesoTerritorial({
  territorio,
  territorioLoading,
  territorioError,
  cueAnexo,
  geometria,
  geometriaLoading,
  geometriaError,
}: FichaAccesoTerritorialProps): JSX.Element {
  const aislamiento = territorio?.aislamiento ?? null
  const filaAislamiento = aislamiento?.escuelas[cueAnexo]
  const susceptibilidad = territorio?.susceptibilidad ?? null
  const filaSusceptibilidad = susceptibilidad?.escuelas[cueAnexo]

  const ruta = textoRuta(geometria, geometriaLoading, geometriaError)

  return (
    <section
      className="ficha-territorial ficha-acceso-territorial"
      aria-labelledby={ID_TITULO}
      data-testid="ficha-acceso-territorial"
    >
      <p className="ficha-territorial__titulo" id={ID_TITULO}>
        <strong>Acceso y susceptibilidad territorial (estático)</strong>
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
          {/* Aislamiento OSM (índice estático 0..3). Fila ausente = sin
              cobertura, NUNCA índice 0. */}
          <div className="ficha-territorial__dato" data-testid="ficha-acceso-aislamiento">
            <p className="ficha-territorial__subtitulo">
              <strong>Aislamiento OSM</strong>
            </p>
            {aislamiento === null ? (
              <p data-testid="ficha-acceso-aislamiento-sin-datos">
                Sin datos de aislamiento OSM importados.
              </p>
            ) : filaAislamiento === undefined ? (
              <p data-testid="ficha-acceso-aislamiento-sin-cobertura">
                Sin cobertura OSM para esta escuela.
              </p>
            ) : (
              <>
                <p data-testid="ficha-acceso-aislamiento-indice">
                  Índice de aislamiento:{' '}
                  {filaAislamiento.nivel === 'sin_datos_red'
                    ? ETIQUETAS_AISLAMIENTO.sin_datos_red
                    : `${ETIQUETAS_AISLAMIENTO[filaAislamiento.nivel]} (${filaAislamiento.nivel}/3)`}
                </p>
                <p data-testid="ficha-acceso-aislamiento-cruces">
                  Cruces de agua en la ruta a la cabecera: {filaAislamiento.cruces ?? 'sin dato'}
                  {filaAislamiento.cruces !== null && filaAislamiento.cruces > 0
                    ? ` · con puente ${filaAislamiento.conPuente ?? 0} · sin puente confirmado ${
                        filaAislamiento.sinPuente ?? 0
                      }`
                    : ''}
                </p>
                <p data-testid="ficha-acceso-aislamiento-alternativa">
                  Alternativa sin cruce: {textoAlternativa(filaAislamiento.alternativaSinCruce)}
                </p>
                <p className="ficha-territorial__fuente" data-testid="ficha-acceso-aislamiento-fuente">
                  Fuente: {aislamiento.fuente} ({aislamiento.atribucion},{' '}
                  {aislamiento.licencia}) · extracto {aislamiento.fechaExtractoOsm} · job v
                  {aislamiento.versionJob}
                </p>
              </>
            )}
          </div>

          {/* Estado de la ruta dibujada en el mapa. Independiente del bloque
              anterior: la geometría puede faltar aunque haya aislamiento. */}
          {ruta !== null && (
            <p
              className="ficha-territorial__dato"
              data-testid="ficha-acceso-ruta"
            >
              {ruta}
            </p>
          )}

          {/* Susceptibilidad physrisk (peligro histórico por período de
              retorno). El metadato y la fuente acompañan SIEMPRE al bloque. */}
          <div className="ficha-territorial__dato" data-testid="ficha-acceso-susceptibilidad">
            <p className="ficha-territorial__subtitulo">
              <strong>Susceptibilidad physrisk</strong>
            </p>
            {susceptibilidad === null ? (
              <p data-testid="ficha-acceso-susceptibilidad-sin-datos">
                Sin datos physrisk importados.
              </p>
            ) : filaSusceptibilidad === undefined ? (
              <p data-testid="ficha-acceso-susceptibilidad-sin-cobertura">
                Sin cobertura physrisk para esta escuela.
              </p>
            ) : filaSusceptibilidad.inundacionFluvialM === null ? (
              <p data-testid="ficha-acceso-susceptibilidad-sin-valor">
                Sin valor physrisk para esta escuela.
              </p>
            ) : (
              <p data-testid="ficha-acceso-susceptibilidad-valor">
                {textoProfundidad(filaSusceptibilidad.inundacionFluvialM)}
              </p>
            )}
            {susceptibilidad !== null && (
              <>
                <p data-testid="ficha-acceso-susceptibilidad-periodo">
                  Período de retorno {susceptibilidad.periodoRetornoAnios} años · escenario
                  histórico. Indicador estático de largo plazo: no es un pronóstico ni el trazado
                  de un río.
                </p>
                <p
                  className="ficha-territorial__fuente"
                  data-testid="ficha-acceso-susceptibilidad-fuente"
                >
                  Fuente: OS-Climate physrisk (Apache-2.0) · corrida {susceptibilidad.fechaCorrida}
                </p>
              </>
            )}
          </div>
        </>
      )}

      <p className="ficha-territorial__fuente" data-testid="ficha-acceso-nota">
        Contexto territorial: no reemplaza el parte ni confirma el estado del edificio.
      </p>
    </section>
  )
}
