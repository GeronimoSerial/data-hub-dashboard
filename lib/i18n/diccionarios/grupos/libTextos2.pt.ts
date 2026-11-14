import type { DeepStringify } from '../tipos'
import type { libTextos2Es } from './libTextos2.es'

const CATEGORIA_LLUVIA_PT = { poca: 'fraca', moderada: 'moderada', mucha: 'forte' } as const
const COLOR_PELIGRO_PT: Record<string, string> = { verde: 'verde', amarillo: 'amarelo', naranja: 'laranja', rojo: 'vermelho' }

// Brazilian Portuguese texts of the `libTextos2` group; must mirror libTextos2.es.ts key for key.
export const libTextos2Pt: DeepStringify<typeof libTextos2Es> = {
  alertas: {
    vigentesYProximas: (vigentes, proximas) =>
      `${vigentes} ${vigentes === 1 ? 'vigente' : 'vigentes'} · ${proximas} ${proximas === 1 ? 'próxima' : 'próximas'}`,
    soloProximas: (proximas, desde) =>
      `${proximas} ${proximas === 1 ? 'alerta' : 'alertas'} do SMN · ${proximas === 1 ? 'começa' : 'começam'} a partir de ${desde}`,
    soloVigentes: (vigentes) =>
      `${vigentes} ${vigentes === 1 ? 'alerta vigente' : 'alertas vigentes'} do SMN`,
  },
  lluvia: {
    sinLluvia: 'sem chuva',
    sinDato: 'sem dado',
    cantidad: (numero, categoria) => `${numero} mm (${CATEGORIA_LLUVIA_PT[categoria]})`,
    clase150: '150 mm ou mais',
  },
  resumenEscuela: {
    conclusion: {
      evacuacionRio: 'Rio em nível de evacuação na estação de referência.',
      alertaRio: 'Rio em alerta na estação de referência.',
      riesgo: (muyAlto, causa, horizonte) => `Risco ${muyAlto ? 'muito alto' : 'alto'}${causa}${horizonte}.`,
      causa: (motivo) => ` por ${motivo}`,
      horizonte: (horas) => ` nas próximas ${horas} h`,
      moderado: 'Risco moderado: convém acompanhar a evolução.',
      bajo: 'Sem sinais de risco por chuva nem por rio.',
      sinDatos: 'Dados insuficientes para avaliar o risco.',
    },
    motivo: { lluvia: 'chuva', rafagas: 'rajadas', caudal: 'cheia do rio' },
    lluviaTresDias: (valor) => `Chuva últimos 3 dias: ${valor}`,
    pronostico24h: (valor) => `Previsão próximas 24 h: ${valor}`,
    sinEstacion: 'Rio: sem estação de referência próxima',
    titulo: 'Situação da escola',
  },
  actualizado: {
    con: (fecha) => `Atualizado ${fecha}`,
    sinFecha: 'Sem data de atualização',
  },
  horizonte: { diez: '10 dias' },
  rio: {
    altura: (valor) => `Altura do rio: ${valor}`,
    alturaSinDato: 'sem dado',
    estado: { evacuacion: 'Evacuação', sinDato: 'Sem dado' },
    umbralAlerta: (valor) => `alerta ${valor}`,
    umbralEvacuacion: (valor) => `evacuação ${valor}`,
  },
  tipoFactor: {
    amenaza: 'Ameaça',
    vulnerabilidad: 'Vulnerabilidade',
    exposicion: 'Exposição',
    urgencia: 'Urgência',
    acceso: 'Acesso',
  },
  evidencia: {
    alturaRio: (rio, estacion, valor, tendencia, estado) =>
      `Rio ${rio} em ${estacion} — Altura do rio: ${valor}${tendencia} · ${estado}.`,
    alturaRioSimple: (valor) => `Altura do rio: ${valor} m.`,
    estadoEvacuacion: (valor) => `Evacuação (evacuação ${valor} m)`,
    estadoAlerta: (valor) => `Alerta (alerta ${valor} m)`,
    estadoNormal: (valor) => `Normal (alerta ${valor} m)`,
    tendenciaCrece: ' e subindo',
    tendenciaBaja: ' e descendo',
    probabilidadRio: (pct, plazo, conservador) =>
      `Rio: probabilidade ${pct} de que a água supere o terreno da escola${plazo}${conservador}.`,
    plazoHoras: (horas) => ` nas próximas ${horas} h`,
    conservador: (pct) => ` (cenário conservador ${pct})`,
    lluvia: (ventana, valor) => `Chuva das últimas ${ventana}: ${valor} mm.`,
    pronosticoPeligro: (color, plazo) => `Previsão de chuva: perigo ${COLOR_PELIGRO_PT[color] ?? color} ${plazo}.`,
    plazoDias: (dias) => `nos próximos ${dias} dias`,
    plazoPeligroHoras: (horas) => `nas próximas ${horas} h`,
    otraSenal: (texto) => `Outro sinal: ${texto}.`,
  },
  riesgoActual: {
    sinEvaluar: 'O motor de risco ainda não avaliou esta escola.',
    zonaExpuesta: 'A escola está em zona exposta a cheias do rio.',
    sinSenales: 'Risco atual baixo: sem sinais de chuva nem de rio para hoje.',
    conclusion: {
      muyAlto: 'Risco atual muito alto.',
      alto: 'Risco atual alto.',
      moderado: 'Risco atual moderado: convém acompanhar a evolução.',
      bajo: 'Risco atual baixo.',
    },
    nivel: { bajo: 'Baixo', muyAlto: 'Muito alto' },
    sinDatos: 'Sem dados',
  },
}
