'use client'

import { useState, type ReactNode } from 'react'
import { Tabs, TabsList, TabsPanel, TabsTab } from '@/components/ui/tabs'

export type PestanaSidebar = 'escuelas' | 'capas' | 'recorrido'

export interface SidebarReorganizacionProps {
  /** Texto bajo el título, p. ej. el alcance y la fecha de corte. */
  subtitulo: string
  /** Acción del encabezado (metodología). */
  accionEncabezado: ReactNode
  escuelas: ReactNode
  capas: ReactNode
  recorrido: ReactNode
  /** Ficha del elemento seleccionado. Cuando existe reemplaza el contenido de la pestaña. */
  detalle?: ReactNode
  /** Se llama al cambiar de pestaña con un detalle abierto, para cerrarlo. */
  onCerrarDetalle: () => void
}

/**
 * Barra lateral del mapa: encabezado fijo, tres pestañas y un cuerpo que
 * desplaza por sí solo. Una ficha abierta ocupa el cuerpo hasta cerrarla.
 */
export function SidebarReorganizacion({
  subtitulo,
  accionEncabezado,
  escuelas,
  capas,
  recorrido,
  detalle,
  onCerrarDetalle,
}: SidebarReorganizacionProps) {
  const [pestana, setPestana] = useState<PestanaSidebar>('escuelas')

  return (
    <Tabs
      className="rz-side"
      value={pestana}
      onValueChange={(valor) => {
        setPestana(valor as PestanaSidebar)
        if (detalle) onCerrarDetalle()
      }}
    >
      <header className="rz-head">
        <div className="rz-head__fila">
          <h2 className="rz-head__titulo">Reorganización escolar</h2>
          {accionEncabezado}
        </div>
        <p className="rz-head__sub">{subtitulo}</p>
      </header>

      <div className="rz-tabs">
        <TabsList aria-label="Secciones del panel">
          <TabsTab value="escuelas">Escuelas</TabsTab>
          <TabsTab value="capas">Capas</TabsTab>
          <TabsTab value="recorrido">Recorrido</TabsTab>
        </TabsList>
      </div>

      <div className="rz-body">
        {detalle ?? (
          <>
            <TabsPanel value="escuelas" className="rz-pestana">
              {escuelas}
            </TabsPanel>
            <TabsPanel value="capas" className="rz-pestana">
              {capas}
            </TabsPanel>
            <TabsPanel value="recorrido" className="rz-pestana">
              {recorrido}
            </TabsPanel>
          </>
        )}
      </div>
    </Tabs>
  )
}
