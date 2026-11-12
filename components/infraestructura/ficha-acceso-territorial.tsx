'use client'

import type { JSX } from 'react'
import { Button } from '@/components/ui/button'
import { useTextos } from '@/lib/i18n/idioma-provider'
import { MOSTRAR_AGUA_ESTIMADA } from '@/lib/mapas/flags'
import {
  claseInundacion,
  descripcionesAislamiento,
  etiquetasAislamiento,
  etiquetasInundacion,
  textoMotivoSinRuta,
  textosAccesos,
  type ClaseInundacion,
} from '@/lib/mapas/accesos-capas'
import type { Diccionario } from '@/lib/i18n/diccionarios/tipos'
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

// Motivos de recorrido no disponible. Son continuaciones en minúscula de
// "Sin recorrido para mostrar:", así que se leen como una sola frase. Un
// motivo nuevo cae al texto genérico en vez de tragarse el dato. La fuente de
// verdad es la leyenda del mapa; acá va en lenguaje llano porque la ficha la
// va a leer alguien que no sabe de grafos ni de OSM.
// Línea visible de dificultad: sólo el nombre del nivel, en minúscula porque ya
// va después de "dificultad". 'sin_datos_red' usa su propio nombre ("no
// calculable"): no hay índice que mostrar, y NO es un nivel 0.
type TextosAcceso = ReturnType<typeof useTextos>['fichaTerritorio']['acceso']

function textoDificultad(a: TextosAcceso, nivel: NivelAislamientoMapa, t: Diccionario): string {
  if (nivel === 'sin_datos_red') return a.dificultadNoCalculable
  return a.dificultad(etiquetasAislamiento(t)[nivel].toLowerCase())
}

// Detalle: acá sí aparece la escala, porque sin ella "dificultad alta" no dice
// cómo se calculó.
function textoIndiceDificultad(a: TextosAcceso, nivel: NivelAislamientoMapa): string {
  if (nivel === 'sin_datos_red') return a.indiceNoCalculable
  return a.indice(nivel)
}

// Línea visible de cruces. "sin puente registrado" es lo que dice el dato: OSM
// no tiene tag de puente en ese punto, lo que NO confirma que el puente falte
// (también cuenta el vado). Con cero cruces no se inventa un desglose en cero.
function textoCruces(a: TextosAcceso, fila: AislamientoEscuelaMapa | undefined): string {
  if (fila === undefined || fila.cruces === null) return a.sinDatoCruces
  if (fila.cruces === 0) return a.sinCruces
  if (fila.sinPuente === 0) return a.crucesConPuente(fila.cruces)
  return a.crucesSinPuente(fila.cruces, fila.sinPuente ?? 0)
}

// Estilo del tag de clase de río, reutilizando los badges de globals.css.
const BADGE_CLASE_INUNDACION: Record<ClaseInundacion, string> = {
  alto: 'badge--danger',
  medio: 'badge--warning',
  bajo: 'badge--neutral',
  sin_riesgo: 'badge--success',
  sin_dato: 'badge--neutral',
}

// Resumen de lo que el cálculo realmente dibujó. Sólo con geometría
// disponible: nunca se resume un recorrido que no existe.
function textoResumenRuta(a: TextosAcceso, geometria: GeometriaAccesoRespuesta): string {
  const resumen = geometria.resumen
  return a.resumenRuta(resumen?.puente ?? 0, resumen?.vado ?? 0, resumen?.sinEvidencia ?? 0)
}

function textoAlternativa(a: TextosAcceso, alternativaSinCruce: boolean | null): string {
  if (alternativaSinCruce === null) return a.desconocida
  return alternativaSinCruce ? a.si : a.no
}

// Significado del nivel DE ESTA escuela (nombre + su regla), no el de los cinco
// niveles: la ficha es de una escuela, no un manual del índice.
function significadoNivel(nivel: NivelAislamientoMapa, t: Diccionario): string {
  const descripcion = descripcionesAislamiento(t)[nivel]
  return `${descripcion.nombre}: ${descripcion.detalle}`
}

// El valor almacenado de `licencia` puede ya incluir la atribución OSM. Si es
// así se usa tal cual para no repetir "© OpenStreetMap contributors" dos veces;
// si no, se compone con la atribución estándar.
function textoFuenteOsm(
  a: TextosAcceso,
  fuente: string,
  atribucion: string,
  licencia: string,
  fechaExtractoOsm: string,
  versionJob: string,
): string {
  const credito = licencia.includes('OpenStreetMap contributors')
    ? licencia
    : `${atribucion}, ${licencia}`
  return a.fuenteOsm(fuente, credito, fechaExtractoOsm, versionJob)
}

export function FichaAccesoTerritorial({
  territorio,
  territorioLoading,
  territorioError,
  cueAnexo,
  geometria,
  geometriaLoading,
  geometriaError,
  onVerRutaEnMapa,
}: FichaAccesoTerritorialProps): JSX.Element {
  const dicionario = useTextos()
  const a = dicionario.fichaTerritorio.acceso
  const textosAcceso = textosAccesos(dicionario)
  const aislamiento = territorio?.aislamiento ?? null
  const filaAislamiento = aislamiento?.escuelas[cueAnexo]
  const susceptibilidad = territorio?.susceptibilidad ?? null
  const filaSusceptibilidad = susceptibilidad?.escuelas[cueAnexo]
  // Sin datos de aislamiento no hay detalle que mostrar. La inundación no
  // aporta detalle: en la ficha sólo se muestran tags.
  const hayDetalle = aislamiento !== null

  return (
    <section
      className="ficha-territorial ficha-acceso-territorial"
      aria-labelledby={ID_TITULO}
      data-testid="ficha-acceso-territorial"
    >
      <p className="ficha-territorial__titulo" id={ID_TITULO}>
        <strong>{MOSTRAR_AGUA_ESTIMADA ? a.tituloConAgua : a.tituloSinAgua}</strong>
      </p>

      {territorioLoading ? (
        <p
          className="ficha-territorial__estado"
          role="status"
          data-testid="ficha-acceso-territorial-cargando"
        >
          {a.cargando}
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
                {a.sinDatosCaminos}
              </p>
            ) : filaAislamiento === undefined ? (
              <p data-testid="ficha-acceso-aislamiento-sin-cobertura">
                {a.sinCobertura}
              </p>
            ) : (
              <p data-testid="ficha-acceso-aislamiento-indice">
                {textoDificultad(a, filaAislamiento.nivel, dicionario)}
              </p>
            )}
            {aislamiento !== null && (
              <p data-testid="ficha-acceso-aislamiento-cruces">
                {textoCruces(a, filaAislamiento)}
              </p>
            )}
          </div>

          {/* Bloque de inundación aislado: sólo tags. Clase de río (sin fila o
              sin clase = "Sin dato") y, si aplica, "Junto a laguna". */}
          {MOSTRAR_AGUA_ESTIMADA && <div className="ficha-territorial__dato" data-testid="ficha-acceso-susceptibilidad">
            {susceptibilidad === null ? (
              <p data-testid="ficha-acceso-susceptibilidad-sin-datos">
                {a.sinDatoAgua}
              </p>
            ) : (
              <p data-testid="ficha-acceso-susceptibilidad-valor">
                <span
                  className={`badge ${BADGE_CLASE_INUNDACION[claseInundacion(filaSusceptibilidad?.claseRio)]}`}
                  data-testid="ficha-acceso-clase-rio"
                >
                  {etiquetasInundacion(dicionario)[claseInundacion(filaSusceptibilidad?.claseRio)]}
                </span>
                {filaSusceptibilidad?.juntoLaguna === true && (
                  <>
                    {' '}
                    <span className="badge badge--neutral" data-testid="ficha-acceso-junto-laguna">
                      {a.junteLaguna}
                    </span>
                  </>
                )}
              </p>
            )}
          </div>}

          <p className="ficha-territorial__fuente">{textosAcceso.detalleDatos}</p>

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
                {textosAcceso.verRecorrido}
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
                {a.cargandoRecorrido}
              </Button>
            )
          ) : geometria !== null ? (
            <p className="ficha-territorial__estado" data-testid="ficha-acceso-sin-ruta">
              <strong>{textosAcceso.sinRuta}.</strong> {textoMotivoSinRuta(geometria.motivo, dicionario)}
            </p>
          ) : null}

          {/* Único bloque secundario: escala, metodología, período y fuentes.
              Cerrado por defecto; su contenido sigue en el DOM, así que los
              tests lo pueden leer sin abrirlo. */}
          {hayDetalle && (
            <details className="ficha-territorial__ayuda" data-testid="ficha-acceso-detalle">
              <summary>{a.detalleTitulo}</summary>

              <p className="ficha-territorial__subtitulo">
                <strong>{a.tituloSinAgua}</strong>
              </p>
              {filaAislamiento !== undefined && (
                <>
              <p data-testid="ficha-acceso-detalle-indice">
                    {textoIndiceDificultad(a, filaAislamiento.nivel)}
                  </p>
                  <p data-testid="ficha-acceso-detalle-nivel">
                    {significadoNivel(filaAislamiento.nivel, dicionario)}
                  </p>
                  <p data-testid="ficha-acceso-aislamiento-alternativa">
                    {a.alternativa} {filaAislamiento.alternativaSinCruce === null ? a.sinDato : textoAlternativa(a, filaAislamiento.alternativaSinCruce)}
                  </p>
                </>
              )}
              <p data-testid="ficha-acceso-detalle-que-mide">{textosAcceso.queMideAcceso}</p>
              <p data-testid="ficha-acceso-detalle-no-representa">
                {textosAcceso.noRepresentaAcceso}
              </p>
              {geometria?.disponible === true && (
                <p data-testid="ficha-acceso-ruta">{textoResumenRuta(a, geometria)}</p>
              )}
              {aislamiento !== null && (
                <p
                  className="ficha-territorial__fuente"
                  data-testid="ficha-acceso-aislamiento-fuente"
                >
                  {textoFuenteOsm(
                    a,
                    aislamiento.fuente,
                    aislamiento.atribucion,
                    aislamiento.licencia,
                    aislamiento.fechaExtractoOsm,
                    aislamiento.versionJob,
                  )}
                </p>
              )}

              <p className="ficha-territorial__fuente" data-testid="ficha-acceso-nota">
                {textosAcceso.detalleDatos}
              </p>
            </details>
          )}
        </>
      )}
    </section>
  )
}
