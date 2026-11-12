'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import { Segmentado } from '@/components/mapas/segmentado'
import { agrupar, resumir, type AgruparPor } from '@/lib/infraestructura/mapa/agregar'
import { etiquetaDepartamento } from '@/lib/infraestructura/mapa/etiquetas'
import { CATEGORIA_META, esCategoria } from '@/lib/infraestructura/categorias'
import type { EscuelaMapaEnriquecida, FiltrosMapa } from '@/lib/infraestructura/mapa/tipos'
import { useIdioma, useTextos } from '@/lib/i18n/idioma-provider'
import type { Idioma } from '@/lib/i18n/idioma'

// Los gráficos se cargan al abrir Estadísticas para no sumar su peso al mapa inicial.
const EvolucionPanel = dynamic(
  () => import('@/components/infraestructura/evolucion-panel').then((modulo) => modulo.EvolucionPanel),
  { ssr: false, loading: () => <CargandoEvolucion /> },
)

function CargandoEvolucion() {
  const t = useTextos()
  return <p className="map-hint">{t.estadisticas.panel.cargando}</p>
}

const FORMATO_NUMERO: Record<Idioma, Intl.NumberFormat> = {
  es: new Intl.NumberFormat('es-AR'),
  pt: new Intl.NumberFormat('pt-BR'),
}

// "Departamento" is spelled the same in both languages, so it stays a literal.
const DEPARTAMENTO = 'Departamento'

function etiquetaAgrupacion(por: AgruparPor, t: ReturnType<typeof useTextos>): string {
  if (por === 'departamento') return DEPARTAMENTO
  return t.estadisticas.panel[por]
}

function etiquetaFila(clave: string, por: AgruparPor): string {
  if (por === 'departamento') return etiquetaDepartamento(clave)
  if (por === 'categoria' && esCategoria(clave)) return CATEGORIA_META[clave].label
  return clave
}

export function PanelEstadisticas({ escuelas, filtros }: { escuelas: EscuelaMapaEnriquecida[]; filtros: FiltrosMapa }) {
  const [por, setPor] = useState<AgruparPor>('departamento')
  const t = useTextos()
  const idioma = useIdioma()
  const formato = FORMATO_NUMERO[idioma]
  const p = t.estadisticas.panel
  const resumen = resumir(escuelas)
  const filas = agrupar(escuelas, por)
  const opcionesAgrupacion: { valor: AgruparPor; etiqueta: string }[] = [
    { valor: 'departamento', etiqueta: DEPARTAMENTO },
    { valor: 'nivel', etiqueta: p.nivel },
    { valor: 'gravedad', etiqueta: p.gravedad },
    { valor: 'categoria', etiqueta: p.categoria },
  ]

  return (
    <section className="map-est" aria-label={p.titulo}>
      <header className="map-est__encabezado">
        <h2>{p.titulo}</h2>
        <p>{p.subtitulo}</p>
      </header>

      <div className="map-sitact__kpis map-est__kpis" aria-label={p.ariaResumen}>
        <div className="map-sitact__kpi">
          <strong>{formato.format(resumen.conReporte)}</strong>
          <span>{p.conReporte}</span>
        </div>
        <div className="map-sitact__kpi map-sitact__kpi--resaltado">
          <strong>{formato.format(resumen.sinClases)}</strong>
          <span>{p.sinClases}</span>
        </div>
        <div className="map-sitact__kpi">
          <strong>{formato.format(resumen.alumnosSinClases)}</strong>
          <span>{p.alumnosSinClases}</span>
        </div>
        <div className="map-sitact__kpi">
          <strong>{formato.format(resumen.sinActualizar)}</strong>
          <span>{p.sinActualizar}</span>
        </div>
        <div className="map-sitact__kpi">
          <strong>{formato.format(resumen.sinClasesConApoyo)} / {formato.format(resumen.sinClases)}</strong>
          <span>{p.sinClasesConApoyo}</span>
          <small>{p.sinDato(formato.format(resumen.sinClasesSinDato))}</small>
        </div>
        <div className="map-sitact__kpi">
          <strong>{formato.format(resumen.solucionadasRecientes)}</strong>
          <span>{p.solucionadasRecientes}</span>
        </div>
      </div>

      <section className="map-est__agrupacion" aria-labelledby="map-est-agrupar-titulo">
        <h3 id="map-est-agrupar-titulo" className="map-sitact__titulo-seccion">Agrupar por</h3>
        <Segmentado etiqueta="Agrupar por" opciones={opcionesAgrupacion} valor={por} onChange={setPor} />
      </section>

      {escuelas.length === 0 ? (
        <p className="map-hint">{p.sinEscuelas}</p>
      ) : filas.length === 0 ? (
        <p className="map-hint">{p.sinNiveles}</p>
      ) : (
        <>
          <div className="ui-table-wrap map-est__tabla-wrap">
            <table className="ui-table map-est__tabla" data-testid="map-est-tabla">
              <thead>
                <tr>
                  <th scope="col">{etiquetaAgrupacion(por, t)}</th>
                  <th scope="col">{p.columnaEscuelas}</th>
                  <th scope="col">{p.columnaConSituaciones}</th>
                  <th scope="col">%</th>
                  <th scope="col">{p.columnaAlumnosSinClases}</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((fila) => (
                  <tr key={fila.clave}>
                    <th scope="row">{etiquetaFila(fila.clave, por)}</th>
                    <td className="map-est__numero">{formato.format(fila.escuelas)}</td>
                    <td className="map-est__numero">{formato.format(fila.afectadas)}</td>
                    <td className="map-est__numero">
                      <span className="map-est__porcentaje">
                        <span className="map-est__porcentaje-numero">{fila.porcentaje}%</span>
                        <span className="map-est__barra" aria-hidden="true">
                          <span style={{ width: `${fila.porcentaje}%` }} />
                        </span>
                      </span>
                    </td>
                    <td className="map-est__numero">{formato.format(fila.alumnosSinClases)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {por === 'nivel' && (
            <p className="map-sitact__atenuado">{p.variosNiveles}</p>
          )}
        </>
      )}

      <section className="map-est__evolucion" aria-labelledby="map-est-evolucion-titulo">
        <h3 id="map-est-evolucion-titulo" className="map-sitact__titulo-seccion">{p.evolucion}</h3>
        <EvolucionPanel filtros={filtros} />
      </section>
    </section>
  )
}
