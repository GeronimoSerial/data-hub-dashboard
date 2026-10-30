// Parser puro del corte V29 del mockup. Lee el HTML como texto: no ejecuta
// scripts (sin eval, vm ni new Function) y solo extrae los bloques
// `const <nombre>=<JSON>;` de nivel superior.

import type {
  CentroZona,
  CoberturaV29,
  DatasetV29,
  EscuelaV29,
  InformeImportacion,
  OfertaNivel,
  ReferenciaV29,
} from './tipos'

/** Fecha de corte que declara el mockup V29 (28/10/2026). */
export const CORTE_V29 = '2026-10-28'

type Registro = Record<string, unknown>

const CAMPOS_ESCUELA = new Set([
  'cue', 'nombre', 'departamento', 'localidad', 'ambito', 'cui', 'jurisdiccion',
  'modalidad', 'matricula', 'historia', 'lat', 'lon', 'pof', 'agentes', 'zona',
  'sueldos_total', 'personas_sueldos', 'clasificacion_zona_sueldos',
])
const CAMPOS_REFERENTE = new Set([
  'cue', 'nombre', 'lat', 'lon', 'primaria', 'secundaria', 'matriculaPrimaria',
  'localidad', 'departamento',
])
const CAMPOS_CENTRO = new Set(['lat', 'lon', 'id'])

/** Extrae y parsea el JSON de la única línea `const <nombre>=...;` del HTML. */
export function extraerBloqueJson(html: string, nombre: string): unknown {
  const prefijo = `const ${nombre}=`
  const lineas = html
    .split('\n')
    .map((linea) => linea.trim())
    .filter((linea) => linea.startsWith(prefijo))

  if (lineas.length === 0) {
    throw new Error(`Bloque "${nombre}" no encontrado en el HTML del corte V29`)
  }
  if (lineas.length > 1) {
    throw new Error(`Bloque "${nombre}" aparece ${lineas.length} veces en el HTML del corte V29`)
  }

  const cuerpo = lineas[0].slice(prefijo.length).replace(/;$/, '')
  try {
    return JSON.parse(cuerpo)
  } catch (error) {
    const motivo = error instanceof Error ? error.message : String(error)
    throw new Error(`Bloque "${nombre}" no es JSON válido: ${motivo}`)
  }
}

/** Normaliza el HTML del corte V29 en un dataset y un informe de cobertura. */
export function normalizarV29(html: string): { dataset: DatasetV29; informe: InformeImportacion } {
  const data = arreglo(extraerBloqueJson(html, 'data'), 'data')
  const datosNominales = extraerBloqueJson(html, 'datosNominales')
  if (!esRegistro(datosNominales)) {
    throw new Error('Bloque "datosNominales" debe ser un objeto por CUE')
  }
  const referentes = arreglo(extraerBloqueJson(html, 'referentes'), 'referentes')
  const centros = arreglo(extraerBloqueJson(html, 'centers'), 'centers')

  const escuelas = normalizarEscuelas(data)
  const referencias = referentes.map((crudo, i) => normalizarReferencia(crudo, i))
  const centrosZona = centros.map((crudo, i) => normalizarCentro(crudo, i))
  const ofertaPorCue = normalizarOferta(datosNominales)

  // Igual que el mockup: una zona cuenta si coincide con "Zona " + id de un centro.
  const zonasDeCentro = new Set(centrosZona.map((c) => `Zona ${c.id}`))
  const zonasOcupadas = new Set(
    escuelas.map((e) => e.zona).filter((zona) => zona !== '' && zonasDeCentro.has(zona)),
  ).size

  const cobertura: CoberturaV29 = {
    escuelas: escuelas.length,
    alumnos: escuelas.reduce((total, e) => total + e.matricula, 0),
    conCoordenadas: escuelas.filter((e) => Number.isFinite(e.lat) && Number.isFinite(e.lon)).length,
    conImportePositivo: escuelas.filter((e) => e.sueldosTotal !== null).length,
    conRegistrosPof: escuelas.filter((e) => Object.keys(e.pof).length > 0).length,
    centros: centrosZona.length,
    zonasOcupadas,
    historiaPorAnio: contarAniosDeHistoria(escuelas),
  }

  const cuesReferencia = new Set(referencias.map((r) => r.cue))
  const cuesOferta = new Set(Object.keys(ofertaPorCue))

  const camposDescartados = [
    ...camposNoTrasladados(data, CAMPOS_ESCUELA),
    ...camposNoTrasladados(referentes, CAMPOS_REFERENTE),
    ...camposNoTrasladados(centros, CAMPOS_CENTRO),
  ]

  const informe: InformeImportacion = {
    ...cobertura,
    aislados: 0,
    aisladosNota: 'calculado en zonas.ts',
    referencias: referencias.length,
    referenciasPrimaria: referencias.filter((r) => r.primaria).length,
    referenciasSecundaria: referencias.filter((r) => r.secundaria).length,
    clavesOferta: cuesOferta.size,
    referenciasSinOferta: referencias.filter((r) => !cuesOferta.has(r.cue)).length,
    ofertaSinReferencia: [...cuesOferta].filter((cue) => !cuesReferencia.has(cue)).length,
    sinImporte: escuelas.filter((e) => e.sueldosTotal === null).map((e) => e.cue),
    camposDescartados: [...new Set(camposDescartados)].sort(),
  }

  const dataset: DatasetV29 = {
    version: 'V29',
    corte: CORTE_V29,
    escuelas,
    referencias,
    ofertaPorCue,
    centros: centrosZona,
    cobertura,
  }

  return { dataset, informe }
}

function normalizarEscuelas(data: unknown[]): EscuelaV29[] {
  const cuesVistos = new Set<string>()
  return data.map((crudo, i) => {
    const escuela = normalizarEscuela(crudo, i)
    if (cuesVistos.has(escuela.cue)) {
      throw new Error(`CUE duplicado en data: ${escuela.cue}`)
    }
    cuesVistos.add(escuela.cue)
    return escuela
  })
}

function normalizarEscuela(crudo: unknown, indice: number): EscuelaV29 {
  if (!esRegistro(crudo)) throw new Error(`data[${indice}] debe ser un objeto`)
  const cue = cueRequerido(crudo.cue, `data[${indice}].cue`)
  const contexto = `Escuela ${cue}`

  return {
    cue,
    nombre: texto(crudo.nombre),
    departamento: texto(crudo.departamento),
    localidad: texto(crudo.localidad),
    ambito: texto(crudo.ambito),
    cui: texto(crudo.cui),
    jurisdiccion: texto(crudo.jurisdiccion),
    modalidad: texto(crudo.modalidad),
    matricula: numero(crudo.matricula, `${contexto} matricula`),
    historia: normalizarHistoria(crudo.historia, contexto),
    lat: numero(crudo.lat, `${contexto} lat`),
    lon: numero(crudo.lon, `${contexto} lon`),
    pof: esRegistro(crudo.pof) ? { ...crudo.pof } : {},
    agentes: numero(crudo.agentes, `${contexto} agentes`),
    zona: texto(crudo.zona),
    // El mockup trata 0 o negativo como sin costo; aquí se conserva solo lo positivo.
    sueldosTotal: typeof crudo.sueldos_total === 'number' && crudo.sueldos_total > 0
      ? crudo.sueldos_total
      : null,
    personasSueldos: numeroOMas(crudo.personas_sueldos),
    clasificacionZonaSueldos: clasificacionOMas(crudo.clasificacion_zona_sueldos),
  }
}

function normalizarHistoria(valor: unknown, contexto: string): Record<string, number> {
  if (!esRegistro(valor)) return {}
  const historia: Record<string, number> = {}
  for (const [anio, matriculaAnio] of Object.entries(valor)) {
    // Un año sin valor no se convierte en cero: se omite.
    if (matriculaAnio === null || matriculaAnio === undefined) continue
    historia[anio] = numero(matriculaAnio, `${contexto} historia[${anio}]`)
  }
  return historia
}

function normalizarReferencia(crudo: unknown, indice: number): ReferenciaV29 {
  if (!esRegistro(crudo)) throw new Error(`referentes[${indice}] debe ser un objeto`)
  const cue = cueRequerido(crudo.cue, `referentes[${indice}].cue`)
  const contexto = `Referencia ${cue}`

  return {
    cue,
    nombre: texto(crudo.nombre),
    lat: numero(crudo.lat, `${contexto} lat`),
    lon: numero(crudo.lon, `${contexto} lon`),
    primaria: booleano(crudo.primaria, `${contexto} primaria`),
    secundaria: booleano(crudo.secundaria, `${contexto} secundaria`),
    matriculaPrimaria: numero(crudo.matriculaPrimaria, `${contexto} matriculaPrimaria`),
    localidad: texto(crudo.localidad),
    departamento: texto(crudo.departamento),
  }
}

function normalizarCentro(crudo: unknown, indice: number): CentroZona {
  if (!esRegistro(crudo)) throw new Error(`centers[${indice}] debe ser un objeto`)
  return {
    id: numero(crudo.id, `centers[${indice}].id`),
    lat: numero(crudo.lat, `centers[${indice}].lat`),
    lon: numero(crudo.lon, `centers[${indice}].lon`),
  }
}

function normalizarOferta(crudo: Registro): Record<string, Record<string, OfertaNivel>> {
  const oferta: Record<string, Record<string, OfertaNivel>> = {}
  for (const [cue, niveles] of Object.entries(crudo)) {
    if (!esRegistro(niveles)) throw new Error(`datosNominales[${cue}] debe agrupar por nivel`)
    const porNivel: Record<string, OfertaNivel> = {}
    for (const [nivel, registro] of Object.entries(niveles)) {
      porNivel[nivel] = normalizarNivel(registro, `${cue}/${nivel}`)
    }
    oferta[cue] = porNivel
  }
  return oferta
}

function normalizarNivel(crudo: unknown, contexto: string): OfertaNivel {
  if (!esRegistro(crudo)) throw new Error(`${contexto} debe ser un objeto`)
  const turnos: Record<string, number> = {}
  if (esRegistro(crudo.turnos)) {
    for (const [turno, cantidad] of Object.entries(crudo.turnos)) {
      turnos[turno] = numero(cantidad, `${contexto} turnos[${turno}]`)
    }
  }
  return {
    total: numero(crudo.total, `${contexto} total`),
    turnos,
    modalidades: cadenas(crudo.modalidades),
    orientaciones: cadenas(crudo.orientaciones),
  }
}

function contarAniosDeHistoria(escuelas: EscuelaV29[]): Record<string, number> {
  const conteo: Record<string, number> = {}
  for (const escuela of escuelas) {
    for (const anio of Object.keys(escuela.historia)) {
      conteo[anio] = (conteo[anio] ?? 0) + 1
    }
  }
  return conteo
}

/** Campos de origen que ninguna normalización traslada, para informarlos sin descartarlos en silencio. */
function camposNoTrasladados(filas: unknown[], conocidos: Set<string>): string[] {
  return filas.flatMap((fila) => (esRegistro(fila) ? Object.keys(fila).filter((k) => !conocidos.has(k)) : []))
}

function esRegistro(valor: unknown): valor is Registro {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor)
}

function arreglo(valor: unknown, bloque: string): unknown[] {
  if (!Array.isArray(valor)) throw new Error(`Bloque "${bloque}" debe ser un arreglo`)
  return valor
}

function numero(valor: unknown, contexto: string): number {
  if (typeof valor !== 'number' || !Number.isFinite(valor)) {
    throw new Error(`${contexto}: se esperaba un número finito`)
  }
  return valor
}

function numeroOMas(valor: unknown): number | null {
  return typeof valor === 'number' && Number.isFinite(valor) ? valor : null
}

function booleano(valor: unknown, contexto: string): boolean {
  if (typeof valor !== 'boolean') throw new Error(`${contexto}: se esperaba un booleano`)
  return valor
}

function texto(valor: unknown): string {
  if (valor === null || valor === undefined) return ''
  return String(valor)
}

function cueRequerido(valor: unknown, contexto: string): string {
  const cue = texto(valor).trim()
  if (cue === '') throw new Error(`${contexto} es obligatorio`)
  return cue
}

// "NULL" es el valor de origen para clasificación salarial sin dato.
function clasificacionOMas(valor: unknown): string | null {
  const clasificacion = texto(valor).trim()
  return clasificacion === '' || clasificacion === 'NULL' ? null : clasificacion
}

function cadenas(valor: unknown): string[] {
  return Array.isArray(valor) ? valor.map((item) => texto(item)) : []
}
