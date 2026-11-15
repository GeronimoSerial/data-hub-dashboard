'use client'

import { etiquetaClases, etiquetaFuncionamiento, tieneServicioInformado } from '@/lib/infraestructura/funcionamiento'
import { derivarClases } from '@/lib/infraestructura/mapa/enriquecer'
import { ImpactoAlumnosResumen } from '@/components/infraestructura/impacto-alumnos-resumen'
import { useIdioma, useTextos } from '@/lib/i18n/idioma-provider'
import { localeNumero } from '@/lib/i18n/formato-numero'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { BookMinus, BookX, ChevronDown, Clock, DoorOpen, House, Utensils, X } from 'lucide-react'
import { ETIQUETA_COMEDOR } from '@/lib/infraestructura/comedores/estado'
import { EstadoActualSeveridad, TINTA_POR_SEVERIDAD } from '@/components/infraestructura/estado-actual-severidad'
import { ETIQUETA_ESTABLECIMIENTO, resumirAlcance } from '@/components/infraestructura/estado-actual-textos'
import { formatearMomentoHistorial } from '@/components/infraestructura/historial-formato'
import { CATEGORIA_META, esCategoria, type CategoriaAfectacion } from '@/lib/infraestructura/categorias'
import { contar } from '@/lib/infraestructura/parte/instituto-ui'
import { colorSeveridad } from '@/lib/infraestructura/severidad'
import { presentarJustificacionCritica } from '@/lib/infraestructura/justificacion-critica'
import { prioridadEfectiva } from '@/lib/infraestructura/prioridad-alumnos'
import { etiquetaDepartamento } from '@/lib/infraestructura/mapa/etiquetas'
import { etiquetaApoyoMapa, valorApoyoMapa } from '@/lib/infraestructura/mapa/etiqueta-apoyo'
import { tiempoRelativo } from '@/lib/infraestructura/mapa/tiempo-relativo'
import type { EscuelaMapaEnriquecida } from '@/lib/infraestructura/mapa/tipos'
import type { DatosInstitutoMapa } from '@/lib/infraestructura/parte-mapa'
import { SEVERIDADES } from '@/lib/infraestructura/validacion'
import { useFichaParte } from '@/lib/infraestructura/use-ficha-parte'
import { LineaDeTiempo } from '@/components/infraestructura/linea-de-tiempo'
import { FichaTerritorial, type EstadoVistaPeligro } from '@/components/infraestructura/ficha-territorial'
import { RiesgoEscuela } from '@/components/infraestructura/riesgo-escuela'
import type { HorizonteMotor } from '@/lib/infraestructura/mapa/radar'
import { situacionPrincipal } from '@/lib/infraestructura/relevancia'
import { desde } from '@/components/infraestructura/actualizar/entrada-actualizar'
import { BorradoresPendientes } from '@/components/infraestructura/borradores/borradores-pendientes'
import { GaleriaEvidencia } from '@/components/infraestructura/fotos/galeria-evidencia'
import { VistaPreviaEscuela, type VistaPreviaEscuelaProps } from './vista-previa-escuela'
import type { NivelAislamientoMapa } from '@/lib/infraestructura/territorio-mapa'
import { ObservacionReporte } from './observacion-reporte'

interface FichaEscuelaPanelProps {
  escuela: EscuelaMapaEnriquecida & Partial<DatosInstitutoMapa>
  acceso: ReactNode
  /** Botón del camino al centro de evacuados: visible en la vista previa y en la ficha, fuera del pliegue Acceso. */
  centroEvacuados?: ReactNode
  mostrarEnlaceNominal: boolean
  onCerrar: () => void
  onVerAlumnosAlcanzados: (afectacionId: string) => void
  onVerHistorialCompleto: () => void
  /** Mismo horizonte que la lista y los marcadores del Radar. */
  horizonteRiesgo?: HorizonteMotor
  /** Mismo nivel que la lista de Planificación para la vista activa. */
  planificacion?: { etiquetaVista: string; etiquetaNivel: string }[] | null
  borradoresServerCount?: number | null
  urlFichaCompleta?: string
  onAbrirFichaCompleta?: () => void
  onQuitarSeleccion?: () => void
  extraVistaPrevia?: ReactNode
  aislamiento?: NivelAislamientoMapa | null
  distanciaLocalidad?: VistaPreviaEscuelaProps['distanciaLocalidad']
}

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

function FilaEstado({ escuela }: { escuela: EscuelaMapaEnriquecida }) {
  const t = useTextos()
  const etiquetaApoyo = etiquetaApoyoMapa(escuela.clases, escuela.apoyo, t)
  return (
    <div className="map-sitact__chips map-ficha-escuela__chips" aria-label={t.fichaPanel.estadoEscuela}>
      {escuela.clases === 'normal' ? (
        <span className={`map-sitact__pill ${escuela.clasesInformadas ? 'map-sitact__pill--ok' : 'map-sitact__pill--neutro'}`}>{etiquetaClases('normal', escuela.clasesInformadas === true, t)}</span>
      ) : (
        <span className="map-sitact__pill map-sitact__pill--clases">
          <IconoClases estado={escuela.clases} />{etiquetaClases(escuela.clases, escuela.clasesInformadas === true, t)}
        </span>
      )}
      {etiquetaApoyo && (
        <span className={`map-sitact__pill ${escuela.apoyo === 'no' ? 'map-sitact__pill--aviso' : escuela.apoyo === 'sin_dato' ? 'map-sitact__pill--neutro' : 'map-sitact__pill--apoyo'}`}>
          {etiquetaApoyo}
        </span>
      )}
      {escuela.sinActualizar && (
        <span className="map-sitact__pill map-sitact__pill--neutro"><Clock aria-hidden="true" />{t.fichaPanel.sinActualizar}</span>
      )}
      {escuela.comedor !== undefined && (
        <span className={`map-sitact__pill ${escuela.comedor === 'sin_servicio' ? 'map-sitact__pill--neutro' : 'map-sitact__pill--apoyo'}`}>
          <Utensils aria-hidden="true" />{ETIQUETA_COMEDOR[escuela.comedor]}
        </span>
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
  centroEvacuados = null,
  mostrarEnlaceNominal,
  onCerrar,
  onVerAlumnosAlcanzados,
  onVerHistorialCompleto,
  horizonteRiesgo = 72,
  planificacion = null,
  borradoresServerCount = null,
  urlFichaCompleta,
  onAbrirFichaCompleta,
  onQuitarSeleccion,
  extraVistaPrevia = null,
  aislamiento = null,
  distanciaLocalidad = null,
}: FichaEscuelaPanelProps) {
  const t = useTextos()
  const idioma = useIdioma()
  const FORMATO_NUMERO = useMemo(() => new Intl.NumberFormat(localeNumero(idioma)), [idioma])
  const { estado, historial } = useFichaParte(escuela.cueAnexo)
  const tituloRef = useRef<HTMLHeadingElement>(null)
  const [ahoraMs] = useState(() => Date.now())
  const datos = estado.fase === 'listo' ? estado.datos : null
  const afectaciones = datos?.afectaciones ?? []
  const situacionesFuncionamiento = datos ? afectaciones : escuela.parte?.afectaciones ?? []
  const recientes = datos?.recientes ?? []
  const edificioActual = datos
    ? (afectaciones.some((a) => a.categoria === 'establecimiento') ? datos.parte?.estadoEstablecimiento ?? 'habitual' : 'habitual')
    : escuela.parte?.estadoEstablecimiento ?? 'habitual'
  const clasesActuales = datos ? derivarClases(edificioActual, datos.servicio?.estadoGeneral ?? 'normal') : escuela.clases
  const carrerasActuales = datos && 'carreras' in datos && Array.isArray(datos.carreras) ? datos.carreras.map((c) => c.id as number) : []
  const clasesInformadas = datos
    ? tieneServicioInformado(datos.servicio?.alcanceVigente ?? [], datos.secciones ?? [], carrerasActuales) || ['sin_clases', 'evacuado', 'centro_evacuados'].includes(edificioActual)
    : escuela.clasesInformadas === true
  const escuelaActual = { ...escuela, clases: clasesActuales, clasesInformadas }

  const principal = situacionPrincipal(afectaciones.map((afectacion) => ({
    ...afectacion,
    estadoEstablecimiento: datos?.parte?.estadoEstablecimiento ?? 'habitual',
  })))
  const categoria = principal
    ? CATEGORIA_META[principal.categoria].label
    : etiquetaCategoria(escuela.categoriaPrincipal)
  const severidad = datos
    ? (principal ? prioridadEfectiva(principal) : null)
    : escuela.gravedad === 0 ? null : SEVERIDADES[escuela.gravedad - 1]
  const novedad = datos?.parte?.actualizadaEn
    ? tiempoRelativo(datos.parte.actualizadaEn, ahoraMs)
    : ''
  useEffect(() => {
    tituloRef.current?.focus()
    const alPresionarTecla = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCerrar()
    }
    window.addEventListener('keydown', alPresionarTecla)
    return () => window.removeEventListener('keydown', alPresionarTecla)
  }, [onCerrar])

  if (urlFichaCompleta) {
    return (
      <VistaPreviaEscuela
        escuela={{
          ...escuelaActual,
          parte: datos?.parte
            ? {
                parteId: datos.parte.id,
                cueAnexo: escuela.cueAnexo,
                nombre: escuela.nombre,
                departamento: escuela.departamento,
                localidad: escuela.localidad,
                lat: escuela.lat,
                lon: escuela.lon,
                servicio:
                  datos?.servicio?.estadoGeneral ??
                  escuela.parte?.servicio ??
                  (escuela.clases === 'normal'
                    ? 'normal'
                    : escuela.clases === 'parcial'
                    ? 'parcial'
                    : 'suspendido'),
                servicioInformado: clasesInformadas,
                estadoEstablecimiento: datos.parte.estadoEstablecimiento,
                peorSeveridad: severidad ?? '',
                categorias: Array.from(
                  new Set(afectaciones.map((a) => a.categoria)),
                ) as CategoriaAfectacion[],
                afectaciones: afectaciones.map((a) => ({
                  id: a.id,
                  motivo: a.motivo,
                  categoria: a.categoria,
                  severidad: a.severidad,
                  ...(a.justificacionCritica
                    ? {
                        justificacionCritica: a.justificacionCritica,
                        ...(a.justificacionCritica === 'otro' && a.justificacionCriticaDetalle
                          ? { justificacionCriticaDetalle: a.justificacionCriticaDetalle }
                          : {}),
                      }
                    : {}),
                  impactoAlumnos: a.impactoAlumnos,
                  descripcion: a.descripcion,
                  rigeDesde: a.rigeDesde,
                  creadaEn: a.creadaEn,
                })),
                seccionesAlcanzadas: afectaciones.reduce((acc, a) => acc + (a.totales.secciones ?? 0), 0),
                alumnosDelHecho: datos.alumnosUnicos ?? afectaciones.reduce((acc, a) => acc + (a.totales.alumnos ?? 0), 0),
                alumnosAlcanzados: escuela.alumnos,
                rigeDesde: datos.parte.actualizadaEn,
                actualizadaEn: datos.parte.actualizadaEn,
              }
            : datos ? undefined : escuela.parte,
          ubicacionDisponible: escuela.lat !== null && escuela.lon !== null,
        }}
        urlFichaCompleta={urlFichaCompleta}
        onCerrarVistaPrevia={onCerrar}
        onQuitarSeleccion={onQuitarSeleccion ?? (() => {})}
        extra={<>{extraVistaPrevia}{centroEvacuados}</>}
        aislamiento={aislamiento}
        distanciaLocalidad={distanciaLocalidad}
        onAbrirFichaCompleta={onAbrirFichaCompleta}
        cargandoParte={estado.fase === 'cargando'}
      />
    )
  }

  return (
    <section className="map-ficha-escuela" aria-label={`Ficha de ${escuela.nombre}`}>
      <div className="map-ficha-escuela__encabezado-fijo">
        <button className="map-cerrar map-ficha-escuela__cerrar" type="button" aria-label={t.fichaPanel.cerrarFicha} onClick={onCerrar}>
          <X aria-hidden="true" />
        </button>

        <header className="map-ficha-escuela__head">
          <h2 ref={tituloRef} tabIndex={-1}>{escuela.nombre}</h2>
          <p>
            CUE {escuela.cueAnexo} · {etiquetaDepartamento(escuela.departamento)}
            {escuela.carreras !== undefined
              ? ` · ${contar(escuela.carreras, 'carrera', 'carreras')}`
              : escuela.niveles.length > 0 && ` · ${escuela.niveles.join(', ')}`}
            {escuela.alumnos > 0 && ` · ${t.fichaPanel.alumnosConteo(FORMATO_NUMERO.format(escuela.alumnos))}`}
          </p>
        </header>
      </div>

      {severidad ? (
        <div
          className="map-ficha-escuela__gravedad"
          style={{ backgroundColor: colorSeveridad(severidad), color: TINTA_POR_SEVERIDAD[severidad] }}
        >
          <strong>{(principal?.categoria ?? escuela.categoriaPrincipal) === 'alumnos' ? t.fichaPanel.prioridad : t.fichaPanel.gravedad} {severidad}</strong>
          <span>{principal ? `${categoria} · desde ${desde(principal.rigeDesde)}` : categoria}</span>
        </div>
      ) : (
        <p className="map-ficha-escuela__sin-reportes">{afectaciones.length ? t.fichaPanel.sinDatosPrioridad : t.fichaPanel.sinSituacionesAbiertas}</p>
      )}

      <p>{etiquetaFuncionamiento(situacionesFuncionamiento)}</p>
      <FilaEstado escuela={escuelaActual} />

      <GaleriaEvidencia cue={escuela.cueAnexo} />

      <RiesgoEscuela cueAnexo={escuela.cueAnexo} horizonte={horizonteRiesgo} planificacion={planificacion} />

      {centroEvacuados}

      <div>
        <Desplegable titulo={t.fichaPanel.acceso} abierto>
          {acceso}
        </Desplegable>

        <Desplegable titulo={t.fichaPanel.clasesYAsistencia} abierto={clasesActuales !== 'normal'}>
          <dl className="map-ficha-escuela__kv">
            <dt>{t.fichaPanel.clases}</dt><dd>{etiquetaClases(clasesActuales, clasesInformadas)}</dd>
            <dt>{t.fichaPanel.asistenciaPedagogica}</dt><dd>{valorApoyoMapa(clasesActuales, escuela.apoyo) ?? t.fichaPanel.noCorresponde}</dd>
            <dt>{t.fichaPanel.alumnos}</dt><dd>{FORMATO_NUMERO.format(escuela.alumnos)}</dd>
            {datos?.parte && afectaciones.some((afectacion) => afectacion.categoria === 'establecimiento') && <><dt>{t.fichaPanel.edificio}</dt><dd>{ETIQUETA_ESTABLECIMIENTO[datos.parte.estadoEstablecimiento]}</dd></>}
          </dl>
        </Desplegable>

        <Desplegable titulo={estado.fase === 'listo' ? t.fichaPanel.situacionesConteo(afectaciones.length) : t.ficha.situacionesSeccion}>
          {estado.fase === 'cargando' ? (
            <p role="status">{t.fichaPanel.cargando}</p>
          ) : estado.fase === 'error' ? (
            <p role="alert">{t.fichaPanel.errorCarga}</p>
          ) : afectaciones.length === 0 ? (
            <p>{t.fichaPanel.sinSituacionesAbiertasLista}</p>
          ) : (
            <>
              {afectaciones.map((afectacion) => {
                  const causadaPor = afectaciones.find((otra) => otra.id === afectacion.causadaPorId)
                  const rigeDesde = formatearMomentoHistorial(afectacion.rigeDesde).replace(/^Hoy/, 'hoy')
                  const justificacionCritica = presentarJustificacionCritica(afectacion)
                return (
                  <div className="map-ficha-escuela__situacion" key={afectacion.id}>
                    <h3>{afectacion.motivo}</h3>
                    {afectacion.categoria === 'alumnos' ? <ImpactoAlumnosResumen impacto={afectacion.impactoAlumnos} /> : <EstadoActualSeveridad severidad={afectacion.severidad} />}
                    <dl className="map-ficha-escuela__kv">
                      <dt>Alcance</dt><dd>{resumirAlcance(afectacion.totales)}</dd>
                      {rigeDesde && <><dt>Desde</dt><dd>{rigeDesde}</dd></>}
                      {causadaPor && <><dt>Causada por</dt><dd>{causadaPor.motivo}</dd></>}
                      {justificacionCritica && <><dt>{t.fichaPanel.justificacionGravedad}</dt><dd>{justificacionCritica.etiqueta}</dd></>}
                      {justificacionCritica?.detalle && <><dt>{t.fichaPanel.detalleJustificacion}</dt><dd>{justificacionCritica.detalle}</dd></>}
                      <dt>{t.fichaPanel.categoria}</dt><dd>{CATEGORIA_META[afectacion.categoria].label}</dd>
                      {mostrarEnlaceNominal && escuela.carreras === undefined && (
                        <dd className="map-ficha-escuela__accion">
                          <button type="button" className="map-ficha-escuela__link" onClick={() => onVerAlumnosAlcanzados(afectacion.id)}>
                            {t.fichaPanel.verAlumnosAlcanzados}
                          </button>
                        </dd>
                      )}
                    </dl>
                    <ObservacionReporte texto={afectacion.descripcion} />
                  </div>
                )
              })}
            </>
          )}
          {datos?.parte && novedad && <p><strong>{t.fichaPanel.ultimaNovedad}</strong> {novedad}</p>}
          <button type="button" className="map-ficha-escuela__link" onClick={onVerHistorialCompleto}>{t.fichaPanel.verHistorial}</button>
        </Desplegable>

        {borradoresServerCount !== null && borradoresServerCount > 0 && (
          <BorradoresPendientes key={escuela.cueAnexo} cue={escuela.cueAnexo} count={borradoresServerCount} />
        )}

        {recientes.length > 0 && (
          <Desplegable titulo={t.fichaPanel.solucionadasRecientes(recientes.length)} abierto={afectaciones.length === 0}>
            {recientes.map((solucionada) => {
              const retiradaEn = formatearMomentoHistorial(solucionada.retiradaEn).replace(/^Hoy/, 'hoy')
              return (
                <div className="map-ficha-escuela__situacion" key={solucionada.id}>
                  <h3>{solucionada.motivo}</h3>
                  <dl className="map-ficha-escuela__kv">
                    <dt>{t.fichaPanel.gravedadQueTenia}</dt><dd><EstadoActualSeveridad severidad={solucionada.severidad} prefijo={false} /></dd>
                    <dt>{t.fichaPanel.solucionada}</dt><dd>{retiradaEn}</dd>
                  </dl>
                </div>
              )
            })}
          </Desplegable>
        )}

        <Desplegable titulo={t.fichaPanel.historial}>
          {historial.fase === 'cargando' ? (
            <p role="status">{t.fichaPanel.cargando}</p>
          ) : historial.fase === 'error' ? (
            <p role="alert">{t.fichaPanel.errorCarga}</p>
          ) : (
            <>
              <p>{escuela.situacionesHistoricas === 0
                ? t.fichaPanel.sinSituacionesRegistradas
                : t.fichaPanel.situacionesRegistradas(escuela.situacionesHistoricas)}</p>
              {historial.movimientos.length > 0 && <LineaDeTiempo movimientos={historial.movimientos} limite={5} />}
            </>
          )}
        </Desplegable>

        <SeccionPeligro cueAnexo={escuela.cueAnexo} localidad={escuela.localidad} />
      </div>

      {urlFichaCompleta && (
        <Link
          className="ui-button ui-button--default ui-button--sm"
          href={urlFichaCompleta}
          onClick={onAbrirFichaCompleta}
          data-testid="abrir-ficha-completa"
        >
          {t.ficha.vistaPrevia.abrirFichaCompleta}
        </Link>
      )}

      <a className="ui-button ui-button--secondary ui-button--sm" href={`/infraestructura/cargar?cue=${encodeURIComponent(escuela.cueAnexo)}`}>
        {escuela.gravedad > 0 || afectaciones.length > 0 ? t.ficha.actualizarParte : t.ficha.cargarSituacion}
      </a>

      {onQuitarSeleccion && (
        <button
          type="button"
          className="map-ficha-escuela__link"
          onClick={onQuitarSeleccion}
          data-testid="preview-quitar-seleccion"
        >
          {t.fichaPanel.quitarSeleccion}
        </button>
      )}
    </section>
  )
}

function SeccionPeligro({ cueAnexo, localidad }: { cueAnexo: string; localidad: string }) {
  const t = useTextos()
  const [estadoPeligro, setEstadoPeligro] = useState<EstadoVistaPeligro>('cargando')
  return (
    <section className="map-ficha-escuela__situacion">
      <details open={estadoPeligro !== 'sin_datos'}>
        <summary>
          <h3>{t.fichaPanel.lluviaYRio}</h3>
        </summary>
        <FichaTerritorial cueAnexo={cueAnexo} localidad={localidad} onEstado={setEstadoPeligro} />
      </details>
    </section>
  )
}
