'use client'

import { useEffect, useState, type JSX } from 'react'
import { Tabs, TabsList, TabsTab } from '@/components/ui/tabs'
// Frontera servidor/cliente: ver el comentario largo en evolucion-graficos.tsx.
// Sólo TYPES cruzan hacia acá; ningún valor de evolucion.ts se ejecuta en el
// navegador.
import type { EvolucionMapa, PuntoEscuelasServicioCaido } from '@/lib/infraestructura/evolucion'
import { etiquetaDepartamento } from '@/lib/infraestructura/mapa/etiquetas'
import type { FiltrosMapa } from '@/lib/infraestructura/mapa/tipos'
import {
  GraficoAlumnosAcumulados,
  GraficoMotivos,
  GraficoSerieServicioCaido,
} from './evolucion-graficos'

// F5.3: las cuatro vistas de la pestaña de evolución. El backend
// (GET /api/mapas/infraestructura/evolucion) ya existe y está testeado; acá
// sólo se consume y se dibuja.
type Vista = 'serie' | 'ranking' | 'motivos' | 'acumulado'

const VISTAS: readonly Vista[] = ['serie', 'ranking', 'motivos', 'acumulado']
const URL_EVOLUCION = '/api/mapas/infraestructura/evolucion'
const FORMATO_NUMERO = new Intl.NumberFormat('es-AR')

function claveConsulta(filtros: FiltrosMapa): string {
  const parametros = new URLSearchParams()
  filtros.departamentos.forEach((departamento) => parametros.append('departamento', departamento))
  filtros.niveles.forEach((nivel) => parametros.append('nivel', nivel))
  return parametros.toString()
}

function esVista(valor: string): valor is Vista {
  return (VISTAS as readonly string[]).includes(valor)
}

// Hallazgo 24: la serie nace en el inicio REAL del período, que puede ser
// meses antes de la primera afectación. Esos días en cero en la cabecera
// desperdician ~90 % del ancho del gráfico, así que —sólo para dibujar— se
// recorta hasta el primer día con escuelas caídas, dejando unos días de
// contexto previo para que se lea el "estaba en cero y después subió" en vez
// de arrancar de golpe. Si ningún día tiene datos se devuelve la serie
// completa: un período sin caídos nunca es lo mismo que "no hay serie" y no
// corresponde inventar un recorte sobre un array todo en cero.
export function recortarSerieAlRangoConDatos(
  puntos: readonly PuntoEscuelasServicioCaido[],
  margen = 3,
): PuntoEscuelasServicioCaido[] {
  const primerConDatos = puntos.findIndex((punto) => punto.escuelas > 0)
  if (primerConDatos === -1) return [...puntos]
  return puntos.slice(Math.max(0, primerConDatos - margen))
}

export function EvolucionPanel({ filtros }: { filtros: FiltrosMapa }): JSX.Element {
  const [vista, setVista] = useState<Vista>('serie')
  const [datos, setDatos] = useState<EvolucionMapa | null>(null)
  const [error, setError] = useState<string | null>(null)
  const consulta = claveConsulta(filtros)

  // El endpoint admite solamente departamento y nivel. La query serializada
  // mantiene estable el efecto aunque el padre cree un objeto de filtros nuevo.
  useEffect(() => {
    let cancelado = false
    const url = consulta === '' ? URL_EVOLUCION : `${URL_EVOLUCION}?${consulta}`
    fetch(url)
      .then(async (respuesta) => {
        if (!respuesta.ok) {
          throw new Error(`No se pudo leer la evolución (HTTP ${respuesta.status})`)
        }
        return (await respuesta.json()) as EvolucionMapa
      })
      .then((resultado) => {
        if (cancelado) return
        setDatos(resultado)
        setError(null)
      })
      .catch((causa: unknown) => {
        if (cancelado) return
        // Sin datos no hay gráfico que valga: se muestra el error y se
        // permite reintentar recargando la pestaña, nunca una grilla vacía
        // que parezca "cero escuelas afectadas".
        setError(causa instanceof Error ? causa.message : 'No se pudo leer la evolución')
      })
    return () => {
      cancelado = true
    }
  }, [consulta])

  if (error) {
    return (
      <div className="evolucion-panel">
        <div className="ui-messagebar ui-messagebar--error" role="alert">
          {error}
        </div>
      </div>
    )
  }

  if (!datos) {
    return (
      <div className="evolucion-panel">
        <p className="map-hint">Cargando…</p>
      </div>
    )
  }

  // Hallazgo 25: máximo del ranking para escalar las barras de apoyo visual.
  // Nace en 0 y no en -Infinity para el caso sin filas; el ancho se calcula
  // sólo cuando el máximo es positivo, así que el 0 queda cubierto.
  const maxEscuelasAfectadas = Math.max(
    0,
    ...datos.rankingDepartamentos.map((fila) => fila.escuelasAfectadas),
  )

  return (
    <div className="evolucion-panel">
      <Tabs value={vista} onValueChange={(valor: string) => esVista(valor) && setVista(valor)}>
        <TabsList>
          <TabsTab value="serie">Servicio caído</TabsTab>
          <TabsTab value="ranking">Departamentos</TabsTab>
          <TabsTab value="motivos">Motivos</TabsTab>
          <TabsTab value="acumulado">Alumnos acumulados</TabsTab>
        </TabsList>
      </Tabs>

      {vista === 'serie' && (
        <section className="evolucion-vista">
          {datos.serieEscuelasServicioCaido.length === 0 ? (
            <p className="map-hint">No hay escuelas con servicio caído.</p>
          ) : (
            <GraficoSerieServicioCaido
              puntos={recortarSerieAlRangoConDatos(datos.serieEscuelasServicioCaido)}
            />
          )}
        </section>
      )}

      {vista === 'ranking' && (
        <section className="evolucion-vista">
          {datos.rankingDepartamentos.length === 0 ? (
            <p className="map-hint">No hay escuelas afectadas.</p>
          ) : (
            <div className="ui-table-wrap">
              <table className="ui-table evolucion-tabla">
                <thead>
                  <tr>
                    <th scope="col">Departamento</th>
                    <th scope="col">Escuelas afectadas</th>
                    <th scope="col">Alumnos alcanzados</th>
                    <th scope="col">Proporción</th>
                  </tr>
                </thead>
                <tbody>
                  {datos.rankingDepartamentos.map((fila) => (
                    <tr key={fila.departamento}>
                      <th scope="row">{etiquetaDepartamento(fila.departamento)}</th>
                      <td>{FORMATO_NUMERO.format(fila.escuelasAfectadas)}</td>
                      <td>{FORMATO_NUMERO.format(fila.alumnosAlcanzados)}</td>
                      <td className="evolucion-barra-celda">
                        {/* Decorativa: el número ya está en la columna anterior. */}
                        <span className="evolucion-barra" aria-hidden="true">
                          <span
                            className="evolucion-barra__relleno"
                            style={{
                              width:
                                maxEscuelasAfectadas > 0
                                  ? `${(fila.escuelasAfectadas / maxEscuelasAfectadas) * 100}%`
                                  : '0%',
                            }}
                          />
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {vista === 'motivos' && (
        <section className="evolucion-vista">
          {datos.distribucionMotivo.length === 0 ? (
            <p className="map-hint">No hay afectaciones vigentes.</p>
          ) : (
            <GraficoMotivos motivos={datos.distribucionMotivo} />
          )}
        </section>
      )}

      {vista === 'acumulado' && (
        <section className="evolucion-vista">
          <p className="map-sitact__atenuado">Cuenta a cada alumno una sola vez en todo el período.</p>
          {datos.alumnosAcumulados.length === 0 ? (
            <p className="map-hint">No hay alumnos alcanzados.</p>
          ) : (
            <GraficoAlumnosAcumulados puntos={datos.alumnosAcumulados} />
          )}
        </section>
      )}
    </div>
  )
}
