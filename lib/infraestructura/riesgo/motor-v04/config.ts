// Configuración versionada de Motor v0.4 en modo candidato (U1 de
// "Motor v0.4/PLAN_IMPLEMENTACION.md"). Convive con motor-v0.3: no toca
// MOTOR_VERSION de motor/config.ts, que sigue siendo el operativo publicado.
import { createHash } from 'node:crypto'

export const MOTOR_V04_VERSION = 'motor-v0.4'

export const HORIZONTES_V04 = [24, 72, 240] as const
export type HorizonteV04 = (typeof HORIZONTES_V04)[number]

// Motivos de abstención publicados mientras falten las piezas de U2–U6. Se
// listan acá para que el job, los tests y el informe de cobertura usen el mismo
// vocabulario (CONTRATOS.md: `no_estimable` exige valor nulo y motivo).
export const MOTIVOS_V04 = {
  // Sin distribución temporal del nivel del río en el tramo (U3/U4).
  nivelLocalSinDistribucion: 'nivel_local_sin_distribucion',
  // Sin transferencia por km de río desde estaciones con cero de escala (U5).
  transferenciaHidraulicaPendiente: 'transferencia_hidraulica_pendiente',
  // Altimetría por fuente todavía no importada (U2).
  cotaTerrenoPendiente: 'cota_terreno_pendiente',
  cotaConservadoraPendiente: 'cota_conservadora_pendiente',
  // Sin umbrales de acceso ni calendario educativo (U6).
  accesosSinModeloOperativo: 'accesos_sin_modelo_operativo',
  // No hay cota de piso relevada: decisión del usuario del 2026-10-17
  // (odd/tasks/motor-v0-4.md). El evento de edificio se publica como
  // superación del terreno, nunca como agua dentro del edificio.
  umbralIngresoNoDisponible: 'umbral_ingreso_no_disponible',
} as const

// Política y parámetros que identifican una corrida (`configHash`). Cambiar
// cualquiera de estos valores cambia el hash y por lo tanto la identidad
// reproducible de la corrida.
export const CONFIG_V04 = {
  version: MOTOR_V04_VERSION,
  modoInicial: 'candidato',
  horizontesHoras: HORIZONTES_V04,
  eventos: ['superacionTerreno', 'interrupcionEducativa'],
  escenarios: ['principal', 'conservador'],
  altimetria: {
    politica: 'menor_cota_entre_estimaciones_validas_comparables',
    operadorEspacial: 'percentil_10_espacial_en_disco_de_50_m',
    referenciaVerticalDestino: 'SRVN16',
    representaCotaDelPiso: false,
  },
  publicacion: { promocionAutomatica: false, candidatoModificaPunteroOperativo: false },
} as const

// JSON con claves ordenadas: el hash no depende del orden de declaración.
function serializarCanonico(valor: unknown): string {
  if (Array.isArray(valor)) return `[${valor.map(serializarCanonico).join(',')}]`
  if (valor !== null && typeof valor === 'object') {
    const entradas = Object.entries(valor as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    return `{${entradas.map(([k, v]) => `${JSON.stringify(k)}:${serializarCanonico(v)}`).join(',')}}`
  }
  return JSON.stringify(valor)
}

export function hashCanonico(valor: unknown): string {
  return `sha256:${createHash('sha256').update(serializarCanonico(valor)).digest('hex')}`
}
