// Spanish (Corrientes) texts of the `libTextos2` group. Values stay byte-for-byte as shipped.
const CATEGORIA_LLUVIA_ES = { poca: 'poca', moderada: 'moderada', mucha: 'mucha' } as const

export const libTextos2Es = {
  alertas: {
    vigentesYProximas: (vigentes: number, proximas: number) =>
      `${vigentes} vigente${vigentes === 1 ? '' : 's'} · ${proximas} próxima${proximas === 1 ? '' : 's'}`,
    soloProximas: (proximas: number, desde: string) =>
      `${proximas} alerta${proximas === 1 ? '' : 's'} del SMN · próxima${proximas === 1 ? '' : 's'} desde ${desde}`,
    soloVigentes: (vigentes: number) =>
      `${vigentes} alerta${vigentes === 1 ? '' : 's'} vigente${vigentes === 1 ? '' : 's'} del SMN`,
  },
  lluvia: {
    sinLluvia: 'sin lluvia',
    sinDato: 'sin dato',
    cantidad: (numero: string, categoria: keyof typeof CATEGORIA_LLUVIA_ES) =>
      `${numero} mm (${CATEGORIA_LLUVIA_ES[categoria]})`,
    clase150: '150 mm o más',
  },
  resumenEscuela: {
    conclusion: {
      evacuacionRio: 'Río en nivel de evacuación en la estación de referencia.',
      alertaRio: 'Río en alerta en la estación de referencia.',
      riesgo: (muyAlto: boolean, causa: string, horizonte: string) =>
        `Riesgo ${muyAlto ? 'muy alto' : 'alto'}${causa}${horizonte}.`,
      causa: (motivo: string) => ` por ${motivo}`,
      horizonte: (horas: number) => ` en las próximas ${horas} h`,
      moderado: 'Riesgo moderado: conviene seguir la evolución.',
      bajo: 'Sin señales de riesgo por lluvia ni por río.',
      sinDatos: 'Sin datos suficientes para evaluar el riesgo.',
    },
    motivo: { lluvia: 'lluvia', rafagas: 'ráfagas', caudal: 'crecida del río' },
    lluviaTresDias: (valor: string) => `Lluvia últimos 3 días: ${valor}`,
    lluviaBajaConfianza: 'Estimación satelital de baja confianza: puede deberse a nubosidad o humedad, no necesariamente lluvia.',
    pronostico24h: (valor: string) => `Pronóstico próximas 24 h: ${valor}`,
    sinEstacion: 'Río: sin estación de referencia cercana',
    titulo: 'Situación de la escuela',
  },
  actualizado: {
    con: (fecha: string) => `Actualizado ${fecha}`,
    sinFecha: 'Sin fecha de actualización',
  },
  horizonte: { diez: '10 días' },
  rio: {
    altura: (valor: string) => `Altura del río: ${valor}`,
    alturaSinDato: 'sin dato',
    estado: { evacuacion: 'Evacuación', sinDato: 'Sin dato' },
    umbralAlerta: (valor: string) => `alerta ${valor}`,
    umbralEvacuacion: (valor: string) => `evacuación ${valor}`,
  },
  tipoFactor: {
    amenaza: 'Amenaza',
    vulnerabilidad: 'Vulnerabilidad',
    exposicion: 'Exposición',
    urgencia: 'Urgencia',
    acceso: 'Acceso',
  },
  evidencia: {
    alturaRio: (rio: string, estacion: string, valor: string, tendencia: string, estado: string) =>
      `Río ${rio} en ${estacion} — Altura del río: ${valor}${tendencia} · ${estado}.`,
    alturaRioSimple: (valor: string) => `Altura del río: ${valor} m.`,
    estadoEvacuacion: (valor: string) => `Evacuación (evacuación ${valor} m)`,
    estadoAlerta: (valor: string) => `Alerta (alerta ${valor} m)`,
    estadoNormal: (valor: string) => `Normal (alerta ${valor} m)`,
    tendenciaCrece: ' y creciendo',
    tendenciaBaja: ' y bajando',
    probabilidadRio: (pct: string, plazo: string, conservador: string) =>
      `Río: probabilidad ${pct} de que el agua supere el terreno de la escuela${plazo}${conservador}.`,
    plazoHoras: (horas: string) => ` en las próximas ${horas} h`,
    conservador: (pct: string) => ` (escenario conservador ${pct})`,
    lluvia: (ventana: string, valor: string) => `Lluvia de las últimas ${ventana}: ${valor} mm.`,
    pronosticoPeligro: (color: string, plazo: string) => `Pronóstico de lluvia: peligro ${color} ${plazo}.`,
    plazoDias: (dias: string) => `en los próximos ${dias} días`,
    plazoPeligroHoras: (horas: string) => `en las próximas ${horas} h`,
    otraSenal: (texto: string) => `Otra señal: ${texto}.`,
  },
  riesgoActual: {
    sinEvaluar: 'El motor de riesgo todavía no evaluó esta escuela.',
    zonaExpuesta: 'La escuela está en zona expuesta a crecidas del río.',
    sinSenales: 'Riesgo actual bajo: sin señales de lluvia ni de río para hoy.',
    conclusion: {
      muyAlto: 'Riesgo actual muy alto.',
      alto: 'Riesgo actual alto.',
      moderado: 'Riesgo actual moderado: conviene seguir la evolución.',
      bajo: 'Riesgo actual bajo.',
    },
    nivel: { bajo: 'Bajo', muyAlto: 'Muy alto' },
    sinDatos: 'Sin datos',
  },
}
