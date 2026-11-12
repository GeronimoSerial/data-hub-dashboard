// Spanish (Corrientes) texts of the `controlesFiltros` group. Values stay byte-for-byte as shipped.
export const controlesFiltrosEs = {
  filtrosChips: {
    filtrosEscuelas: 'Filtros de escuelas',
    buscarEscuela: 'Buscar escuela o CUE',
    escuelasCoincidentes: 'Escuelas coincidentes',
    ningunaCoincide: 'Ninguna escuela coincide',
    masFiltros: 'Más filtros',
    activosAria: (cantidad: number) => `, ${cantidad} activos`,
    quitarFiltro: (etiqueta: string) => `Quitar filtro ${etiqueta}`,
    elegidos: (cantidad: number) => `${cantidad} elegidos`,
    sinOpciones: 'No hay opciones disponibles.',
    limpiarFiltros: 'Limpiar filtros',
    sinActualizar: 'Sin actualizar',
    solucionadasRecientes: 'Solucionadas en los últimos 15 días',
    conComedor: 'Con comedor',
    gravedad: 'Gravedad',
    clases: 'Clases',
    apoyo: 'Asistencia pedagógica',
    direccion: 'Dirección',
  },
} as const
