// Spanish (Corrientes) texts of the `fichaHistorial` group. Values stay byte-for-byte as shipped.
export const fichaHistorialEs = {
  parte: {
    titulo: 'Historial del parte',
    cargando: 'Buscando los movimientos del parte…',
    error: 'No pudimos mostrar el historial. Revise su conexión y vuelva a intentar.',
    reingresar: 'Volver a ingresar la contraseña',
    reintentar: 'Reintentar',
    sinSituacion: 'No hay una situación hidrometeorológica en seguimiento para este establecimiento.',
    cargarSituacion: 'Cargar una situación',
  },
  rol: {
    director: 'Director',
  },
  linea: {
    verAnteriores: (ocultos: number) => `Ver movimientos anteriores (${ocultos})`,
  },
  formato: {
    hoy: 'Hoy',
    momento: (dia: number, mes: string, hora: string, minuto: string) => `${dia} de ${mes}, ${hora}:${minuto}`,
    rigeDesde: (dia: number, mes: string, hora: string, minuto: string) =>
      `Rige desde el ${dia} de ${mes} a las ${hora}:${minuto}`,
    fecha: (dia: number, mes: string) => `${dia} de ${mes}`,
  },
  evolucion: {
    cargando: 'Cargando…',
    error: {
      http: (estado: number) => `No se pudo leer la evolución (HTTP ${estado})`,
      generico: 'No se pudo leer la evolución',
    },
    pestanas: {
      serie: 'Servicio caído',
      acumulado: 'Alumnos acumulados',
    },
    vacio: {
      serie: 'No hay escuelas con servicio caído.',
      ranking: 'No hay escuelas afectadas.',
      motivos: 'No hay afectaciones vigentes.',
      alumnos: 'No hay alumnos alcanzados.',
    },
    tabla: {
      escuelas: 'Escuelas afectadas',
      alumnos: 'Alumnos alcanzados',
      proporcion: 'Proporción',
    },
    acumuladoNota: 'Cuenta a cada alumno una sola vez en todo el período.',
    escuelas: (cantidad: string) => `${cantidad} escuelas`,
    grafico: {
      serie: 'Serie temporal de escuelas con servicio caído',
      motivos: 'Distribución de afectaciones vigentes por motivo',
      acumulados: 'Alumnos acumulados alcanzados a lo largo del período',
    },
    serieEscuelas: 'Escuelas con servicio caído',
    afectacionesVigentes: 'Afectaciones vigentes',
    alumnosAcumulados: 'Alumnos acumulados',
  },
} as const
