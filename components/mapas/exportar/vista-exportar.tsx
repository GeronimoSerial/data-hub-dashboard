'use client'

import { useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import type { DataColumn, SortState } from '@/components/arc/sortable-data-table/sortable-data-table'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { MultiSelect } from '@/components/ui/multi-select'
import { Segmentado } from '@/components/mapas/segmentado'
import { EXPORTACIONES_ESCUELAS, TIPOS_EXPORTACION_ESCUELAS, type TipoExportacionEscuelas } from '@/lib/exportaciones/escuelas'
import { nombreArchivoExportacion } from '@/lib/exportaciones/solicitud'
import { urlExportacionEscuelas, type FiltrosExportacion } from '@/lib/exportaciones/url'
import { etiquetaGravedad } from '@/lib/infraestructura/mapa/etiquetas'
import { etiquetaHorizonteMotor, type HorizonteMotor } from '@/lib/infraestructura/mapa/radar'
import type { GravedadMapa } from '@/lib/infraestructura/mapa/tipos'
import { formatoFechaRegion } from '@/components/mapas/formato-fecha-region'
import { useIdioma, useTextos } from '@/lib/i18n/idioma-provider'
import type { Idioma } from '@/lib/i18n/idioma'
import { descargarExportacion } from './descarga'
import { usePrevia } from './use-previa'
import styles from './exportar.module.css'

const SortableDataTable = dynamic(
  () => import('@/components/arc/sortable-data-table/sortable-data-table').then(m => m.SortableDataTable),
  { loading: () => <CargaTabla /> },
)

function CargaTabla() {
  const t = useTextos()
  return <CargaExportacion titulo={t.estadisticas.exportar.cargandoTabla} detalle={t.estadisticas.exportar.preparandoVista} />
}

function CargaExportacion({ titulo, detalle }: { titulo: string; detalle: string }) {
  return (
    <div className={styles.carga} role="status">
      <span className={styles.spinner} aria-hidden="true" />
      <div><p className={styles.cargaTitulo}>{titulo}</p><p className={styles.nota}>{detalle}</p></div>
    </div>
  )
}
const HORIZONTES: readonly HorizonteMotor[] = [24, 72, 240]
const OPCIONES_ESTADO = TIPOS_EXPORTACION_ESCUELAS.map(tipo => ({ value: tipo, label: EXPORTACIONES_ESCUELAS[tipo].titulo }))
const GRAVEDADES: readonly GravedadMapa[] = [1, 2, 3, 4]
const TAMANOS_PAGINA = [25, 50, 100]

const FORMATO_NUMERO: Record<Idioma, Intl.NumberFormat> = {
  es: new Intl.NumberFormat('es-AR'),
  pt: new Intl.NumberFormat('pt-BR'),
}

function textoCelda(valor: unknown, clave: string, sinDato: string): string {
  if (valor === null || valor === undefined || valor === '') return sinDato
  if (clave === 'ultimaNovedad' && typeof valor === 'string') {
    const fecha = new Date(valor)
    if (Number.isFinite(fecha.getTime())) return formatoFechaRegion().format(fecha)
  }
  return String(valor)
}

export function VistaExportar() {
  const t = useTextos()
  const x = t.estadisticas.exportar
  const opcionesGravedad = useMemo(
    () => GRAVEDADES.map(gravedad => ({ value: String(gravedad), label: etiquetaGravedad(t, gravedad) })),
    [t],
  )
  const opcionesHorizonte = useMemo(
    () => HORIZONTES.map(valor => ({ valor, etiqueta: etiquetaHorizonteMotor(valor, t) })),
    [t],
  )
  const idioma = useIdioma()
  const [estados, setEstados] = useState<TipoExportacionEscuelas[]>([])
  const [departamentos, setDepartamentos] = useState<string[]>([])
  const [direcciones, setDirecciones] = useState<string[]>([])
  const [gravedades, setGravedades] = useState<string[]>([])
  const [horizonte, setHorizonte] = useState<HorizonteMotor>(72)
  const [pagina, setPagina] = useState(1)
  const [tamanoPagina, setTamanoPagina] = useState(25)
  const [orden, setOrden] = useState<SortState | null>(null)
  const [descargando, setDescargando] = useState(false)
  const [dialogoDescarga, setDialogoDescarga] = useState(false)
  const [errorDescarga, setErrorDescarga] = useState<string | null>(null)

  const filtros: FiltrosExportacion = {
    departamentos,
    direcciones: direcciones.map(Number),
    gravedades: gravedades.map(valor => Number(valor) as GravedadMapa),
  }
  const hayFiltros = estados.length > 0 || departamentos.length > 0 || direcciones.length > 0 || gravedades.length > 0
  const incluyeRiesgo = estados.includes('en-riesgo')
  const consulta = { estados, filtros, horizonte, orden }
  const urlDescarga = urlExportacionEscuelas({ ...consulta, formato: 'xlsx' })
  const urlPrevia = urlExportacionEscuelas({ ...consulta, formato: 'json', pagina, tamanoPagina })
  const { previa, cargando, error: errorPrevia, reintentar } = usePrevia(urlPrevia)
  const columnas = useMemo<DataColumn<Record<string, unknown>>[]>(() =>
    previa?.columnas.map(c => ({ key: c.clave, label: c.encabezado, render: valor => textoCelda(valor, c.clave, x.sinDato) })) ?? [],
  [previa?.columnas, x.sinDato])

  function reiniciarPagina() {
    setPagina(1)
    setOrden(null)
  }

  function limpiar() {
    setEstados([])
    setDepartamentos([])
    setDirecciones([])
    setGravedades([])
    setHorizonte(72)
    reiniciarPagina()
  }

  async function descargar() {
    setDescargando(true)
    setDialogoDescarga(true)
    setErrorDescarga(null)
    try {
      await descargarExportacion(urlDescarga, nombreArchivoExportacion(estados, new Date()))
    } catch (error) {
      setErrorDescarga(error instanceof Error ? error.message : x.errorDescarga)
    } finally {
      setDescargando(false)
      setDialogoDescarga(false)
    }
  }

  const totalPaginas = previa?.totalPaginas ?? 0
  const paginaVisible = previa?.pagina ?? pagina
  const inicio = previa && previa.filas.length > 0 ? (previa.pagina - 1) * previa.tamanoPagina + 1 : 0
  const fin = previa ? inicio + previa.filas.length - (inicio > 0 ? 1 : 0) : 0

  return (
    <div className={styles.vista}>
      <header className={styles.encabezado}>
        <h2>{x.titulo}</h2>
        <p className={styles.nota}>{x.descripcion}</p>
      </header>
      <div className={styles.barra} role="toolbar" aria-label={x.ariaFiltros}>
        <div className={`ui-field ${styles.campo}`}>
          <span className="ui-field__label">{x.estado}</span>
          <MultiSelect<TipoExportacionEscuelas>
            ariaLabel={x.estado} value={estados} options={OPCIONES_ESTADO} placeholder={x.todasEscuelas}
            onChange={valor => { setEstados(valor); reiniciarPagina() }}
          />
        </div>
        <div className={`ui-field ${styles.campo}`}>
          <span className="ui-field__label">Departamento</span>
          <MultiSelect
            ariaLabel="Departamento" value={departamentos} options={previa?.opciones.departamentos ?? []}
            placeholder={previa ? x.todosDepartamentos : x.cargandoDepartamentos}
            onChange={valor => { setDepartamentos(valor); reiniciarPagina() }}
          />
        </div>
        <div className={`ui-field ${styles.campo}`}>
          <span className="ui-field__label">{x.direccion}</span>
          <MultiSelect
            ariaLabel={x.direccion} value={direcciones} options={previa?.opciones.direcciones ?? []}
            placeholder={previa ? x.todasDirecciones : x.cargandoDirecciones}
            onChange={valor => { setDirecciones(valor); reiniciarPagina() }}
          />
        </div>
        <div className={`ui-field ${styles.campo}`}>
          <span className="ui-field__label">{x.gravedad}</span>
          <MultiSelect
            ariaLabel={x.gravedad} value={gravedades} options={opcionesGravedad} placeholder={x.todasGravedades}
            onChange={valor => { setGravedades(valor); reiniciarPagina() }}
          />
        </div>
        {incluyeRiesgo ? (
          <Segmentado<HorizonteMotor>
            etiqueta={x.horizonte} opciones={opcionesHorizonte} valor={horizonte}
            onChange={valor => { setHorizonte(valor); reiniciarPagina() }}
          />
        ) : null}
      </div>
      <div className={styles.acciones}>
        <Button type="button" onClick={() => void descargar()} disabled={descargando} aria-busy={descargando || undefined}>
          {descargando ? x.preparandoArchivo : x.descargarExcel}
        </Button>
        {hayFiltros ? <Button type="button" variant="ghost" onClick={limpiar}>{x.limpiar}</Button> : null}
        <span className={styles.nota}>{x.notaExcel}</span>
      </div>
      {errorDescarga ? <p className={styles.error} role="alert">{errorDescarga}</p> : null}
      <Dialog open={dialogoDescarga} onOpenChange={setDialogoDescarga}>
        <DialogContent className={styles.dialogoCarga}>
          <span className={styles.spinner} aria-hidden="true" />
          <DialogTitle>{x.dialogoTitulo}</DialogTitle>
          <DialogDescription>{x.dialogoDescripcion}</DialogDescription>
          <p className={styles.nota}>{x.dialogoCerrar}</p>
        </DialogContent>
      </Dialog>

      <section className={styles.previa} aria-label={x.ariaPrevia} aria-busy={cargando}>
        {errorPrevia ? (
          <div role="alert" className={styles.error}>
            {x.errorPrevia} <Button variant="secondary" onClick={reintentar}>{x.reintentar}</Button>
          </div>
        ) : null}
        {cargando ? (
          <div className={styles.cargaVelo}>
            <CargaExportacion titulo={previa ? x.actualizandoResultados : x.cargandoEscuelas} detalle={x.preparandoPagina(pagina)} />
          </div>
        ) : null}
        {!errorPrevia && previa ? (
          <>
            <div className={styles.resumen}>
              <div className={styles.totales} role="status">
                <p className={styles.conteo}>{x.conteoEscuelas(previa.total)}</p>
                <p className={styles.nota}>{x.totalAlumnos(FORMATO_NUMERO[idioma].format(previa.totalAlumnos))}</p>
              </div>
              <label className={styles.tamano}>
                {x.filasPorPagina}
                <select value={tamanoPagina} disabled={cargando} onChange={evento => {
                  setTamanoPagina(Number(evento.target.value)); setPagina(1)
                }}>
                  {TAMANOS_PAGINA.map(tamano => <option key={tamano} value={tamano}>{tamano}</option>)}
                </select>
              </label>
            </div>
            <fieldset className={styles.tablaWrap} disabled={cargando}>
              <legend className="sr-only">{x.ariaEscuelasFiltradas}</legend>
              <SortableDataTable
                rows={previa.filas} columns={columnas} rowKey="cue" caption={x.tablaEscuelas}
                emptyMessage={x.sinResultados}
                sort={orden} manualSorting onSortChange={valor => { setOrden(valor); setPagina(1) }}
              />
            </fieldset>
            <nav className={styles.paginacion} aria-label={x.ariaPaginacion}>
              <span className={styles.nota}>{x.rango(inicio, fin, previa.total)}</span>
              <div className={styles.paginas}>
                <Button variant="secondary" disabled={cargando || paginaVisible <= 1} onClick={() => setPagina(paginaVisible - 1)}>Anterior</Button>
                <span>{x.paginaDe(paginaVisible, Math.max(1, totalPaginas))}</span>
                <Button variant="secondary" disabled={cargando || paginaVisible >= totalPaginas} onClick={() => setPagina(paginaVisible + 1)}>{x.siguiente}</Button>
              </div>
            </nav>
          </>
        ) : null}
      </section>
    </div>
  )
}
