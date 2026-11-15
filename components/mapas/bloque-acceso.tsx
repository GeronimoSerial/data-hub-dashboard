'use client'

import { Check, Info, Route, School, TriangleAlert } from 'lucide-react'
import { lineasAcceso, type LineasAcceso } from '@/lib/infraestructura/mapa/acceso'
import type { ExposicionRutaRespuesta } from '@/lib/infraestructura/exposicion-ruta'
import type { GeometriaAccesoRespuesta } from '@/lib/infraestructura/territorio-mapa'
import type { ClaseInundacion } from '@/lib/mapas/accesos-capas'
import { useTextos } from '@/lib/i18n/idioma-provider'

type TextosRiesgo = ReturnType<typeof useTextos>['fichaCuerpo']['acceso']['riesgo']

// Niveles por clave (no por etiqueta): la etiqueta cambia con el idioma.
type NivelRiesgoTexto = 'alto' | 'medio' | 'bajo' | 'sin_riesgo' | 'sin_dato' | 'sin_ruta'

interface BloqueAccesoProps {
  geometria: GeometriaAccesoRespuesta | null
  exposicion: ExposicionRutaRespuesta | null
  /** Clase de río de la escuela: el mismo dato que pinta el punto en Planificación. */
  claseEscuela?: ClaseInundacion
  juntoLaguna?: boolean
  cargando?: boolean
  error?: boolean
  /** Day-to-day view (school ficha): only rows with a known value, no method links. */
  esencial?: boolean
}

function textoRiesgo(riesgo: TextosRiesgo, sujeto: string, nivel: NivelRiesgoTexto): string {
  if (nivel === 'sin_ruta') return riesgo.sinCamino
  if (nivel === 'sin_riesgo') return riesgo.sinRiesgo(sujeto)
  if (nivel === 'sin_dato') return riesgo.sinDato(sujeto)
  if (nivel === 'alto') return riesgo.alto(sujeto)
  if (nivel === 'medio') return riesgo.medio(sujeto)
  return riesgo.bajo(sujeto)
}

// Mismo criterio que `lineasAcceso`: sin ruta → 'sin_ruta'; sin exposición o
// sin clase → 'sin_dato'.
function nivelCamino(lineas: LineasAcceso | null, exposicion: ExposicionRutaRespuesta | null): NivelRiesgoTexto {
  if (lineas === null) return 'sin_ruta'
  return exposicion?.claseRuta ?? 'sin_dato'
}

function LinkMetodologia({ seccion }: { seccion: string }) {
  const t = useTextos().fichaCuerpo.acceso
  return (
    <a
      className="map-bloque-acceso__ayuda"
      href={`/mapas/infraestructura#metodologia/${seccion}`}
      aria-label={t.comoSeCalcula}
      title={t.comoSeCalcula}
    >
      <Info aria-hidden="true" />
    </a>
  )
}

function claseCss(nivel: NivelRiesgoTexto): string {
  return ['alto', 'medio', 'bajo'].includes(nivel) ? `map-bloque-acceso__riesgo--${nivel}` : ''
}

export function BloqueAcceso({
  geometria,
  exposicion,
  claseEscuela = 'sin_dato',
  juntoLaguna = false,
  cargando = false,
  error = false,
  esencial = false,
}: BloqueAccesoProps) {
  const diccionario = useTextos()
  const t = diccionario.fichaCuerpo.acceso
  if (cargando) return esencial ? null : <p className="map-bloque-acceso__estado">{t.calculando}</p>
  if (error) return esencial ? null : <p className="map-bloque-acceso__estado">{t.error}</p>

  const lineas = lineasAcceso(geometria, exposicion, diccionario)
  const nivelCaminoTexto = nivelCamino(lineas, exposicion)
  const conDato = (nivel: NivelRiesgoTexto) => nivel !== 'sin_dato' && nivel !== 'sin_ruta'
  const verEscuela = !esencial || conDato(claseEscuela) || juntoLaguna
  const verCamino = !esencial || conDato(nivelCaminoTexto)
  if (esencial && lineas === null && !verEscuela && !verCamino) return null

  return (
    <div className="map-bloque-acceso" aria-label={t.etiqueta}>
      {lineas === null ? (
        esencial ? null : <p className="map-bloque-acceso__estado">{t.sinAcceso}</p>
      ) : (
        <>
          {lineas.via && (
            <div className="map-bloque-acceso__fila" data-testid="bloque-acceso-via">
              <Route aria-hidden="true" />
              <span>{lineas.via}</span>
            </div>
          )}
          <div className="map-bloque-acceso__fila" data-testid="bloque-acceso-cruces">
            {lineas.crucesConRiesgo
              ? <TriangleAlert aria-hidden="true" data-testid="bloque-acceso-cruces-icono" data-icono="alerta" />
              : <Check aria-hidden="true" data-testid="bloque-acceso-cruces-icono" data-icono="ok" />}
            <span>
              {lineas.cruces}
              {lineas.crucesDetalle && <span className="map-bloque-acceso__detalle">{lineas.crucesDetalle}</span>}
            </span>
          </div>
        </>
      )}
      {(verEscuela || verCamino) && (
      <div className="map-bloque-acceso__inundacion" data-testid="bloque-acceso-inundacion">
        {verEscuela && (
        <div className="map-bloque-acceso__fila" data-testid="bloque-acceso-escuela">
          <School aria-hidden="true" />
          <span className={claseCss(claseEscuela)}>{textoRiesgo(t.riesgo, t.sujetos.escuela, claseEscuela)}</span>
          {!esencial && <LinkMetodologia seccion="inundacion-clases-rio" />}
          {juntoLaguna && <span className="badge badge--neutral" data-testid="bloque-acceso-laguna">{t.junto}</span>}
        </div>
        )}
        {verCamino && (
        <div className="map-bloque-acceso__fila" data-testid="bloque-acceso-riesgo">
          <Route aria-hidden="true" />
          <span className={claseCss(nivelCaminoTexto)}>{textoRiesgo(t.riesgo, t.sujetos.camino, nivelCaminoTexto)}</span>
          {!esencial && <LinkMetodologia seccion="inundacion-ruta-acceso" />}
        </div>
        )}
      </div>
      )}
    </div>
  )
}
