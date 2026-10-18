import type { CruceAccesoOsm } from '@/lib/db/schema'
import type { GeometriaAccesoRespuesta } from '@/lib/infraestructura/territorio-mapa'
import { desgloseSuperficies, etiquetaSuperficie, superficieVia } from '@/lib/infraestructura/mapa/acceso'
import { DESCRIPCIONES_CRUCE, ETIQUETAS_CRUCE, type ClasificacionCruce } from '@/lib/mapas/accesos-capas'

const RADIO_TIERRA_M = 6_371_000

function distanciaM(a: [number, number], b: [number, number]): number {
  const rad = Math.PI / 180
  const dLat = (b[1] - a[1]) * rad
  const dLon = (b[0] - a[0]) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLon / 2) ** 2
  return 2 * RADIO_TIERRA_M * Math.asin(Math.min(1, Math.sqrt(h)))
}

/**
 * Distance in metres along `coordenadas` (from its first vertex) to the point of the
 * line nearest to `punto`. Segments are projected on a local equirectangular plane,
 * which is precise enough at route scale.
 */
export function distanciaSobreRutaM(coordenadas: ReadonlyArray<[number, number]>, punto: [number, number]): number | null {
  if (coordenadas.length < 2) return null
  const kx = Math.cos((punto[1] * Math.PI) / 180)
  let mejor = { d2: Infinity, distancia: 0 }
  let acumulado = 0
  for (let i = 0; i < coordenadas.length - 1; i += 1) {
    const a = coordenadas[i]
    const b = coordenadas[i + 1]
    const ax = a[0] * kx
    const bx = b[0] * kx
    const px = punto[0] * kx
    const dx = bx - ax
    const dy = b[1] - a[1]
    const largo2 = dx * dx + dy * dy
    const t = largo2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (punto[1] - a[1]) * dy) / largo2))
    const cx = ax + t * dx
    const cy = a[1] + t * dy
    const d2 = (px - cx) ** 2 + (punto[1] - cy) ** 2
    const tramo = distanciaM(a, b)
    if (d2 < mejor.d2) mejor = { d2, distancia: acumulado + t * tramo }
    acumulado += tramo
  }
  return mejor.distancia
}

export type ContextoCruceRuta = {
  /** 1-based position of the crossing counted from the school. */
  orden: number
  total: number
  distanciaEscuelaM: number
  sinPuente: number
}

/**
 * Route context of crossing `indice` of `geometria.cruces`. The route is oriented
 * school → destination; when the school coordinate is known, the end nearest to it
 * is taken as the start so a reversed LineString still measures from the school.
 */
export function contextoCruceEnRuta(
  geometria: GeometriaAccesoRespuesta | null,
  indice: number,
  escuela?: { lat: number | null; lon: number | null } | null,
): ContextoCruceRuta | null {
  const cruces = geometria?.cruces
  const coordenadas = geometria?.ruta?.coordinates
  if (!cruces || !coordenadas || coordenadas.length < 2 || !cruces[indice]) return null

  let linea: ReadonlyArray<[number, number]> = coordenadas
  if (escuela && escuela.lat !== null && escuela.lon !== null) {
    const origen: [number, number] = [escuela.lon, escuela.lat]
    if (distanciaM(origen, coordenadas[coordenadas.length - 1]) < distanciaM(origen, coordenadas[0])) {
      linea = [...coordenadas].reverse()
    }
  }

  const distancias = cruces.map((cruce: CruceAccesoOsm) => distanciaSobreRutaM(linea, [cruce.lon, cruce.lat]) ?? 0)
  const propia = distancias[indice]
  const orden = distancias.filter((d, i) => d < propia || (d === propia && i < indice)).length + 1
  return {
    orden,
    total: cruces.length,
    distanciaEscuelaM: propia,
    sinPuente: cruces.filter((cruce) => cruce.clasificacion !== 'puente').length,
  }
}

function formatearKm(metros: number): string {
  const km = metros / 1000
  return km.toLocaleString('es-AR', { maximumFractionDigits: km < 10 ? 1 : 0 })
}

export type LluviaEnCruce = { mm: number; horas: number }

export function TarjetaCruceAgua({
  clasificacion,
  nombreCurso,
  nombrePuente,
  indice,
  escuela,
  geometria,
  lluvia,
}: {
  clasificacion: ClasificacionCruce
  nombreCurso?: string | null
  nombrePuente?: string | null
  indice?: number | null
  escuela?: { nombre: string; lat: number | null; lon: number | null } | null
  geometria?: GeometriaAccesoRespuesta | null
  lluvia?: LluviaEnCruce | null
}) {
  const contexto = indice === null || indice === undefined ? null : contextoCruceEnRuta(geometria ?? null, indice, escuela)
  const destino = geometria?.destino?.nombre
  const distanciaKm = geometria?.distanciaKm
  const via = geometria?.viaPrincipal
  const desglose = desgloseSuperficies(geometria?.superficies)
  const superficie = desglose ? null : superficieVia(via)

  return (
    <div className="map-popup tarjeta-estacion tarjeta-cruce" data-clase={clasificacion}>
      <div className="tarjeta-estacion__cabecera">
        <div>
          <h3 className="tarjeta-estacion__titulo">{nombreCurso || 'Cruce de agua'}</h3>
          {nombreCurso && <p className="tarjeta-estacion__sub">Cruce de agua</p>}
        </div>
        <span className="tarjeta-cruce__clase">{ETIQUETAS_CRUCE[clasificacion]}</span>
      </div>

      <p className="tarjeta-cruce__descripcion">{DESCRIPCIONES_CRUCE[clasificacion]}</p>
      {nombrePuente && <p className="tarjeta-cruce__descripcion">Puente: {nombrePuente}</p>}

      {contexto && (
        <dl className="tarjeta-estacion__datos">
          <div>
            <dt>Posición en el camino</dt>
            <dd>Cruce {contexto.orden} de {contexto.total}</dd>
          </div>
          <div>
            <dt>Desde la escuela</dt>
            <dd>a {formatearKm(contexto.distanciaEscuelaM)} km</dd>
          </div>
          {lluvia && (
            <div>
              <dt>Lluvia observada ({lluvia.horas} h)</dt>
              <dd>{lluvia.mm.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} mm</dd>
            </div>
          )}
        </dl>
      )}
      {!contexto && lluvia && (
        <p className="tarjeta-estacion__hora">
          Lluvia observada ({lluvia.horas} h): {lluvia.mm.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} mm
        </p>
      )}

      {(escuela?.nombre || destino || via) && (
        <div className="tarjeta-cruce__ruta">
          {escuela?.nombre && <p className="tarjeta-cruce__escuela">{escuela.nombre}</p>}
          {destino && (
            <p className="tarjeta-estacion__sub">
              Camino a {destino}
              {typeof distanciaKm === 'number' && ` · ${formatearKm(distanciaKm * 1000)} km`}
              {typeof distanciaKm === 'number' && superficie && ` ${etiquetaSuperficie(superficie)}`}
            </p>
          )}
          {desglose && (
            <p className="tarjeta-estacion__sub">{desglose}</p>
          )}
          {via && (
            <p className="tarjeta-estacion__sub">
              {via.nombre ? `Vía principal: ${via.nombre}` : 'Vía principal sin nombre'}
            </p>
          )}
        </div>
      )}

      <div className="tarjeta-lluvia__fuente">
        <p className="tarjeta-estacion__sub">
          Mapa colaborativo OpenStreetMap
        </p>
      </div>
    </div>
  )
}
