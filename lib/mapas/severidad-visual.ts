// Codificación visual de severidad para el punto de infraestructura (T1.1).
// Módulo puro: sin React ni MapLibre, para que la lógica que la animación del
// pulso ejecuta en cada frame se pueda unit-testear en aislamiento.
//
// El pulso reemplaza al viejo escalado de tamaño por alumnosAlcanzados: el
// punto ahora es de tamaño fijo y las severidades Alta/Crítica se marcan con
// un anillo animado alrededor del punto (ver map-infraestructura-page.tsx).

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

// Interpolación lineal del radio del pulso entre el radio base (progreso 0 =
// el punto acaba de pulsar) y el radio máximo (progreso 1 = anillo
// totalmente expandido). `progreso` se clampea a [0, 1] para que un timer
// desfasado no produzca radios negativos ni por encima del máximo.
export function calcularRadioPulso(progreso: number, radioBase: number, radioMax: number): number {
  const p = Math.min(1, Math.max(0, progreso))
  return radioBase + (radioMax - radioBase) * p
}

// La opacidad del anillo baja con la expansión: el anillo viejo se desvanece
// mientras crece, y el siguiente ciclo lo vuelve a pintar desde ~0.5. Así el
// pulso se lee como un eco que se aleja del punto, no como un círculo que se
// infla y desinfla en el lugar.
export function calcularOpacidadPulso(progreso: number): number {
  const p = Math.min(1, Math.max(0, progreso))
  return 0.5 * (1 - p)
}