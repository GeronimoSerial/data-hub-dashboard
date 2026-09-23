// Codificación visual de severidad para el punto de infraestructura (T1.1).
// Módulo puro: sin React ni MapLibre, para que la lógica que la animación del
// pulso ejecuta en cada frame se pueda unit-testear en aislamiento.
//
// El pulso reemplaza al viejo escalado de tamaño por alumnosAlcanzados: el
// punto ahora es de tamaño fijo y las severidades Alta/Crítica se marcan con
// un anillo animado alrededor del punto (ver map-infraestructura-page.tsx).

// SEVERIDADES = ['Baja','Media','Alta','Critica'], used to turn a severity label into a numeric rank for cluster aggregation.
import { SEVERIDADES } from '@/lib/infraestructura/validacion'

// Radio fijo del punto, igual para todas las escuelas. Al ser constante no
// compite con las vecinas a ningún zoom y el canal "tamaño" queda libre de
// una variable que ya no se informa en el mapa.
export const RADIO_DOT_BASE = 6

// Duración de un ciclo completo de pulso (del punto recién pulsado al anillo
// totalmente expandido).
export const DURACION_PULSO_MS = 1600

// Las dos severidades más altas de SEVERIDADES (lib/infraestructura/validacion.ts:
// ['Baja', 'Media', 'Alta', 'Crítica']). Marcar todas sería ruido; marcarlas
// igual que las demás las haría indistinguibles de una escuela baja.
const SEVERIDADES_PULSANTES: ReadonlySet<string> = new Set(['Alta', 'Crítica'])

export function esSeveridadPulsante(severidad: string): boolean {
  return SEVERIDADES_PULSANTES.has(severidad)
}

// Radio máximo del anillo pulsante por severidad: Crítica pulsa más grande
// que Alta, y para el resto devuelve el radio base (no pulsan, el valor no
// se usa — sólo existe para que el contrato sea total).
export function radioMaximoPulso(severidad: string): number {
  if (severidad === 'Crítica') return 16
  if (severidad === 'Alta') return 12
  return RADIO_DOT_BASE
}

// La opacidad del anillo baja con la expansión: el anillo viejo se desvanece
// mientras crece, y el siguiente ciclo lo vuelve a pintar desde ~0.5. Así el
// pulso se lee como un eco que se aleja del punto, no como un círculo que se
// infla y desinfla en el lugar.
export function calcularOpacidadPulso(progreso: number): number {
  const p = Math.min(1, Math.max(0, progreso))
  return 0.5 * (1 - p)
}

// MapLibre clusterProperties necesita un NÚMERO para agregar con un operador
// max() entre los puntos agrupados: un label de severidad como string no se
// puede agregar con max() de forma significativa — el orden alfabético no
// coincide con el orden de severidad. Por eso esta función convierte
// 'Baja'/'Media'/'Alta'/'Crítica' en 0/1/2/3; un label desconocido cae a 0
// (la severidad más baja) en vez de lanzar un error.
export function rangoSeveridad(severidad: string): number {
  const indice = SEVERIDADES.indexOf(severidad as (typeof SEVERIDADES)[number])
  return indice === -1 ? 0 : indice
}