// Centroides oficiales (Georef/IGN) de los 25 departamentos de Corrientes,
// extraídos a mano de la propiedad `centroide` de cada feature de
// public/data/departamentos-corrientes-georef-2026-09-27.geojson (ver
// lib/mapas/departamentos.ts, que documenta la fuente y versión de ese
// GeoJSON). Se versiona como lista estática en vez de parsear el GeoJSON
// (~43 KB) en cada corrida de un job batch: sólo hacen falta 25 puntos, no
// los polígonos completos.
//
// Único consumidor hoy: lib/infraestructura/riesgo/providers/seasonal.ts (la
// tendencia estacional Open-Meteo se consulta por CENTROIDE de departamento,
// nunca por escuela — ver plan-implementacion §9.3 y
// plan-ejecucion-enos-2026-2027-orca.md §E5).
//
// El nombre de `departamento` es el crudo del GeoJSON (con tildes y
// capitalización original de Georef); usar `normalizarNombreDepartamento` de
// ./normalizar-departamento para comparar contra otras fuentes.
export interface CentroideDepartamento {
  departamento: string
  lat: number
  lon: number
}

export const CENTROIDES_DEPARTAMENTOS_CORRIENTES: CentroideDepartamento[] = [
  { departamento: 'Bella Vista', lat: -28.497387009, lon: -58.930435432 },
  { departamento: 'Berón de Astrada', lat: -27.47797044, lon: -57.611380771 },
  { departamento: 'Capital', lat: -27.522336712, lon: -58.762484236 },
  { departamento: 'Concepción', lat: -28.408399531, lon: -58.031392843 },
  { departamento: 'Curuzú Cuatiá', lat: -29.695466806, lon: -58.324859904 },
  { departamento: 'Empedrado', lat: -27.896112665, lon: -58.6658403 },
  { departamento: 'Esquina', lat: -29.985327367, lon: -59.241381842 },
  { departamento: 'General Alvear', lat: -28.775163187, lon: -56.511530434 },
  { departamento: 'General Paz', lat: -27.719931961, lon: -57.787633185 },
  { departamento: 'Goya', lat: -29.451453509, lon: -59.255912152 },
  { departamento: 'Itatí', lat: -27.346055929, lon: -58.071381791 },
  { departamento: 'Ituzaingó', lat: -27.911308576, lon: -56.790098224 },
  { departamento: 'Lavalle', lat: -28.987990488, lon: -58.933723256 },
  { departamento: 'Mburucuyá', lat: -28.016383899, lon: -58.185563999 },
  { departamento: 'Mercedes', lat: -29.064506764, lon: -57.818385933 },
  { departamento: 'Monte Caseros', lat: -30.228961235, lon: -57.870301872 },
  { departamento: 'Paso de los Libres', lat: -29.59363634, lon: -57.299633836 },
  { departamento: 'Saladas', lat: -28.212468685, lon: -58.619912888 },
  { departamento: 'San Cosme', lat: -27.382298677, lon: -58.517474225 },
  { departamento: 'San Luis del Palmar', lat: -27.602053078, lon: -58.268350823 },
  { departamento: 'San Martín', lat: -28.828980149, lon: -56.931583511 },
  { departamento: 'San Miguel', lat: -27.875859657, lon: -57.410042173 },
  { departamento: 'San Roque', lat: -28.705807189, lon: -58.613035902 },
  { departamento: 'Santo Tomé', lat: -28.231104129, lon: -56.222176625 },
  { departamento: 'Sauce', lat: -29.999503063, lon: -58.794996856 },
]
