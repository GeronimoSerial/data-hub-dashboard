import PublicoLayout from '@/app/(publico)/layout'

/**
 * El historial es parte del recorrido público del director, pero vive fuera
 * del grupo de rutas `(publico)`, así que no hereda su encabezado ni su pie.
 * Reusa el mismo layout en vez de copiarlo: la marca institucional y el pie
 * quedan definidos en un solo lugar.
 *
 * Cuando aterricen las demás pantallas del parte conviene subir esta línea a
 * `app/problematicas/parte/layout.tsx` y borrar este archivo — hoy ese nivel
 * lo comparten varios batches en curso.
 */
export default PublicoLayout
