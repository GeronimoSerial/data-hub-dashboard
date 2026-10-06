'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowLeft, BookMinus, BookX, ChevronDown, Clock, DoorOpen, House } from 'lucide-react'
import { CATEGORIA_META, esCategoria } from '@/lib/infraestructura/categorias'
import { colorSeveridad } from '@/lib/infraestructura/severidad'
import { ETIQUETA_CLASES, ETIQUETA_GRAVEDAD, etiquetaDepartamento } from '@/lib/infraestructura/mapa/etiquetas'
import { etiquetaApoyoMapa } from '@/lib/infraestructura/mapa/etiqueta-apoyo'
import { tiempoRelativo } from '@/lib/infraestructura/mapa/tiempo-relativo'
import type { EscuelaMapaEnriquecida } from '@/lib/infraestructura/mapa/tipos'
import { useFichaParte } from '@/lib/infraestructura/use-ficha-parte'
import { HistorialMovimiento } from '@/components/infraestructura/historial-movimiento'
import type { AfectacionFicha } from '@/lib/infraestructura/use-ficha-parte'
import { SEVERIDADES } from '@/lib/infraestructura/validacion'

interface FichaEscuelaPanelProps {
  escuela: EscuelaMapaEnriquecida
  acceso: ReactNode
  mostrarEnlaceNominal: boolean
  onCerrar: () => void
  onVerAlumnosAlcanzados: (afectacionId: string) => void
  onVerHistorialCompleto: () => void
}

const FORMATO_NUMERO = new Intl.NumberFormat('es-AR')
const DOS_ANIOS_MS = 730 * 24 * 60 * 60 * 1000

function IconoClases({ estado }: { estado: EscuelaMapaEnriquecida['clases'] }) {
  if (estado === 'sin') return <BookX aria-hidden="true" />
  if (estado === 'parcial') return <BookMinus aria-hidden="true" />
  if (estado === 'evacuado') return <DoorOpen aria-hidden="true" />
  if (estado === 'centro') return <House aria-hidden="true" />
  return null
}

function etiquetaCategoria(categoria: string | null): string | null {
  if (!categoria) return null
  return esCategoria(categoria) ? CATEGORIA_META[categoria].label : categoria
}

function fechaSituacionPrincipal(afectaciones: AfectacionFicha[], gravedad: string): string | null {
  const candidatas = afectaciones
    .map((afectacion) => ({
      fecha: afectacion.rigeDesde,
      severidadEtiqueta: afectacion.severidad,
      severidad: SEVERIDADES.indexOf(afectacion.severidad),
    }))
    .filter(({ fecha, severidad }) => severidad >= 0 && Number.isFinite(Date.parse(fecha)))
  const coincidentes = candidatas.filter((afectacion) => afectacion.severidadEtiqueta === gravedad)
  const principales = (coincidentes.length > 0 ? coincidentes : candidatas)
    .sort((a, b) => b.severidad - a.severidad || Date.parse(a.fecha) - Date.parse(b.fecha))
  return principales[0]?.fecha ?? null
}

function FilaEstado({ escuela }: { escuela: EscuelaMapaEnriquecida }) {
  const etiquetaApoyo = etiquetaApoyoMapa(escuela.clases, escuela.apoyo)
  return (
    <div className="map-sitact__chips map-ficha-escuela__chips" aria-label="Estado de la escuela">
      {escuela.clases === 'normal' ? (
        <span className="map-sitact__pill map-sitact__pill--ok">Con clases</span>
      ) : (
        <span className="map-sitact__pill map-sitact__pill--clases">
          <IconoClases estado={escuela.clases} />{ETIQUETA_CLASES[escuela.clases]}
        </span>
      )}
      {etiquetaApoyo && (
        <span className={`map-sitact__pill ${escuela.apoyo === 'no' ? 'map-sitact__pill--aviso' : 'map-sitact__pill--apoyo'}`}>
          {etiquetaApoyo}
        </span>
      )}
      {escuela.sinActualizar && (
        <span className="map-sitact__pill map-sitact__pill--neutro"><Clock aria-hidden="true" />Sin actualizar</span>
      )}
    </div>
  )
}

function Desplegable({
  children,
  titulo,
  abierto = false,
}: {
  children: ReactNode
  titulo: string
  abierto?: boolean
}) {
  return (
    <details className="map-ficha-escuela__fold" open={abierto || undefined}>
      <summary>{titulo}<ChevronDown aria-hidden="true" /></summary>
      <div className="map-ficha-escuela__fold-body">{children}</div>
    </details>
  )
}

export function FichaEscuelaPanel({
  escuela,
  acceso,
  mostrarEnlaceNominal,
  onCerrar,
  onVerAlumnosAlcanzados,
  onVerHistorialCompleto,
}: FichaEscuelaPanelProps) {
  const { estado, historial } = useFichaParte(escuela.cueAnexo)
  const volverRef = useRef<HTMLButtonElement>(null)
  const [ahoraMs] = useState(() => Date.now())
  const datos = estado.fase === 'listo' ? estado.datos : null
  const afectaciones = datos?.afectaciones ?? []
  const severidad = ETIQUETA_GRAVEDAD[escuela.gravedad]
  const desde = fechaSituacionPrincipal(afectaciones, severidad)
  const categoria = etiquetaCategoria(escuela.categoriaPrincipal)
  const novedad = datos?.parte?.actualizadaEn
    ? tiempoRelativo(datos.parte.actualizadaEn, ahoraMs)
    : ''
  const movimientosRecientes = historial.fase === 'listo'
    ? historial.movimientos.filter((movimiento) => {
      const creadaEn = Date.parse(movimiento.creadaEn)
      return movimiento.tipo === 'reporte_inicial' && creadaEn >= ahoraMs - DOS_ANIOS_MS && creadaEn <= ahoraMs
    })
    : []

  useEffect(() => {
    volverRef.current?.focus()
    const alPresionarTecla = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCerrar()
    }
    window.addEventListener('keydown', alPresionarTecla)
    return () => window.removeEventListener('keydown', alPresionarTecla)
  }, [onCerrar])

  return (
    <section className="map-ficha-escuela" aria-label={`Ficha de ${escuela.nombre}`}>
      <button ref={volverRef} className="map-ficha-escuela__back" type="button" onClick={onCerrar}>
        <ArrowLeft aria-hidden="true" />Volver a la lista
      </button>

      <header className="map-ficha-escuela__head">
        <h2>{escuela.nombre}</h2>
        <p>
          CUE {escuela.cueAnexo} · {etiquetaDepartamento(escuela.departamento)}
          {escuela.niveles.length > 0 && ` · ${escuela.niveles.join(', ')}`}
          {escuela.alumnos > 0 && ` · ${FORMATO_NUMERO.format(escuela.alumnos)} alumnos`}
        </p>
      </header>

      {escuela.gravedad > 0 ? (
        <div
          className="map-ficha-escuela__gravedad"
          style={{ backgroundColor: colorSeveridad(severidad), color: escuela.gravedad === 1 ? 'var(--ink)' : 'var(--white)' }}
        >
          <strong>Gravedad {severidad}</strong>
          <span>{categoria}{categoria && desde ? ' · ' : ''}{desde ? `desde ${tiempoRelativo(desde, ahoraMs)}` : ''}</span>
        </div>
      ) : (
        <p className="map-ficha-escuela__sin-reportes">Sin reportes abiertos</p>
      )}

      <FilaEstado escuela={escuela} />

      <div>
        <Desplegable titulo="Acceso" abierto>
          {acceso}
        </Desplegable>

        <Desplegable titulo="Clases y apoyo pedagógico" abierto={escuela.clases !== 'normal'}>
          <dl className="map-ficha-escuela__kv">
            <dt>Clases</dt><dd>{ETIQUETA_CLASES[escuela.clases]}</dd>
            <dt>Apoyo</dt><dd>{escuela.clases === 'normal' ? 'No corresponde' : etiquetaApoyoMapa(escuela.clases, escuela.apoyo) ?? 'Sin apoyo'}</dd>
            <dt>Alumnos</dt><dd>{FORMATO_NUMERO.format(escuela.alumnos)}</dd>
          </dl>
        </Desplegable>

        <Desplegable titulo={estado.fase === 'listo' ? `Situaciones (${afectaciones.length} ${afectaciones.length === 1 ? 'abierta' : 'abiertas'})` : 'Situaciones'}>
          {estado.fase === 'cargando' ? (
            <p role="status">Cargando…</p>
          ) : estado.fase === 'error' ? (
            <p role="alert">No se pudo cargar la información de la escuela.</p>
          ) : afectaciones.length === 0 ? (
            <p>Sin situaciones abiertas.</p>
          ) : (
            <>
              {afectaciones.map((afectacion) => (
                <dl className="map-ficha-escuela__kv" key={afectacion.id}>
                  <dt>Categoría</dt><dd>{CATEGORIA_META[afectacion.categoria].label}</dd>
                  {afectacion.descripcion && <><dt>Afecta</dt><dd>{afectacion.descripcion}</dd></>}
                  {novedad && <><dt>Última novedad</dt><dd>{novedad}</dd></>}
                  {mostrarEnlaceNominal && (
                    <dd className="map-ficha-escuela__accion">
                      <button type="button" className="map-ficha-escuela__link" onClick={() => onVerAlumnosAlcanzados(afectacion.id)}>
                        Ver alumnos alcanzados
                      </button>
                    </dd>
                  )}
                </dl>
              ))}
            </>
          )}
          <button type="button" className="map-ficha-escuela__link" onClick={onVerHistorialCompleto}>Ver historial</button>
        </Desplegable>

        <Desplegable titulo="Historial">
          {historial.fase === 'cargando' ? (
            <p role="status">Cargando…</p>
          ) : historial.fase === 'error' ? (
            <p role="alert">No se pudo cargar la información de la escuela.</p>
          ) : (
            <>
              {/* La cantidad de reportes iniciales dentro de 730 días es la aproximación disponible en el payload del historial. */}
              <p>{movimientosRecientes.length} {movimientosRecientes.length === 1 ? 'situación' : 'situaciones'} en los últimos 2 años</p>
              {movimientosRecientes.length > 0 && (
                <ol className="map-ficha-escuela__historial">
                  {movimientosRecientes.map((movimiento) => <HistorialMovimiento key={movimiento.id} movimiento={movimiento} />)}
                </ol>
              )}
            </>
          )}
        </Desplegable>
      </div>

      <a className="ui-button ui-button--secondary ui-button--sm" href={`/infraestructura/cargar?cue=${encodeURIComponent(escuela.cueAnexo)}`}>
        Cargar o actualizar el parte
      </a>
    </section>
  )
}
