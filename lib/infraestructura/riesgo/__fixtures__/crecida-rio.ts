import { explicacionAlturaCritica, type InfoAlturaCritica } from '../motor/altura-critica'
import type { FactorMotor } from '../explicar-snapshot'
import type { PresentacionCrecida } from '../presentacion-crecida'

export const CUE_CRECIDA = '1800524-00'
export const INFO_CRECIDA: InfoAlturaCritica = {
  estacionId: 'pna-paso-de-los-libres',
  fuente: 'calibrada',
  alturaCriticaM: 14.66,
  alturaCriticaBandaM: 12.66,
  h0M: 9.46,
  record: { valorM: 13.02, fecha: '1983-07-04' },
  pAlcanzarPorHorizonte: { 24: 0, 72: 0, 240: 0 },
  evidenciaSecoS2: { estacionId: 'pna-paso-de-los-libres', hSecoM: 11.28, fecha: '2023-11-29' },
  defensa: null,
  alcance: 'ninguno',
  alcanceSinDefensa: 'ninguno',
  pAlcanzar: 0,
  pBanda: 0,
  decide: 'ninguno',
  alturaDesbordeM: null,
}

export function factorCrecida(info: InfoAlturaCritica = INFO_CRECIDA) {
  return {
    tipo: 'amenaza', fuente: 'rio-v04', variable: 'superacion_terreno',
    valor: 0, unidad: 'probabilidad', contribucion: 0, observadoEn: null,
    explicacion: `Rio v0.4: P superacion del terreno 0 a 72h; conservador 0; alcance_observado ninguno: ${explicacionAlturaCritica(info, 72)}`,
  } satisfies FactorMotor
}

export const PRESENTACION_CRECIDA: PresentacionCrecida = {
  estacion: 'Paso de los Libres',
  alturaCriticaM: 14.66,
  alturaActualM: 9.46,
  probabilidadesPorHorizonte: { 24: 0, 72: 0, 240: 0 },
  subidaDesdeActualM: 5.2,
  antecedente: { nivelM: 11.28, fecha: '2023-11-29', distanciaAguaM: 125, subidaHastaUmbralM: 3.38 },
  defensaCostera: false,
}
