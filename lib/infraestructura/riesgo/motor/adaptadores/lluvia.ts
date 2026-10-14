// Adapter real de PuertoLluviaObservada. Combina dos fuentes:
// - NASA GPM IMERG (peligro/observado.ts de E3a), satelital, en toda la grilla.
// - Lluvia MEDIDA en estaciones SMN (SYNOP 6RRRt vía Ogimet, tabla
//   lluvia_estacion). IMERG subestima la llovizna persistente (Corrientes,
//   13/10/2026: la estación midió 4.8 mm en 24 h, IMERG ~0.7 mm), así que para
//   celdas a <= RADIO_SYNOP_KM de una estación se prefiere la medición, por
//   ventana, cuando su cobertura es completa (ver acumulado-synop.ts); si no,
//   queda IMERG. La fuente usada se informa en fuente24h/fuente72h.
//
// Contrato: null no es 0. 0 significa "se midió y no llovió"; null significa
// "no hay medición" (o cobertura insuficiente). Nunca lanza.
import { and, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { hazardClimatology } from "@/lib/db/schema";
import { acumularSynop } from "@/lib/infraestructura/lluvia-estaciones/acumulado-synop";
import { estacionSynopMasCercana } from "@/lib/infraestructura/lluvia-estaciones/estaciones-synop";
import { obtenerLluviaSynop } from "@/lib/infraestructura/lluvia-estaciones/lluvia-repo";
import type { PrecipitacionSynop } from "@/lib/infraestructura/lluvia-estaciones/synop-parser";
import { obtenerAcumuladosObservados } from "../../peligro/observado";
import type { LluviaObservadaCelda, PuertoLluviaObservada } from "../puertos";
import {
  VARIABLE_CLIMATOLOGIA_OBSERVADA,
  type ClimatologiaObservada,
} from "../lluvia-observada";

const FUENTE_IMERG = "nasa-imerg";
export const RADIO_SYNOP_KM = 25;
// 72 h de ventana + margen para el período que termina en la hora sinóptica previa.
const HORAS_CARGA_SYNOP = 80;

type CargarSynop = (params: {
  estacionWmo: string;
  desde: string;
  hasta: string;
}) => Promise<PrecipitacionSynop[]>;

const cargarSynopDesdeDb: CargarSynop = (params) =>
  obtenerLluviaSynop(getDb(), params);

type ClimatologiaPorVentana = Partial<Record<24 | 72, ClimatologiaObservada>>;
type CargarClimatologia = () => Promise<Map<string, ClimatologiaPorVentana>>;

// Climatología observada IMERG por celda (job de climatología IMERG; contrato:
// variable precipitacion_observada_{24,72}h, percentiles P90/P95/P99). Por
// celda y ventana gana la versión con `calculado_en` más reciente; una versión
// sin los tres percentiles se descarta.
export const cargarClimatologiaDesdeDb: CargarClimatologia = async () => {
  const variables = [
    VARIABLE_CLIMATOLOGIA_OBSERVADA[24],
    VARIABLE_CLIMATOLOGIA_OBSERVADA[72],
  ];
  const filas = await getDb()
    .select()
    .from(hazardClimatology)
    .where(
      and(
        inArray(hazardClimatology.variable, variables),
        inArray(hazardClimatology.percentil, ["P90", "P95", "P99"]),
      ),
    );
  const porClave = new Map<
    string,
    { calculadoEn: string; version: string; p: Record<string, number> }
  >();
  for (const f of filas) {
    const clave = `${f.geometryRef}|${f.variable}|${f.version}`;
    const actual = porClave.get(clave) ?? {
      calculadoEn: f.calculadoEn,
      version: f.version,
      p: {},
    };
    actual.p[f.percentil] = f.valor;
    if (f.calculadoEn > actual.calculadoEn) actual.calculadoEn = f.calculadoEn;
    porClave.set(clave, actual);
  }
  const salida = new Map<string, ClimatologiaPorVentana>();
  const elegidaEn = new Map<string, string>();
  for (const [clave, v] of porClave) {
    const [geometryRef, variable] = clave.split("|");
    const ventana = variable === VARIABLE_CLIMATOLOGIA_OBSERVADA[24] ? 24 : 72;
    const { P90, P95, P99 } = v.p;
    if (P90 === undefined || P95 === undefined || P99 === undefined) continue;
    const claveVentana = `${geometryRef}|${ventana}`;
    if ((elegidaEn.get(claveVentana) ?? "") > v.calculadoEn) continue;
    elegidaEn.set(claveVentana, v.calculadoEn);
    const porVentana = salida.get(geometryRef) ?? {};
    porVentana[ventana] = { p90: P90, p95: P95, p99: P99, version: v.version };
    salida.set(geometryRef, porVentana);
  }
  return salida;
};

// geometryRef de la grilla 0.1° = "<lat>_<lon>" del centro de celda.
function coordenadasDeCelda(
  geometryRef: string,
): { lat: number; lon: number } | null {
  const partes = geometryRef.split("_");
  if (partes.length !== 2) return null;
  const lat = Number(partes[0]);
  const lon = Number(partes[1]);
  return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
}

export function crearAdapterLluvia(
  deps: {
    cargarSynop?: CargarSynop;
    cargarClimatologia?: CargarClimatologia;
  } = {},
): PuertoLluviaObservada {
  const cargarSynop = deps.cargarSynop ?? cargarSynopDesdeDb;
  const cargarClimatologia =
    deps.cargarClimatologia ?? cargarClimatologiaDesdeDb;
  // Una sola carga por instancia; si falla, sin climatología (umbral absoluto).
  let climatologia: Promise<Map<string, ClimatologiaPorVentana>> | null = null;
  function climatologiaDe(
    geometryRef: string,
  ): Promise<ClimatologiaPorVentana | undefined> {
    climatologia ??= cargarClimatologia().catch(() => new Map());
    return climatologia.then((m) => m.get(geometryRef));
  }
  // Una consulta por (estación, asOf) por instancia: muchas celdas comparten estación.
  const cache = new Map<string, Promise<PrecipitacionSynop[]>>();

  async function registrosSynop(
    estacionWmo: string,
    asOf: string,
  ): Promise<PrecipitacionSynop[]> {
    const clave = `${estacionWmo}|${asOf}`;
    let pendiente = cache.get(clave);
    if (pendiente === undefined) {
      const desde = new Date(
        Date.parse(asOf) - HORAS_CARGA_SYNOP * 3_600_000,
      ).toISOString();
      pendiente = cargarSynop({ estacionWmo, desde, hasta: asOf }).catch(
        () => [],
      );
      cache.set(clave, pendiente);
    }
    return pendiente;
  }

  return {
    async obtenerAcumulado(params: {
      geometryRef: string;
      asOf: string;
    }): Promise<LluviaObservadaCelda> {
      const acumulados = await obtenerAcumuladosObservados({
        geometryRef: params.geometryRef,
        asOf: new Date(params.asOf),
      });
      const porHorizonte = new Map(
        acumulados.map((fila) => [fila.horizonteHoras, fila]),
      );
      const acumulado24h = porHorizonte.get(24);
      const acumulado72h = porHorizonte.get(72);

      const celda: LluviaObservadaCelda = {
        geometryRef: params.geometryRef,
        acumuladoMm24h: acumulado24h?.acumuladoMm ?? null,
        acumuladoMm72h: acumulado72h?.acumuladoMm ?? null,
        // Ambas ventanas terminan en el mismo gránulo ancla, así que
        // `masRecienteEn` coincide; se toma el de 72 h con fallback a 24 h.
        observadoEn:
          acumulado72h?.masRecienteEn ?? acumulado24h?.masRecienteEn ?? null,
      };
      const clima = await climatologiaDe(params.geometryRef);
      celda.climatologia24h = clima?.[24] ?? null;
      celda.climatologia72h = clima?.[72] ?? null;
      if (celda.acumuladoMm24h !== null) celda.fuente24h = FUENTE_IMERG;
      if (celda.acumuladoMm72h !== null) celda.fuente72h = FUENTE_IMERG;

      const coordenadas = coordenadasDeCelda(params.geometryRef);
      const cercana = coordenadas
        ? estacionSynopMasCercana(
            coordenadas.lat,
            coordenadas.lon,
            RADIO_SYNOP_KM,
          )
        : null;
      if (cercana === null) return celda;

      const registros = await registrosSynop(cercana.estacion.wmo, params.asOf);
      const fuente = `synop:${cercana.estacion.wmo}:${cercana.estacion.nombre}:${cercana.distanciaKm.toFixed(1)}km`;
      const synop24 = acumularSynop(registros, params.asOf, 24);
      const synop72 = acumularSynop(registros, params.asOf, 72);
      if (synop24 !== null) {
        celda.acumuladoMm24h = synop24.acumuladoMm;
        celda.fuente24h = fuente;
      }
      if (synop72 !== null) {
        celda.acumuladoMm72h = synop72.acumuladoMm;
        celda.fuente72h = fuente;
      }
      const ultimaSynop = synop72?.observadoEn ?? synop24?.observadoEn ?? null;
      if (
        ultimaSynop !== null &&
        (celda.observadoEn === null || ultimaSynop > celda.observadoEn)
      ) {
        celda.observadoEn = ultimaSynop;
      }
      return celda;
    },
  };
}
