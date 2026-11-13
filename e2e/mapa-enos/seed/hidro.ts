import { readFileSync } from 'node:fs'
import path from 'node:path'
import { guardarVersion } from '@/lib/infraestructura/datasets/repositorio'
import { publicarCorridaPrefectura } from '@/lib/infraestructura/hidrometria/publicacion'
import type { LecturaResuelta } from '@/lib/infraestructura/hidrometria/lecturas-repo'

// Estaciones hidrométricas del mapa e2e: tres estaciones de Corrientes (Paraná y Uruguay)
// tomadas del catálogo versionado de Prefectura (lib/infraestructura/datasets/__fixtures__/estaciones.json)
// y lecturas con las cifras del extracto de fixture (lib/infraestructura/hidrometria/__fixtures__/prefectura-index.html).
//
// Umbrales por lectura: la app clasifica cada estación con los umbrales de su propia lectura
// (estado-altura.ts), así que la estación en alerta es la que tiene la última altura entre
// alertaM y evacuacionM.
//
// Recorte: el catálogo publicado tiene solo estas tres estaciones. El endpoint
// /api/infraestructura/hidrometria/estaciones devuelve todas las del catálogo con coordenadas,
// y el mapa e2e espera exactamente tres.
//
// Las lecturas se publican con publicarCorridaPrefectura (la función de la app) y un catálogo
// con versión de 64 hex (la misma forma que en producción). Las fechas son relativas al
// momento del seed, dentro de la ventana de vigencia de 18 h.

const RUTA_CATALOGO = 'lib/infraestructura/datasets/__fixtures__/estaciones.json'
const HORA_MS = 3_600_000

export const HORAS_ATRAS_ULTIMA_LECTURA = 2

export const ESPERADOS_HIDRO = {
  estaciones: [
    {
      estacionId: 'pna-corrientes',
      nombre: 'CORRIENTES',
      rio: 'parana',
      rol: 'corrientes',
      lat: -27.46,
      lon: -58.84,
      ultimaLectura: { lecturaM: 6.8, variacionM: 0.35, periodoHoras: 6, estadoPublicado: 'ALERTA', alertaM: 6.5, evacuacionM: 7.0 },
      estado: 'alerta',
      tendencia: 'crece',
      lecturaVencida: false,
      horasAtrasUltimaLectura: HORAS_ATRAS_ULTIMA_LECTURA,
    },
    {
      estacionId: 'pna-itati',
      nombre: 'ITATI',
      rio: 'parana',
      rol: 'corrientes',
      lat: -27.27,
      lon: -58.24,
      ultimaLectura: { lecturaM: 5.98, variacionM: 0.08, periodoHoras: 6, estadoPublicado: 'ESTAC.', alertaM: 6.8, evacuacionM: 7.5 },
      estado: 'normal',
      tendencia: 'crece',
      lecturaVencida: false,
      horasAtrasUltimaLectura: HORAS_ATRAS_ULTIMA_LECTURA,
    },
    {
      estacionId: 'pna-paso-de-los-libres',
      nombre: 'PASO DE LOS LIBRES',
      rio: 'uruguay',
      rol: 'corrientes',
      lat: -29.721111,
      lon: -57.082222,
      ultimaLectura: { lecturaM: 6.75, variacionM: -0.15, periodoHoras: 6, estadoPublicado: 'ESTAC.', alertaM: 7.5, evacuacionM: 8.5 },
      estado: 'normal',
      tendencia: 'baja',
      lecturaVencida: false,
      horasAtrasUltimaLectura: HORAS_ATRAS_ULTIMA_LECTURA,
    },
  ],
  estacionEnAlerta: 'pna-corrientes',
} as const

type LecturaSembrada = {
  estacionId: string
  horasAtras: number
  lecturaM: number
  variacionM: number | null
  estadoPublicado: string
  alertaM: number
  evacuacionM: number
}

// Tres lecturas por estación, de la más antigua a la más reciente (-14 h, -8 h, -2 h).
const LECTURAS: readonly LecturaSembrada[] = [
  { estacionId: 'pna-corrientes', horasAtras: 14, lecturaM: 6.2, variacionM: null, estadoPublicado: 'ESTAC.', alertaM: 6.5, evacuacionM: 7.0 },
  { estacionId: 'pna-corrientes', horasAtras: 8, lecturaM: 6.45, variacionM: 0.25, estadoPublicado: 'ESTAC.', alertaM: 6.5, evacuacionM: 7.0 },
  { estacionId: 'pna-corrientes', horasAtras: 2, lecturaM: 6.8, variacionM: 0.35, estadoPublicado: 'ALERTA', alertaM: 6.5, evacuacionM: 7.0 },
  { estacionId: 'pna-itati', horasAtras: 14, lecturaM: 6.1, variacionM: null, estadoPublicado: 'ESTAC.', alertaM: 6.8, evacuacionM: 7.5 },
  { estacionId: 'pna-itati', horasAtras: 8, lecturaM: 5.9, variacionM: -0.2, estadoPublicado: 'ESTAC.', alertaM: 6.8, evacuacionM: 7.5 },
  { estacionId: 'pna-itati', horasAtras: 2, lecturaM: 5.98, variacionM: 0.08, estadoPublicado: 'ESTAC.', alertaM: 6.8, evacuacionM: 7.5 },
  { estacionId: 'pna-paso-de-los-libres', horasAtras: 14, lecturaM: 7.1, variacionM: null, estadoPublicado: 'ESTAC.', alertaM: 7.5, evacuacionM: 8.5 },
  { estacionId: 'pna-paso-de-los-libres', horasAtras: 8, lecturaM: 6.9, variacionM: -0.2, estadoPublicado: 'ESTAC.', alertaM: 7.5, evacuacionM: 8.5 },
  { estacionId: 'pna-paso-de-los-libres', horasAtras: 2, lecturaM: 6.75, variacionM: -0.15, estadoPublicado: 'ESTAC.', alertaM: 7.5, evacuacionM: 8.5 },
]

export async function sembrarHidro(): Promise<void> {
  const catalogo = leerCatalogoRecortado()
  const catalogoVersion = await guardarVersion({
    datasetId: 'estaciones-prefectura',
    nombre: 'Estaciones hidrométricas',
    revision: 'e2e-2026-10-13',
    fuente: 'Prefectura Naval Argentina (catálogo de fixture, recorte e2e)',
    fechaFuente: '2026-10-13',
    formato: 'array',
    clave: 'estacionId',
    datos: catalogo,
  })

  const ahora = Date.now()
  const filas: LecturaResuelta[] = LECTURAS.map((lectura) => {
    const medida = new Date(ahora - lectura.horasAtras * HORA_MS)
    medida.setUTCMinutes(0, 0, 0)
    return {
      estacionId: lectura.estacionId,
      lecturaM: lectura.lecturaM,
      variacionM: lectura.variacionM,
      periodoHoras: 6,
      medidaEn: medida.toISOString(),
      estadoPublicado: lectura.estadoPublicado,
      lecturaAnteriorM: null,
      medidaAnteriorEn: null,
      alertaM: lectura.alertaM,
      evacuacionM: lectura.evacuacionM,
      inconsistente: false,
      motivosInconsistencia: [],
    }
  })
  completarLecturaAnterior(filas)

  await publicarCorridaPrefectura({
    tipo: 'alturas',
    jobRunId: 'e2e-hidro-seed',
    capturadaEn: new Date(ahora).toISOString(),
    filas,
    catalogoVersion,
  })
}

// Cada lectura guarda la anterior de su estación, como la publica Prefectura.
function completarLecturaAnterior(filas: LecturaResuelta[]): void {
  for (const [indice, fila] of filas.entries()) {
    const previa = filas.slice(0, indice).filter((f) => f.estacionId === fila.estacionId).at(-1)
    if (!previa) continue
    fila.lecturaAnteriorM = previa.lecturaM
    fila.medidaAnteriorEn = previa.medidaEn
  }
}

function leerCatalogoRecortado() {
  const todas = JSON.parse(readFileSync(path.join(process.cwd(), RUTA_CATALOGO), 'utf8')) as {
    prefectura: Array<{ estacionId: string }>
  }
  const ids = new Set<string>(ESPERADOS_HIDRO.estaciones.map((e) => e.estacionId))
  const recorte = todas.prefectura.filter((estacion) => ids.has(estacion.estacionId))
  if (recorte.length !== ids.size) throw new Error('Faltan estaciones del catálogo para el seed hidrométrico')
  return recorte
}
