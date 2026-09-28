'use client'

import { useEffect, useState, type JSX } from 'react'
import { Tabs, TabsList, TabsTab } from '@/components/ui/tabs'
// Frontera servidor/cliente: ver el comentario largo en evolucion-graficos.tsx.
// Sólo TYPES cruzan hacia acá; ningún valor de evolucion.ts se ejecuta en el
// navegador.
import type { EvolucionMapa, PuntoEscuelasServicioCaido } from '@/lib/infraestructura/evolucion'
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

export function EvolucionPanel(): JSX.Element {
  const [vista, setVista] = useState<Vista>('serie')
  const [datos, setDatos] = useState<EvolucionMapa | null>(null)
  const [error, setError] = useState<string | null>(null)

  // El panel sólo se monta cuando el usuario abre la pestaña (ver
  // map-client.tsx), así que este efecto es el primer y único pedido del
  // período: sin dependencias, una sola vez por apertura.
  useEffect(() => {
    let cancelado = false
    fetch('/api/mapas/infraestructura/evolucion')
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
  }, [])

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
        <p className="map-hint">Cargando evolución del período…</p>
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
      <div>
        <span className="eyebrow">Parte operativo</span>
        <h2 className="page-title page-title--sm">Evolución</h2>
        <p className="page-intro">
          Cómo evolucionó el período vigente: escuelas con servicio caído, concentración
          territorial, motivos declarados y alcance acumulado de alumnos.
        </p>
      </div>

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
          <h3 className="evolucion-subtitulo">Escuelas con servicio caído</h3>
          <p className="evolucion-descripcion">
            Escuelas con funcionamiento <strong>interrumpido</strong> o <strong>parcialmente interrumpido</strong> cada día del
            período. El último punto es hoy y responde lo mismo que los indicadores del mapa.
          </p>
          {datos.serieEscuelasServicioCaido.length === 0 ? (
            <p className="map-hint">No hay escuelas con servicio caído en el período vigente.</p>
          ) : (
            <GraficoSerieServicioCaido
              puntos={recortarSerieAlRangoConDatos(datos.serieEscuelasServicioCaido)}
            />
          )}
        </section>
      )}

      {vista === 'ranking' && (
        <section className="evolucion-vista">
          <h3 className="evolucion-subtitulo">Ranking de departamentos</h3>
          <p className="evolucion-descripcion">
            Departamentos ordenados por cantidad de escuelas con afectaciones vigentes. Son las
            mismas escuelas y los mismos alumnos que muestran los indicadores del mapa.
          </p>
          {datos.rankingDepartamentos.length === 0 ? (
            <p className="map-hint">No hay escuelas con afectaciones vigentes en el período.</p>
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
                      <th scope="row">{fila.departamento}</th>
                      <td>{fila.escuelasAfectadas}</td>
                      <td>{fila.alumnosAlcanzados}</td>
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
          <h3 className="evolucion-subtitulo">Distribución por motivo</h3>
          <p className="evolucion-descripcion">
            Afectaciones vigentes declaradas por cada motivo. Una escuela puede aportar más de
            una afectación (y más de un motivo) si el parte lo registró así.
          </p>
          {datos.distribucionMotivo.length === 0 ? (
            <p className="map-hint">No hay afectaciones vigentes en el período.</p>
          ) : (
            <GraficoMotivos motivos={datos.distribucionMotivo} />
          )}
        </section>
      )}

      {vista === 'acumulado' && (
        <section className="evolucion-vista">
          <h3 className="evolucion-subtitulo">Alumnos alcanzados acumulados</h3>
          {/*
            La vista que más se confunde con un bug: el acumulado deduplica por
            persona a lo LARGO DE TODO EL PERÍODO y por eso NO coincide con el
            indicador "Alumnos alcanzados" del mapa, que es un snapshot de HOY.
            Son dos preguntas distintas y el texto las separa a propósito.
          */}
          <div className="ui-messagebar ui-messagebar--info">
            <span>
              <strong className="ui-messagebar__title">
                No es el indicador del mapa
              </strong>
              Este acumulado cuenta a cada alumno UNA sola vez desde que fue alcanzado, a lo
              largo de todo el período, aunque hoy ya haya vuelto a clase. El indicador
              &quot;Alumnos alcanzados&quot; del mapa responde otra pregunta: cuántos alumnos
              están afectados <strong>hoy</strong>. Los dos números pueden no coincidir sin que
              haya un error de datos.
            </span>
          </div>
          <p className="evolucion-descripcion">
            Alumnos distintos alcanzados desde el inicio del período. La serie nunca decrece.
          </p>
          {datos.alumnosAcumulados.length === 0 ? (
            <p className="map-hint">No hay alumnos alcanzados en el período.</p>
          ) : (
            <GraficoAlumnosAcumulados puntos={datos.alumnosAcumulados} />
          )}
        </section>
      )}
    </div>
  )
}
