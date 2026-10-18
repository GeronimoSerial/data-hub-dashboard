import { GET as radarGET } from '@/app/api/infraestructura/radar/route'
import { filtrosDeAlcance, type AlcanceMapa } from '@/lib/infraestructura/alcance-mapa'
import { filtrarEscuelas, opcionesDireccion, opcionesDisponibles } from '@/lib/infraestructura/mapa/filtrar'
import { etiquetaDepartamento } from '@/lib/infraestructura/mapa/etiquetas'
import { listarEscuelasMapaEnriquecidas } from '@/lib/infraestructura/parte-mapa'
import { crearCacheExportaciones } from './cache'
import { columnasExportacion, filasExportacion, riesgoPorCueDesdeRadar } from './escuelas'
import { HORIZONTE_POR_DEFECTO, type SolicitudExportacion } from './solicitud'

type Consulta = { filas: Record<string, unknown>[]; columnas: ReturnType<typeof columnasExportacion>; totalAlumnos: number }
type Riesgos = ReturnType<typeof riesgoPorCueDesdeRadar>

async function cargarPadron(alcance: AlcanceMapa) {
  const { escuelas } = await listarEscuelasMapaEnriquecidas(filtrosDeAlcance(alcance))
  const direcciones = opcionesDireccion(escuelas)
  return {
    escuelas,
    direcciones,
    opciones: {
      departamentos: opcionesDisponibles(escuelas).departamentos.map(value => ({ value, label: etiquetaDepartamento(value) })),
      direcciones: direcciones.map(d => ({ value: String(d.id), label: d.nombre })),
    },
    consultas: crearCacheExportaciones<Consulta>(16),
    ordenamientos: crearCacheExportaciones<Consulta>(16),
    riesgos: crearCacheExportaciones<Riesgos>(3),
  }
}

const padrones = crearCacheExportaciones<Awaited<ReturnType<typeof cargarPadron>>>(8)
export const invalidarCacheExportaciones = () => padrones.limpiar()

const comparador = new Intl.Collator('es', { numeric: true, sensitivity: 'base' })

function ordenarFilas(filas: Consulta['filas'], clave: string, sentido: 'asc' | 'desc') {
  return [...filas].sort((a, b) => {
    const izquierda = a[clave] instanceof Date ? a[clave].getTime() : a[clave]
    const derecha = b[clave] instanceof Date ? b[clave].getTime() : b[clave]
    const vaciaI = izquierda == null || izquierda === ''
    const vaciaD = derecha == null || derecha === ''
    if (vaciaI || vaciaD) return vaciaI === vaciaD ? 0 : vaciaI ? 1 : -1
    const resultado = typeof izquierda === 'number' && typeof derecha === 'number'
      ? izquierda - derecha : comparador.compare(String(izquierda), String(derecha))
    return sentido === 'desc' ? -resultado : resultado
  })
}

/** Se llama después de autorizar cada request; nunca cachea la autorización. */
export async function consultarExportacion(alcance: AlcanceMapa, solicitud: SolicitudExportacion, request: Request) {
  const alcanceCanonico = alcance.tipo === 'niveles'
    ? { tipo: 'niveles' as const, ids: [...new Set(alcance.ids)].sort((a, b) => a - b) }
    : alcance
  const { estados, filtros, ordenarPor, sentido } = solicitud
  const horizonte = estados.includes('en-riesgo') || solicitud.horizonte !== null
    ? solicitud.horizonte ?? HORIZONTE_POR_DEFECTO : null
  const columnas = columnasExportacion(estados, { riesgo: horizonte !== null })
  if (ordenarPor !== null && !columnas.some(c => c.clave === ordenarPor)) {
    throw new Error('Columna de orden inválida')
  }
  const padron = await padrones.obtener(JSON.stringify(alcanceCanonico), () => cargarPadron(alcanceCanonico))
  // El orden de selección de un filtro no cambia la consulta. La página y el
  // formato tampoco: la vista previa y el Excel reutilizan las mismas filas.
  const filtrosCanonicos = Object.fromEntries(Object.entries(filtros).map(([k, v]) =>
    [k, Array.isArray(v) ? [...v].sort() : v],
  ))
  const clave = JSON.stringify({ estados, filtros: filtrosCanonicos, horizonte })
  const consulta = await padron.consultas.obtener(clave, async () => {
    const riesgoPorCue = horizonte === null ? undefined : await padron.riesgos.obtener(String(horizonte), async () => {
      const url = new URL('/api/infraestructura/radar', request.url)
      url.searchParams.set('horizonte', String(horizonte))
      const respuesta = await radarGET(new Request(url))
      if (!respuesta.ok) throw new Error('No se pudo calcular el riesgo de las escuelas')
      const { puntos } = await respuesta.json() as { puntos: Parameters<typeof riesgoPorCueDesdeRadar>[0] }
      return riesgoPorCueDesdeRadar(puntos, padron.escuelas, horizonte)
    })
    const filas = filasExportacion(estados, filtrarEscuelas(padron.escuelas, filtros), { riesgoPorCue })
    const totalAlumnos = filas.reduce((total, fila) =>
      total + (typeof fila.matricula === 'number' && Number.isFinite(fila.matricula) ? fila.matricula : 0), 0)
    return { columnas, filas, totalAlumnos }
  })
  const ordenada = ordenarPor === null ? consulta : await padron.ordenamientos.obtener(
    JSON.stringify({ clave, ordenarPor, sentido }),
    async () => ({ ...consulta, filas: ordenarFilas(consulta.filas, ordenarPor, sentido) }),
  )
  return { ...ordenada, opciones: padron.opciones, direcciones: padron.direcciones }
}
