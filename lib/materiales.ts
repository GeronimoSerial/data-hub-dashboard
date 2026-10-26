import catalogo from '@/data/materiales.json'

export type Material = {
  tipo: 'pdf' | 'video'
  titulo: string
  href: string
  peso: string
  paginas?: number
  duracion?: string
  poster?: string
}
export type ColeccionMateriales = {
  id: 'manuales' | 'cuadernillos'
  titulo: string
  descripcion: string
  materiales: Material[]
}

export const materialesPublicados = catalogo

export async function cargarMateriales(): Promise<ColeccionMateriales[]> {
  const colecciones = [
    { id: 'manuales' as const, titulo: 'Manuales del flujo de reportes', descripcion: 'Guías de uso para consultar mientras completás y gestionás los reportes.' },
    { id: 'cuadernillos' as const, titulo: 'Cuadernillos de asistencia pedagógica', descripcion: 'Materiales de consulta y trabajo para acompañar la continuidad pedagógica.' },
  ]
  return colecciones.map(coleccion => ({
    ...coleccion,
    materiales: catalogo.filter(material => material.coleccion === coleccion.id).map((material): Material => ({
      tipo: material.tipo === 'video' ? 'video' : 'pdf',
      titulo: material.titulo,
      href: `/api/materiales/${material.id}/${material.tipo === 'video' ? 'video' : 'descargar'}`,
      peso: material.bytes < 1024 * 1024 ? `${Math.ceil(material.bytes / 1024)} KB` : `${(material.bytes / (1024 * 1024)).toLocaleString('es-AR', { maximumFractionDigits: 1 })} MB`,
      paginas: material.paginas,
      duracion: material.duracion,
      poster: material.poster,
    })),
  }))
}
