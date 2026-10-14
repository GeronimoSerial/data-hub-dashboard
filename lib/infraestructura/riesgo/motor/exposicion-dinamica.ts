/**
 * Exposición dinámica de escuelas a inundación por agua permanente.
 *
 * Módulo puro: sin acceso a base de datos ni reloj. La anomalía del nivel del río
 * se interpola entre estaciones de referencia ordenadas aguas arriba → aguas abajo.
 */

export const DISTANCIA_RIO_MAX_M = 500;
export const MARGEN_DINAMICO_M = 1;
/** El agua cercana debe coincidir con el nivel del tramo de río. */
export const TOLERANCIA_NIVEL_RIO_M = 3;
/** Agua por encima del nivel del tramo: embalse o agua colgada. */
export const UMBRAL_EMBALSE_M = 10;

export type EstacionAnomalia = {
  estacionId: string;
  lat: number;
  lon: number;
  anomaliaM: number | null;
};

export type AnomaliaInterpolada = {
  anomaliaM: number;
  desde: string;
  hasta: string;
  t: number;
};

export function anomaliaInterpolada(
  punto: { lat: number; lon: number },
  estaciones: readonly EstacionAnomalia[],
): AnomaliaInterpolada | null {
  const validas = estaciones.filter(
    (e): e is EstacionAnomalia & { anomaliaM: number } => e.anomaliaM !== null,
  );

  if (validas.length === 0) return null;

  if (validas.length === 1) {
    const unica = validas[0];
    return {
      anomaliaM: round2(unica.anomaliaM),
      desde: unica.estacionId,
      hasta: unica.estacionId,
      t: 0,
    };
  }

  let mejor: { distancia: number; resultado: AnomaliaInterpolada } | null =
    null;

  for (let i = 0; i < validas.length - 1; i++) {
    const a = validas[i];
    const b = validas[i + 1];
    const cosLat = Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180);

    // Plano local equirectangular.
    const ax = a.lon * cosLat;
    const ay = a.lat;
    const bx = b.lon * cosLat;
    const by = b.lat;
    const px = punto.lon * cosLat;
    const py = punto.lat;

    const dx = bx - ax;
    const dy = by - ay;
    const longitud2 = dx * dx + dy * dy;
    const t =
      longitud2 === 0
        ? 0
        : clamp(((px - ax) * dx + (py - ay) * dy) / longitud2, 0, 1);

    const cruceX = ax + t * dx;
    const cruceY = ay + t * dy;
    const distancia = Math.hypot(px - cruceX, py - cruceY);

    if (mejor === null || distancia < mejor.distancia) {
      mejor = {
        distancia,
        resultado: {
          anomaliaM: round2(a.anomaliaM + t * (b.anomaliaM - a.anomaliaM)),
          desde: a.estacionId,
          hasta: b.estacionId,
          t,
        },
      };
    }
  }

  return mejor?.resultado ?? null;
}

export type DatosDemEscuela = {
  sueloM: number | null;
  nivelRioDemM: number | null;
  distanciaRioM: number | null;
};

export type ResultadoExposicionDinamica =
  | { tipo: "expuesta"; aguaEstimadaM: number; sueloM: number; detalle: string }
  | { tipo: "no_expuesta"; detalle: string }
  | { tipo: "no_aplica_embalse"; detalle: string }
  | { tipo: "sin_dato"; detalle: string };

export function evaluarExposicionDinamica(
  dem: DatosDemEscuela | null,
  nivelRioTramoM: number | null,
  anomaliaM: number | null,
  // true si el tramo tiene una represa aguas arriba de su estación (Yacyretá
  // sobre Ituzaingó): sólo ahí el agua muy por encima del río es un embalse.
  represaAguasArriba = false,
): ResultadoExposicionDinamica {
  if (
    dem === null ||
    dem.sueloM === null ||
    dem.nivelRioDemM === null ||
    dem.distanciaRioM === null
  ) {
    return {
      tipo: "no_expuesta",
      detalle: "sin agua permanente a <= 2 km o sin DEM",
    };
  }

  const { sueloM, nivelRioDemM, distanciaRioM } = dem;

  // Antes que la distancia: una escuela sobre la costa del embalse tiene la
  // estación aguas abajo de la represa, que no la representa.
  if (
    represaAguasArriba &&
    nivelRioTramoM !== null &&
    nivelRioDemM - nivelRioTramoM > UMBRAL_EMBALSE_M
  ) {
    return {
      tipo: "no_aplica_embalse",
      detalle: `agua a ${nivelRioDemM} m frente a tramo de río a ${nivelRioTramoM} m: embalse o agua colgada`,
    };
  }

  if (distanciaRioM > DISTANCIA_RIO_MAX_M) {
    return {
      tipo: "no_expuesta",
      detalle: `río a ${distanciaRioM} m (> ${DISTANCIA_RIO_MAX_M} m)`,
    };
  }

  if (
    nivelRioTramoM !== null &&
    Math.abs(nivelRioDemM - nivelRioTramoM) > TOLERANCIA_NIVEL_RIO_M
  ) {
    return {
      tipo: "no_expuesta",
      detalle: `el agua cercana no es el río (laguna): agua a ${nivelRioDemM} m frente a tramo a ${nivelRioTramoM} m`,
    };
  }

  if (anomaliaM === null) {
    return {
      tipo: "sin_dato",
      detalle: "sin nivel actual / referencia de estación",
    };
  }

  const aguaEstimadaM = round2(nivelRioDemM + anomaliaM);
  const cota = aguaEstimadaM + MARGEN_DINAMICO_M;
  const numeros = `suelo ${sueloM} m ${sueloM <= cota ? "<=" : ">"} agua estimada ${aguaEstimadaM} m + ${MARGEN_DINAMICO_M} m (DEM; estimado)`;

  if (sueloM <= cota) {
    return { tipo: "expuesta", aguaEstimadaM, sueloM, detalle: numeros };
  }

  return { tipo: "no_expuesta", detalle: numeros };
}

export function nivelRioTramo(
  niveles: readonly DatosDemEscuela[],
): number | null {
  const valores = niveles
    .filter(
      (
        n,
      ): n is DatosDemEscuela & {
        nivelRioDemM: number;
        distanciaRioM: number;
      } =>
        n.nivelRioDemM !== null &&
        n.distanciaRioM !== null &&
        n.distanciaRioM <= DISTANCIA_RIO_MAX_M,
    )
    .map((n) => n.nivelRioDemM)
    .sort((x, y) => x - y);

  if (valores.length === 0) return null;

  const medio = Math.floor(valores.length / 2);
  return valores.length % 2 === 1
    ? valores[medio]
    : (valores[medio - 1] + valores[medio]) / 2;
}

function round2(valor: number): number {
  return Math.round(valor * 100) / 100;
}

function clamp(valor: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, valor));
}
