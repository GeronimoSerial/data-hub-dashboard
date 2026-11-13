'use client'

import { ImpactoAlumnosResumen } from '@/components/infraestructura/impacto-alumnos-resumen'

import { useMemo, useState, type ReactNode } from 'react'
import { BookMinus, BookX, Check, Clock, DoorOpen, House } from 'lucide-react'
import { colorSeveridad } from '@/lib/infraestructura/severidad'
import { etiquetaDepartamento } from '@/lib/infraestructura/mapa/etiquetas'
import { ordenarReportes, resumir } from '@/lib/infraestructura/mapa/agregar'
import { tiempoRelativo } from '@/lib/infraestructura/mapa/tiempo-relativo'
import { etiquetaApoyoMapa } from '@/lib/infraestructura/mapa/etiqueta-apoyo'
import { severidadDeGravedad } from '@/lib/infraestructura/mapa/gravedad'
import type { EscuelaMapaEnriquecida } from '@/lib/infraestructura/mapa/tipos'
import { detalleNivelOInstituto } from '@/lib/infraestructura/mapa/etiquetas'
import { formatoFechaRegion } from '@/components/mapas/formato-fecha-region'
import { useIdioma, useTextos } from '@/lib/i18n/idioma-provider'
import { localeNumero } from '@/lib/i18n/formato-numero'
import { panelesMapaEs } from '@/lib/i18n/diccionarios/grupos/panelesMapa.es'
import type { Diccionario } from '@/lib/i18n/diccionarios/tipos'

/** " · " más el detalle de la escuela, o nada si no tiene. */
function textoDetalle(escuela: EscuelaMapaEnriquecida, dic: Diccionario): string {
  const detalle = detalleNivelOInstituto(escuela, dic)
  return detalle ? ` · ${detalle}` : ''
}

interface PanelSituacionActualProps {
  escuelas: EscuelaMapaEnriquecida[]
  actualizadoEn: string | null
  onSeleccionar: (cueAnexo: string) => void
  /** Extra sections rendered at the end of the panel (e.g. reported events). */
  secciones?: ReactNode
}

const OPCIONES_HORA: Intl.DateTimeFormatOptions = {
  hourCycle: 'h23',
  hour: '2-digit',
  minute: '2-digit',
}

const OPCIONES_FECHA: Intl.DateTimeFormatOptions = {
  day: 'numeric',
  month: 'short',
}

type FiltroLista = 'todas' | 'sinClases' | 'sinActualizar'

type Textos = Diccionario['panelesMapa']

const IDS_FILTRO_LISTA: FiltroLista[] = ['todas', 'sinClases', 'sinActualizar']

function cumpleFiltro(escuela: EscuelaMapaEnriquecida, filtro: FiltroLista): boolean {
  if (filtro === 'sinClases') return escuela.clases !== 'normal'
  if (filtro === 'sinActualizar') return escuela.sinActualizar
  return true
}
export function horaActualizacion(iso: string, ahoraMs: number, t: Textos = panelesMapaEs): string {
  const fecha = new Date(iso)
  if (!Number.isFinite(fecha.getTime())) return ''

  const diaFormato = formatoFechaRegion()
  const hoy = diaFormato.format(new Date(ahoraMs))
  const dia = diaFormato.format(fecha)
  if (hoy === dia) return t.sitHoy(formatoFechaRegion(OPCIONES_HORA).format(fecha))
  // Shows today's date but keeps the last report date visible so stale data is not mistaken for current.
  return t.sitHoyUltimoParte(formatoFechaRegion(OPCIONES_FECHA).format(new Date(ahoraMs)), formatoFechaRegion(OPCIONES_FECHA).format(fecha))
}

function IconoClases({ estado }: { estado: EscuelaMapaEnriquecida['clases'] }) {
  if (estado === 'sin') return <BookX aria-hidden="true" />
  if (estado === 'parcial') return <BookMinus aria-hidden="true" />
  if (estado === 'evacuado') return <DoorOpen aria-hidden="true" />
  if (estado === 'centro') return <House aria-hidden="true" />
  return null
}

function chipsEscuela(escuela: EscuelaMapaEnriquecida, dic: Diccionario) {
  const t = dic.panelesMapa
  const apoyo = etiquetaApoyoMapa(escuela.clases, escuela.apoyo, dic)
  return (
    <span className="map-sitact__chips">
      {escuela.clases !== 'normal' && (
        <span className="map-sitact__pill map-sitact__pill--clases">
          <IconoClases estado={escuela.clases} />
          {t.sitClases[escuela.clases]}
        </span>
      )}
      {apoyo && (
        <span className={`map-sitact__pill ${escuela.apoyo === 'no' ? 'map-sitact__pill--aviso' : escuela.apoyo === 'sin_dato' ? 'map-sitact__pill--neutro' : 'map-sitact__pill--apoyo'}`}>
          {apoyo}
        </span>
      )}
      {escuela.sinActualizar && (
        <span className="map-sitact__pill map-sitact__pill--neutro">
          <Clock aria-hidden="true" />
          {t.sitSinActualizar}
        </span>
      )}
    </span>
  )
}

export function PanelSituacionActual({ escuelas, onSeleccionar, secciones }: PanelSituacionActualProps) {
  const [ahoraMs] = useState(() => Date.now())
  const [filtro, setFiltro] = useState<FiltroLista>('todas')
  const dic = useTextos()
  const t = dic.panelesMapa
  const idioma = useIdioma()
  const FORMATO_NUMERO = useMemo(() => new Intl.NumberFormat(localeNumero(idioma)), [idioma])
  const etiquetasFiltro: Record<FiltroLista, string> = {
    todas: 'Todas',
    sinClases: t.sitFiltroSinClases,
    sinActualizar: t.sitSinActualizar,
  }
  const resumen = resumir(escuelas)
  const abiertas = ordenarReportes(escuelas).filter((escuela) => escuela.gravedad > 0 || (escuela.parte?.afectaciones.length ?? 0) > 0)
  const reportes = abiertas.filter((escuela) => cumpleFiltro(escuela, filtro))
  const solucionadasRecientes = escuelas
    .filter((escuela) => escuela.solucionadasRecientes > 0 && escuela.gravedad === 0 && !(escuela.parte?.afectaciones.length))
    .sort((a, b) => {
      if (a.ultimaNovedad === null && b.ultimaNovedad !== null) return 1
      if (a.ultimaNovedad !== null && b.ultimaNovedad === null) return -1
      if (a.ultimaNovedad !== b.ultimaNovedad) return (b.ultimaNovedad ?? '').localeCompare(a.ultimaNovedad ?? '')
      return a.nombre.localeCompare(b.nombre, 'es')
    })

  return (
    <section className="map-sitact" aria-label={t.sitAriaPanel} data-testid="panel-situacion-actual">
      <div className="map-sitact__kpis" aria-label={t.sitAriaResumen}>
        <div className="map-sitact__kpi map-sitact__kpi--resaltado">
          <span>{t.sitSinClases}</span>
          <strong>{FORMATO_NUMERO.format(resumen.sinClases)}</strong>
          <small>{t.sitDeAbiertas(FORMATO_NUMERO.format(resumen.conReporte))}</small>
        </div>
        <div className="map-sitact__kpi">
          <span>{t.sitAlumnosSinClases}</span>
          <strong>{FORMATO_NUMERO.format(resumen.alumnosSinClases)}</strong>
          <small>{t.sitSinClasesPresenciales}</small>
        </div>
      </div>

      <dl className="map-sitact__secundarios">
        <div>
          <dt>{t.sitSinActualizar}</dt>
          <dd>{FORMATO_NUMERO.format(resumen.sinActualizar)}</dd>
        </div>
        {resumen.sinClases > 0 && (
          <div className="map-sitact__apoyo">
            <dt>{t.sitConApoyo}</dt>
            <dd>{resumen.sinClasesConApoyo} de {resumen.sinClases}</dd>
            {resumen.sinClasesSinDato > 0 && <dd className="map-sitact__atenuado">{t.sitSinDato(resumen.sinClasesSinDato)}</dd>}
          </div>
        )}
      </dl>

      <section className="map-sitact__reportes" aria-labelledby="map-sitact-reportes-titulo">
        <h3 id="map-sitact-reportes-titulo" className="map-sitact__titulo-seccion">
          <span>{t.sitAfectadas}</span><span className="map-sitact__atenuado">{t.sitAbiertas(FORMATO_NUMERO.format(abiertas.length))}</span>
        </h3>
        {abiertas.length > 0 && (
          <div className="map-sitact__filtros" role="group" aria-label={t.sitAriaFiltrar}>
            {IDS_FILTRO_LISTA.map((id) => (
              <button
                key={id}
                type="button"
                className="map-sitact__filtro"
                aria-pressed={filtro === id}
                onClick={() => setFiltro(id)}
              >
                {etiquetasFiltro[id]}
              </button>
            ))}
          </div>
        )}
        {reportes.length > 0 ? (
          <div className="map-sitact__lista">
            {reportes.map((escuela) => {
              const severidad = severidadDeGravedad(escuela.gravedad)
              const nivel = textoDetalle(escuela, dic)
              const novedad =escuela.ultimaNovedad ? tiempoRelativo(escuela.ultimaNovedad, ahoraMs) : ''
              const departamento = etiquetaDepartamento(escuela.departamento)
              return (
                <button
                  key={escuela.cueAnexo}
                  type="button"
                  className="map-sitact__fila"
                  onClick={() => onSeleccionar(escuela.cueAnexo)}
                  aria-label={`${escuela.nombre}, ${departamento}${nivel}`}
                >
                  <span
                    className="map-sitact__franja"
                    style={severidad ? { backgroundColor: colorSeveridad(severidad) } : undefined}
                  />
                  <span className="map-sitact__contenido-fila">
                    <span className="map-sitact__nombre" title={escuela.nombre}>{escuela.nombre}</span>
                    <span className="map-sitact__meta-fila">
                      <span className="map-sitact__meta">{departamento}{nivel}</span>
                      {novedad && <span className="map-sitact__cuando">{novedad}</span>}
                    </span>
                    {escuela.impactoAlumnos && <span className="map-sitact__meta"><ImpactoAlumnosResumen impacto={escuela.impactoAlumnos} /></span>}
                    {chipsEscuela(escuela, dic)}
                  </span>
                </button>
              )
            })}
          </div>
        ) : abiertas.length > 0 ? (
          <p className="map-sitact__vacio">{t.sitVacioFiltro}</p>
        ) : solucionadasRecientes.length === 0 ? (
          <p className="map-sitact__vacio">{t.sitVacioAbiertas}</p>
        ) : null}
      </section>

      {solucionadasRecientes.length > 0 && (
        <details className="map-sitact__plegable">
          <summary className="map-sitact__titulo-seccion">
            <span>{t.sitSolucionadas}</span>
            <span className="map-sitact__atenuado">{FORMATO_NUMERO.format(solucionadasRecientes.length)}</span>
          </summary>
          <div className="map-sitact__lista">
            {solucionadasRecientes.map((escuela) => {
              const nivel = textoDetalle(escuela, dic)
              const departamento =etiquetaDepartamento(escuela.departamento)
              return (
                <button
                  key={escuela.cueAnexo}
                  type="button"
                  className="map-sitact__fila"
                  onClick={() => onSeleccionar(escuela.cueAnexo)}
                  aria-label={`${escuela.nombre}, ${departamento}${nivel}`}
                >
                  <span className="map-sitact__franja" aria-hidden="true" />
                  <span className="map-sitact__contenido-fila">
                    <span className="map-sitact__nombre" title={escuela.nombre}>{escuela.nombre}</span>
                    <span className="map-sitact__meta">{departamento}{nivel}</span>
                    <span className="map-sitact__chips">
                      <span className="map-sitact__pill map-sitact__pill--ok">
                        <Check aria-hidden="true" />{t.sitSolucionadaReciente}
                      </span>
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
        </details>
      )}

      {secciones}
    </section>
  )
}
