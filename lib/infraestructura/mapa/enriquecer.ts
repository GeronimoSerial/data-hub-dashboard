import { situacionPrincipal } from '@/lib/infraestructura/relevancia'
import type { AfectacionMapa, EscuelaMapa, ParteMapa } from '@/lib/infraestructura/parte-mapa'
import type {
  AsistenciaPedagogica,
  EstadoEstablecimiento,
  EstadoServicioGeneral,
} from '@/lib/infraestructura/trayectoria-tipos'
import { UMBRAL_SIN_ACTUALIZAR_HORAS } from '@/lib/infraestructura/umbrales'
import type {
  ApoyoPedagogico,
  EstadoClases,
  EscuelaMapaEnriquecida,
  GravedadMapa,
} from './tipos'
import { gravedadDeSeveridad } from './gravedad'

export function derivarClases(
  estado: EstadoEstablecimiento,
  servicio: EstadoServicioGeneral,
): EstadoClases {
  if (estado === 'evacuado') return 'evacuado'
  if (estado === 'centro_evacuados') return 'centro'
  if (estado === 'sin_clases') return 'sin'
  if (servicio === 'suspendido') return 'sin'
  if (servicio === 'parcial') return 'parcial'
  return 'normal'
}

export function derivarApoyo(
  clases: EstadoClases,
  asistencia: AsistenciaPedagogica | null,
): ApoyoPedagogico {
  if (clases === 'normal') return null
  if (asistencia === null) return 'sin_dato'
  if (!asistencia.brinda) return 'no'

  const virtual = asistencia.modalidades.includes('Asistencia virtual')
  const cuadernillo =
    asistencia.modalidades.includes('Cuadernillos digitales') || asistencia.modalidades.includes('Cuadernillos impresos')
  if (virtual && cuadernillo) return 'ambos'
  if (virtual) return 'virtual'
  if (cuadernillo) return 'cuadernillo'
  return 'brinda'
}

export function esSinActualizar(parte: ParteMapa | undefined, ahoraMs: number): boolean {
  if (!parte || parte.afectaciones.length === 0) return false
  const umbralMs = UMBRAL_SIN_ACTUALIZAR_HORAS * 60 * 60 * 1000
  return ahoraMs - Date.parse(parte.actualizadaEn) > umbralMs
}

function situacionesDe(parte: ParteMapa): Array<AfectacionMapa & { estadoEstablecimiento: EstadoEstablecimiento }> {
  return parte.afectaciones.map((afectacion) => ({
    ...afectacion,
    estadoEstablecimiento: parte.estadoEstablecimiento,
  }))
}

function situacionPrincipalDe(parte: ParteMapa | undefined) {
  if (!parte) return null
  return situacionPrincipal(situacionesDe(parte))
}

export function gravedadDe(parte: ParteMapa | undefined): GravedadMapa {
  const principal = situacionPrincipalDe(parte)
  return principal ? gravedadDeSeveridad(principal.severidad) : 0
}

export function enriquecerEscuela(
  e: EscuelaMapa,
  extra: { niveles: string[]; alumnos: number; asistencia: AsistenciaPedagogica | null; situacionesHistoricas: number; solucionadasRecientes: number },
  ahoraMs: number,
): EscuelaMapaEnriquecida {
  const parte = e.parte
  // El edificio y el servicio pertenecen al parte; al solucionar una situación, el servidor no los resetea.
  const tieneSituacionDeEstablecimiento = parte?.afectaciones.some((a) => a.categoria === 'establecimiento') ?? false
  const clases = parte && tieneSituacionDeEstablecimiento
    ? derivarClases(parte.estadoEstablecimiento, parte.servicio)
    : 'normal'
  const principal = situacionPrincipalDe(parte)
  const niveles = [...new Set(extra.niveles.map((nivel) => nivel.trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'es'))

  return {
    cueAnexo: e.cueAnexo,
    nombre: e.nombre,
    departamento: e.departamento,
    localidad: e.localidad,
    lat: e.lat,
    lon: e.lon,
    niveles,
    nivelJurisdiccionalId: e.nivelJurisdiccional?.id ?? null,
    nivelJurisdiccionalNombre: e.nivelJurisdiccional?.nombre ?? null,
    alumnos: extra.alumnos,
    gravedad: principal ? gravedadDeSeveridad(principal.severidad) : 0,
    categoriaPrincipal: principal?.categoria ?? null,
    clases,
    apoyo: derivarApoyo(clases, extra.asistencia),
    sinActualizar: esSinActualizar(parte, ahoraMs),
    ultimaNovedad: parte?.actualizadaEn ?? null,
    alumnosSinClases: clases === 'sin' || clases === 'evacuado' || clases === 'centro' ? extra.alumnos : 0,
    situacionesHistoricas: extra.situacionesHistoricas,
    solucionadasRecientes: extra.solucionadasRecientes,
    ...(parte ? { parte } : {}),
  }
}
