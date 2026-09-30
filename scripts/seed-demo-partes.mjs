#!/usr/bin/env node
/**
 * Siembra datos FICTICIOS de demo para probar a mano el modelo de
 * parte/trayectoria en localhost (odd/tasks/mapa-parte-operativo.md).
 *
 * Hace dos cosas, en dos bases distintas:
 *
 *  A) En schema ge (corte vigente): agrega ge_seccion + ge_alumno_seccion +
 *     ge_alumno_identidad para un subconjunto de establecimientos, porque el
 *     fixture de sync-ge.mjs sólo trae 3 secciones/4 alumnos — casi no hay
 *     matrícula para ejercitar alcance nominal ni conteos por sección.
 *  B) En schema principal (período vigente): agrega infra_parte + infra_afectacion
 *     (+ su alcance de secciones/alumnos) + infra_servicio_alcance +
 *     infra_movimiento, con variedad deliberada de estados para que
 *     listarPartesVigentes (parte-mapa.ts) tenga algo interesante que
 *     mostrar.
 *
 * Usage (requiere gate de seguridad):
 *   DATA_DIR=/tmp/mi-demo DEMO_OK=1 node scripts/seed-demo-partes.mjs --escuelas 80 --sin-padron
 *   DATA_DIR=/tmp/mi-demo DEMO_OK=1 node scripts/seed-demo-partes.mjs --escuelas 85 --padron-real   # partes sobre secciones/alumnos reales del corte vigente
 *   DATA_DIR=/tmp/mi-demo DEMO_OK=1 node scripts/seed-demo-partes.mjs --limpiar   # borra sólo lo sembrado y sale
 *
 * Gate de seguridad: este script inserta datos FICTICIOS de demo. Para evitar
 * correrlo por accidente contra datos reales exige DOS condiciones (si falta
 * cualquiera, imprime el motivo por stderr y sale con código 1 SIN abrir
 * ninguna base):
 *   - DEMO_OK=1
 *   - DATA_DIR seteado explícitamente (no vacío). El default de getDataDir()
 *     (.data en el cwd) NO cuenta como explícito.
 * El gate corre apenas después de process.loadEnvFile(), antes de importar
 * cualquier módulo de infraestructura/DB.
 *
 * Idempotencia: todo lo que este script escribe es identificable sin
 * ambigüedad y se borra antes de reinsertar en cada corrida:
 *   - schema principal: ids de texto con prefijo 'demo-' (infra_parte, infra_afectacion,
 *     infra_servicio_alcance, infra_movimiento). Se borran por LIKE 'demo-%'
 *     antes de sembrar, así una segunda corrida no duplica nada.
 *   - schema ge: ge_section_id y ge_person_id son INTEGER. Se reserva el
 *     rango negativo <= ID_DEMO_BASE (-900000) para los datos ficticios.
 *     Los IDs del padrón real pueden ser mucho mayores que 900000; usar un
 *     rango positivo borraría datos reales durante la limpieza.
 *
 * Semilla de aleatoriedad fija (SEMILLA más abajo): correrlo dos veces con la
 * misma base produce exactamente el mismo resultado.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { registerTsResolver } from './lib/register-ts-resolver.mjs'

// Carga .env manualmente: este script se invoca como `node scripts/...`, sin
// pasar por Next.js (que lo haría solo) ni por vitest (los tests setean las
// env vars ellos mismos). Sin esto, NOMINAL_ENCRYPTION_KEY y DATA_DIR no
// estarían disponibles y el cifrado de identidad fallaría con un mensaje
// confuso.
try {
  process.loadEnvFile()
} catch {
  // noop: si no hay .env (p.ej. CI con las env vars ya exportadas), seguimos.
}

// --- Gate de seguridad (antes de importar/abrir cualquier DB) -------------
// Ver comentario de cabecera. DATA_DIR debe estar EXPLÍCITAMENTE seteado:
// un string vacío o ausente no cuenta (el default .data del cwd sería
// justamente el riesgo que este gate evita).
if (process.env.DEMO_OK !== '1' || !process.env.DATA_DIR) {
  console.error(
    'Este script inserta datos FICTICIOS de demo. Para evitar correrlo por ' +
      'accidente contra datos reales, requiere DEMO_OK=1 y DATA_DIR seteado ' +
      'explícitamente a un directorio de prueba (nunca el de producción). ' +
      'Uso: DATA_DIR=/tmp/mi-demo DEMO_OK=1 node scripts/seed-demo-partes.mjs',
  )
  process.exit(1)
}

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

// Node no completa la extensión '.ts' ni resuelve el alias '@/'. El helper
// vive en scripts/lib, que Docker copia junto con este script.
registerTsResolver(root)

const { crearEjecutorSql, ejecutarEnTransaccion, getCorteVigente } = await import('../lib/infraestructura/ge-db.ts')
const { getRawClient } = await import('../lib/db/index.ts')
// Igual que import-padron.mjs: importamos el módulo de cifrado aislado, no
// identidad.ts, para no arrastrar drizzle-orm/el resto del ORM a la mitad de
// este script que sólo necesita cifrar dos strings.
const { cifrarIdentidad } = await import('../lib/infraestructura/identidad-cripto.ts')

// Funciones puras (sin I/O) reusadas tal cual del dominio: nada de esto
// reimplementa una regla de negocio, sólo arma los datos que esas reglas
// consumen.
const { diffParte } = await import('../lib/infraestructura/movimiento-diff.ts')
const { crearSnapshotVacio } = await import('../lib/infraestructura/trayectoria-tipos.ts')
const { SEVERIDADES } = await import('../lib/infraestructura/validacion.ts')

// --- PRNG determinístico (mulberry32) ------------------------------------
// Math.random() no acepta semilla: sin esto, dos corridas del script
// producirían establecimientos/afectaciones distintos y el requisito de
// idempotencia ("correrlo dos veces produce lo mismo") sería imposible de
// cumplir con datos aleatorios.
const SEMILLA = 20260921

function crearPrng(semilla) {
  let a = semilla >>> 0
  return function siguiente() {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const rand = crearPrng(SEMILLA)

function randInt(min, max) {
  // entero en [min, max], ambos inclusive
  return min + Math.floor(rand() * (max - min + 1))
}

function elegir(lista) {
  return lista[randInt(0, lista.length - 1)]
}

// Fisher-Yates con el PRNG sembrado: mismo criterio de determinismo que
// randInt/elegir.
function barajar(lista) {
  const copia = [...lista]
  for (let i = copia.length - 1; i > 0; i--) {
    const j = randInt(0, i)
    ;[copia[i], copia[j]] = [copia[j], copia[i]]
  }
  return copia
}

// --- PRNG secundario para la variedad nueva ------------------------------
// Restauración de servicio y retiros de afectación usan un stream APARTE del
// principal (randVariedad, con su propia semilla fija). A propósito: así la
// siembra existente (categorías, secciones, alumnos, los idx* históricos)
// queda byte a byte igual a antes de este cambio — el determinismo se
// mantiene (misma semilla => mismo resultado) y ninguna cobertura existente
// se reasigna por azar.
const randVariedad = crearPrng(SEMILLA ^ 0x9e3779b9)

function randIntVariedad(min, max) {
  // entero en [min, max], ambos inclusive
  return min + Math.floor(randVariedad() * (max - min + 1))
}

function barajarVariedad(lista) {
  const copia = [...lista]
  for (let i = copia.length - 1; i > 0; i--) {
    const j = randIntVariedad(0, i)
    ;[copia[i], copia[j]] = [copia[j], copia[i]]
  }
  return copia
}

// --- Namespace de ids demo en ge.sqlite (ver comentario de cabecera) -----
const ID_DEMO_BASE = -900000

// --- Nombres ficticios plausibles para Corrientes ------------------------
// Ningún nombre real: son combinaciones genéricas de nombres/apellidos
// comunes en la región, elegidas para que la app se vea "real" en demo, no
// para representar a nadie.
const NOMBRES = [
  'Martina', 'Mateo', 'Sofía', 'Thiago', 'Valentina', 'Bruno', 'Camila', 'Lucas',
  'Agustina', 'Benjamín', 'Isabella', 'Joaquín', 'Renata', 'Santino', 'Delfina',
  'Facundo', 'Catalina', 'Franco', 'Abril', 'Ignacio', 'Emma', 'Tomás', 'Pilar',
  'Nicolás', 'Guadalupe', 'Gael', 'Milagros', 'Dante', 'Julieta', 'Máximo',
  'Rocío', 'Ramiro', 'Ludmila', 'Bautista', 'Zoe', 'Valentino', 'Morena',
  'Lautaro', 'Antonella', 'Federico',
]
const APELLIDOS = [
  'Benítez', 'Acuña', 'Ojeda', 'Godoy', 'Ríos', 'Cardozo', 'Alegre', 'Aquino',
  'Ibarra', 'Duarte', 'Insaurralde', 'Sanabria', 'Maidana', 'Zalazar',
  'Almirón', 'Base', 'Escobar', 'Gómez', 'Ayala', 'Coronel', 'Ferreyra',
  'Vallejos', 'Roldán', 'Arce', 'Franco', 'Meza', 'Caballero', 'Segovia',
  'Villalba', 'Medina', 'Britez', 'Portillo', 'Chamorro', 'Ledesma',
  'Miño', 'Paredes', 'Frutos', 'Peralta', 'Núñez', 'Bogado',
]

function nombreAlumno() {
  return { nombre: elegir(NOMBRES), apellido: elegir(APELLIDOS) }
}

// --- Descripciones libres para afectaciones -------------------------------
const DESCRIPCIONES_ESTABLECIMIENTO = [
  'El agua ingresó por el patio y llegó hasta las aulas del ala sur.',
  'Techo de chapa levantado por el viento sobre el comedor escolar.',
  'Corte de energía eléctrica desde ayer a la tarde, sin fecha de restitución.',
  'Camino de acceso a la escuela cortado por acumulación de agua.',
  'Se evacuó preventivamente a la comunidad educativa por crecida del arroyo cercano.',
  'Falta el suministro de agua potable en el edificio desde el fin de semana.',
  'Rajaduras nuevas en la pared del aula de 5to grado tras la tormenta.',
  'El SUM funciona como centro de evacuados desde el jueves.',
]
const DESCRIPCIONES_ALUMNOS = [
  'Varias familias quedaron aisladas por el camino rural anegado.',
  'Los alumnos de la zona de la costanera no pueden cruzar por la crecida.',
  'El colectivo escolar no circula por el estado del camino de tierra.',
  'Grupo de alumnos de zona rural sin transporte por el temporal.',
  'Acceso peatonal cortado por acumulación de agua en la calle principal.',
]

function descripcionPara(categoria) {
  return categoria === 'alumnos' ? elegir(DESCRIPCIONES_ALUMNOS) : elegir(DESCRIPCIONES_ESTABLECIMIENTO)
}

// --- Fechas ----------------------------------------------------------------
function horasAtras(horas, desde = Date.now()) {
  return new Date(desde - horas * 60 * 60 * 1000).toISOString()
}
function diasAtras(dias, desde = Date.now()) {
  return horasAtras(dias * 24, desde)
}

async function limpiarHub(hub) {
  // Orden: hijos antes que padres (no confiamos en que la conexión tenga
  // PRAGMA foreign_keys=ON habilitado; el borrado explícito no depende de
  // eso). Todo por LIKE 'demo-%', nunca tocamos filas reales.
  await hub.execute(`DELETE FROM infra_movimiento WHERE id LIKE 'demo-%'`)
  await hub.execute(`DELETE FROM infra_afectacion_seccion WHERE afectacion_id LIKE 'demo-%'`)
  await hub.execute(`DELETE FROM infra_afectacion_alumno WHERE afectacion_id LIKE 'demo-%'`)
  await hub.execute(`DELETE FROM infra_afectacion WHERE id LIKE 'demo-%'`)
  await hub.execute(`DELETE FROM infra_servicio_alcance WHERE id LIKE 'demo-%'`)
  await hub.execute(`DELETE FROM infra_parte WHERE id LIKE 'demo-%'`)
}

async function limpiarGe(ge, corteId) {
  await ge.execute({
    sql: 'DELETE FROM ge.ge_alumno_seccion WHERE corte_id = ? AND ge_person_id <= ?',
    args: [corteId, ID_DEMO_BASE],
  })
  await ge.execute({
    sql: 'DELETE FROM ge.ge_alumno_identidad WHERE ge_person_id <= ?',
    args: [ID_DEMO_BASE],
  })
  await ge.execute({
    sql: 'DELETE FROM ge.ge_seccion WHERE corte_id = ? AND ge_section_id <= ?',
    args: [corteId, ID_DEMO_BASE],
  })
}

// --- Parte A: matrícula en ge.sqlite --------------------------------------

const NIVELES_TURNOS = [
  { nivel: 'Inicial', turno: 'Mañana', cursos: ['Sala 3', 'Sala 4', 'Sala 5'] },
  { nivel: 'Inicial', turno: 'Tarde', cursos: ['Sala 3', 'Sala 4', 'Sala 5'] },
  { nivel: 'Primario', turno: 'Mañana', cursos: ['1', '2', '3', '4', '5', '6', '7'] },
  { nivel: 'Primario', turno: 'Tarde', cursos: ['1', '2', '3', '4', '5', '6', '7'] },
]
const DIVISIONES = ['A', 'B', 'C']

// Elige ~150 establecimientos repartidos entre TODOS los departamentos
// disponibles, proporcional al tamaño de cada departamento (con un mínimo de
// 1 por departamento) para que ningún departamento quede afuera y ninguno
// (como CAPITAL, con 365 de 2005) se lleve la mitad de la muestra.
function elegirEstablecimientos(localizaciones, total, favorecerSurOeste = false) {
  const porDepartamento = new Map()
  for (const loc of localizaciones) {
    const lista = porDepartamento.get(loc.departamento) ?? []
    lista.push(loc)
    porDepartamento.set(loc.departamento, lista)
  }

  const departamentos = [...porDepartamento.keys()].sort()
  const surOeste = new Set(['Esquina', 'Goya', 'Curuzú Cuatiá', 'Mercedes', 'Sauce', 'Lavalle'])
  const elegidos = []
  const restantes = []
  // Cubrimos cada departamento primero; el cupo restante se reparte por sorteo
  // ponderado por tamaño y, para el demo de lluvia, por el sudoeste.
  for (const dep of departamentos) {
    const grupo = barajar(porDepartamento.get(dep))
    if (grupo.length) elegidos.push(grupo[0])
    for (const loc of grupo.slice(1)) {
      const peso = favorecerSurOeste && surOeste.has(dep) ? 3 : 1
      const u = Math.max(Number.EPSILON, rand())
      restantes.push({ loc, clave: -Math.log(u) / peso })
    }
  }
  restantes.sort((a, b) => a.clave - b.clave)
  return [...elegidos, ...restantes.slice(0, Math.max(0, total - elegidos.length)).map(({ loc }) => loc)].slice(0, total)
}

async function sembrarMatricula(ge, corteId, establecimientos) {
  let seccionIdCounter = ID_DEMO_BASE
  let personIdCounter = ID_DEMO_BASE

  let totalSecciones = 0
  let totalAlumnos = 0
  const establecimientosConSecciones = []
  // geSectionId -> ge_person_id[] matriculados, armado acá mismo (en
  // memoria) para que sembrarPartes no tenga que volver a consultar
  // ge.sqlite: son los mismos alumnos que se acaban de insertar arriba.
  const alumnosPorSeccionGlobal = new Map()

  // Orden estable (por cueAnexo) para que el conteo de ids sea idéntico
  // corrida tras corrida — determinismo de principio a fin, no sólo en el
  // contenido, también en qué id le toca a qué sección/alumno.
  const ordenados = [...establecimientos].sort((a, b) => a.cueAnexo.localeCompare(b.cueAnexo))

  for (const est of ordenados) {
    const cantidadSecciones = randInt(2, 6)
    const combosDisponibles = barajar(NIVELES_TURNOS)
    const seccionesDeEsteCue = []

    for (let i = 0; i < cantidadSecciones; i++) {
      const combo = combosDisponibles[i % combosDisponibles.length]
      const geSectionId = seccionIdCounter--
      const curso = elegir(combo.cursos)
      const division = elegir(DIVISIONES)

      await ge.execute({
        sql: 'INSERT INTO ge.ge_seccion (corte_id, ge_section_id, cue_anexo, curso, division, nivel, turno) VALUES (?,?,?,?,?,?,?)',
        args: [corteId, geSectionId, est.cueAnexo, curso, division, combo.nivel, combo.turno],
      })

      const cantidadAlumnos = randInt(12, 35)
      const idsDeEstaSeccion = []
      for (let j = 0; j < cantidadAlumnos; j++) {
        const gePersonId = personIdCounter--
        const { nombre, apellido } = nombreAlumno()

        await ge.execute({
          sql: 'INSERT INTO ge.ge_alumno_seccion (corte_id, ge_section_id, ge_person_id) VALUES (?,?,?)',
          args: [corteId, geSectionId, gePersonId],
        })
        const payloadCifrado = cifrarIdentidad(nombre, apellido)
        await ge.execute({
          sql: `INSERT INTO ge.ge_alumno_identidad (ge_person_id, payload_cifrado) VALUES (?, ?)
                ON CONFLICT(ge_person_id) DO UPDATE SET payload_cifrado = excluded.payload_cifrado`,
          args: [gePersonId, payloadCifrado],
        })
        idsDeEstaSeccion.push(gePersonId)
      }
      alumnosPorSeccionGlobal.set(geSectionId, idsDeEstaSeccion)

      totalAlumnos += cantidadAlumnos
      seccionesDeEsteCue.push({ geSectionId, turno: combo.turno })
    }

    totalSecciones += cantidadSecciones
    establecimientosConSecciones.push({ ...est, secciones: seccionesDeEsteCue })
  }

  return { establecimientosConSecciones, totalSecciones, totalAlumnos, alumnosPorSeccionGlobal }
}

// --- Parte A': matrícula REAL del corte vigente (--padron-real) ----------
// Uses the imported padrón as is: picks schools that already have sections in
// the current cut and reads their real sections and enrolled students. It
// never writes to schema ge, so the real padrón is left untouched.
async function cargarMatriculaReal(ge, corteId, localizaciones, total) {
  const conSeccionesRes = await ge.execute({
    sql: 'SELECT DISTINCT cue_anexo FROM ge.ge_seccion WHERE corte_id = ? AND ge_section_id > 0',
    args: [corteId],
  })
  const conSecciones = new Set(conSeccionesRes.rows.map((r) => String(r.cue_anexo)))
  const candidatas = localizaciones.filter((l) => conSecciones.has(l.cueAnexo))
  const establecimientos = elegirEstablecimientos(candidatas, total, true)

  const establecimientosConSecciones = []
  const alumnosPorSeccionGlobal = new Map()
  let totalSecciones = 0
  let totalAlumnos = 0
  for (const est of establecimientos) {
    const seccionesRes = await ge.execute({
      sql: 'SELECT ge_section_id, turno FROM ge.ge_seccion WHERE corte_id = ? AND cue_anexo = ? AND ge_section_id > 0 ORDER BY ge_section_id',
      args: [corteId, est.cueAnexo],
    })
    const secciones = seccionesRes.rows.map((r) => ({ geSectionId: Number(r.ge_section_id), turno: String(r.turno) }))
    for (const s of secciones) {
      const alumnosRes = await ge.execute({
        sql: 'SELECT ge_person_id FROM ge.ge_alumno_seccion WHERE corte_id = ? AND ge_section_id = ? AND ge_person_id > 0 ORDER BY ge_person_id',
        args: [corteId, s.geSectionId],
      })
      const ids = alumnosRes.rows.map((r) => Number(r.ge_person_id))
      alumnosPorSeccionGlobal.set(s.geSectionId, ids)
      totalAlumnos += ids.length
    }
    totalSecciones += secciones.length
    establecimientosConSecciones.push({ ...est, secciones })
  }
  return { establecimientosConSecciones, totalSecciones, totalAlumnos, alumnosPorSeccionGlobal }
}

// --- Parte B: partes en hub.sqlite -----------------------------------------

const MOTIVOS_ESTABLECIMIENTO = [
  { id: 'inundacion', nombre: 'Inundación' },
  { id: 'tormenta-severa', nombre: 'Tormenta severa' },
  { id: 'sin-energia-o-agua', nombre: 'Sin energía o agua' },
  { id: 'evacuacion-preventiva', nombre: 'Evacuación preventiva' },
  { id: 'otro-establecimiento', nombre: 'Otro problema en el establecimiento' },
]
const MOTIVOS_ALUMNOS = [
  { id: 'anegamiento', nombre: 'Anegamiento' },
  { id: 'acceso-interrumpido', nombre: 'Acceso interrumpido' },
  { id: 'otro-alumnos', nombre: 'Otro problema de acceso' },
]

function motivoPara(categoria) {
  return categoria === 'alumnos' ? elegir(MOTIVOS_ALUMNOS) : elegir(MOTIVOS_ESTABLECIMIENTO)
}

// Arma una afectación "de dominio" (para el diff) + sus filas de alcance
// (para persistir). alumnosPorSeccion viene de sembrarMatricula: mapa
// geSectionId -> array de ge_person_id matriculados.
function armarAfectacion({ id, parteId, categoria, severidad, rigeDesde, creadaEn, secciones, alumnosPorSeccion, retiradaEn = null }) {
  const motivo = motivoPara(categoria)
  const descripcion = descripcionPara(categoria)

  const seccionesAlcance = secciones.map(({ geSectionId, completa }) => {
    const matriculados = alumnosPorSeccion.get(geSectionId) ?? []
    if (completa || matriculados.length === 0) {
      return { geSectionId, seccionCompleta: true, alumnos: matriculados }
    }
    // Selección parcial: entre 2 y la mitad de los matriculados (mínimo 1),
    // barajados de forma determinista.
    const cantidad = Math.max(1, Math.min(matriculados.length, randInt(2, Math.max(2, Math.ceil(matriculados.length / 2)))))
    const parcial = barajar(matriculados).slice(0, cantidad)
    return { geSectionId, seccionCompleta: false, alumnos: parcial }
  })

  return {
    dominio: {
      id,
      parteId,
      motivo: motivo.nombre,
      categoria,
      severidad,
      descripcion,
      rigeDesde,
      creadaEn,
      retiradaEn,
      secciones: seccionesAlcance,
    },
  }
}

async function insertarAfectacion(hub, a) {
  await hub.execute({
    sql: `INSERT INTO infra_afectacion (id, parte_id, motivo, categoria, severidad, descripcion, rige_desde, creada_en, retirada_en)
          VALUES (?,?,?,?,?,?,?,?,?)`,
    args: [a.id, a.parteId, a.motivo, a.categoria, a.severidad, a.descripcion, a.rigeDesde, a.creadaEn, a.retiradaEn],
  })
  for (const seccion of a.secciones) {
    await hub.execute({
      sql: 'INSERT INTO infra_afectacion_seccion (afectacion_id, ge_section_id) VALUES (?,?)',
      args: [a.id, seccion.geSectionId],
    })
    if (!seccion.seccionCompleta) {
      for (const gePersonId of seccion.alumnos) {
        await hub.execute({
          sql: 'INSERT INTO infra_afectacion_alumno (afectacion_id, ge_person_id) VALUES (?,?)',
          args: [a.id, gePersonId],
        })
      }
    }
  }
}

async function insertarServicioAlcance(hub, servicio) {
  await hub.execute({
    sql: `INSERT INTO infra_servicio_alcance (id, parte_id, tipo, referencia_id, estado, rige_desde, creada_en, retirada_en)
          VALUES (?,?,?,?,?,?,?,?)`,
    args: [
      servicio.id,
      servicio.parteId,
      servicio.tipo,
      servicio.referenciaId,
      servicio.estado,
      servicio.rigeDesde,
      servicio.creadaEn,
      servicio.retiradaEn ?? null,
    ],
  })
}

async function insertarMovimiento(hub, movimiento) {
  await hub.execute({
    sql: `INSERT INTO infra_movimiento (id, parte_id, tipo, rol, resumen, rige_desde, creada_en, idempotency_key)
          VALUES (?,?,?,?,?,?,?,?)`,
    args: [
      movimiento.id,
      movimiento.parteId,
      movimiento.tipo,
      movimiento.rol,
      JSON.stringify(movimiento.resumen),
      movimiento.rigeDesde,
      movimiento.creadaEn,
      null,
    ],
  })
}

const argumentoEscuelas = process.argv.indexOf('--escuelas')
const totalSolicitado = argumentoEscuelas >= 0 ? Number(process.argv[argumentoEscuelas + 1]) : 50
if (!Number.isInteger(totalSolicitado) || totalSolicitado < 1) throw new Error('--escuelas debe ser un entero positivo')
const TOTAL_PARTES = totalSolicitado
const escalar = (n) => Math.round(n * TOTAL_PARTES / 50)
const CANT_EVACUADO = escalar(6)
const CANT_CENTRO_EVACUADOS = escalar(4)
const CANT_PARCIAL = escalar(5)
const CANT_HABITUAL = TOTAL_PARTES - CANT_EVACUADO - CANT_CENTRO_EVACUADOS - CANT_PARCIAL
// Cada parte conserva al menos una afectación visible. Las afectaciones
// retiradas se representan en CANT_AFECTACION_RETIRADA sin hacer desaparecer
// escuelas del mapa.
const CANT_TODO_RETIRADO = 0
const CANT_SERVICIO_SUSPENDIDO = Math.min(TOTAL_PARTES - CANT_TODO_RETIRADO, escalar(5))
const CANT_SERVICIO_PARCIAL = Math.min(TOTAL_PARTES - CANT_TODO_RETIRADO - CANT_SERVICIO_SUSPENDIDO, escalar(10))
const CANT_SERVICIO_RESTAURADO = Math.min(TOTAL_PARTES - CANT_TODO_RETIRADO - CANT_SERVICIO_SUSPENDIDO - CANT_SERVICIO_PARCIAL, escalar(6))
const CANT_AFECTACION_RETIRADA = Math.min(TOTAL_PARTES - CANT_TODO_RETIRADO, escalar(15))
const CANT_SIN_REPORTAR = Math.min(TOTAL_PARTES, escalar(8))

async function sembrarPartes(hub, periodoId, corteId, establecimientosConSecciones, alumnosPorSeccionGlobal) {
  // Sólo establecimientos con matrícula real (sembrada en Parte A) — pedido
  // explícito de la consigna. Orden estable por cueAnexo, mismo criterio que
  // sembrarMatricula, para que la asignación de ids/roles sea determinista.
  const candidatos = [...establecimientosConSecciones].sort((a, b) => a.cueAnexo.localeCompare(b.cueAnexo))
  const elegidos = barajar(candidatos).slice(0, TOTAL_PARTES)

  const estados = [
    ...Array(CANT_HABITUAL).fill('habitual'),
    ...Array(CANT_PARCIAL).fill('parcial'),
    ...Array(CANT_EVACUADO).fill('evacuado'),
    ...Array(CANT_CENTRO_EVACUADOS).fill('centro_evacuados'),
  ]

  // Índices (dentro de 'elegidos') marcados con cada variedad. Todos por
  // sorteo determinista y sin superposición donde importa (todoRetirado no
  // se cruza con servicio, para que cada característica sea observable
  // limpiamente).
  const indices = elegidos.map((_, i) => i)
  const barajados = barajar(indices)

  const idxTodoRetirado = new Set(barajados.slice(0, CANT_TODO_RETIRADO))
  const resto = barajados.slice(CANT_TODO_RETIRADO)
  const idxServicioSuspendido = new Set(resto.slice(0, CANT_SERVICIO_SUSPENDIDO))
  const idxServicioParcial = new Set(resto.slice(CANT_SERVICIO_SUSPENDIDO, CANT_SERVICIO_SUSPENDIDO + CANT_SERVICIO_PARCIAL))
  const idxSinReportar = new Set(barajar(indices).slice(0, CANT_SIN_REPORTAR))

  // Servicio "suspendido y restaurado": slice contiguo de `resto`, por lo que
  // queda disjunto de todoRetirado/suspendido/parcial. La fila lleva
  // retiradaEn en el pasado (mitad del período) para que la serie de
  // evolución muestre la caída y después la restauración.
  const idxServicioRestaurado = new Set(
    resto.slice(
      CANT_SERVICIO_SUSPENDIDO + CANT_SERVICIO_PARCIAL,
      CANT_SERVICIO_SUSPENDIDO + CANT_SERVICIO_PARCIAL + CANT_SERVICIO_RESTAURADO,
    ),
  )
  // Candidatos a retirar UNA afectación por parte (los que terminen con 2+
  // afectaciones). Se sortean con el PRNG secundario para no tocar el stream
  // principal; mismos helpers barajar/randInt que los otros idx*.
  const idxAfectacionRetirada = new Set(barajarVariedad(resto).slice(0, CANT_AFECTACION_RETIRADA))

  const resumen = {
    partes: 0,
    afectaciones: 0,
    servicios: 0,
    movimientos: 0,
    porEstadoServicio: { normal: 0, parcial: 0, suspendido: 0 },
    serviciosRestaurados: 0,
    afectacionesRetiradas: 0,
  }
  let severidadCiclo = 0

  const ahora = Date.now()

  for (let i = 0; i < elegidos.length; i++) {
    const est = elegidos[i]
    const parteId = `demo-parte-${String(i + 1).padStart(3, '0')}`
    const estadoEstablecimiento = estados[i]

    // rigeDesde repartido en las últimas 6 semanas (42 días), con un piso de
    // 7 días: así siempre queda margen para que actualizadaEn (calculado
    // debajo) sea estrictamente posterior a la creación, incluso en el caso
    // "sin reportar" (actualizado hace más de 72hs, pero nunca ANTES de
    // creado — sería una trayectoria imposible).
    const antiguedadDias = randInt(7, 42)
    const rigeDesdeParte = diasAtras(antiguedadDias, ahora)
    const creadaEn = rigeDesdeParte
    const antiguedadHorasMax = antiguedadDias * 24 - 1 // margen estricto contra creadaEn

    const actualizadaEn = idxSinReportar.has(i)
      ? horasAtras(randInt(73, Math.min(300, antiguedadHorasMax)), ahora) // > UMBRAL_SIN_REPORTAR_HORAS (72h)
      : horasAtras(randInt(0, Math.min(60, antiguedadHorasMax)), ahora)

    await hub.execute({
      sql: `INSERT INTO infra_parte
              (id, periodo_id, cue_anexo, estado_establecimiento, estado_establecimiento_rige_desde, corte_id, creada_en, actualizada_en)
            VALUES (?,?,?,?,?,?,?,?)`,
      args: [parteId, periodoId, est.cueAnexo, estadoEstablecimiento, rigeDesdeParte, corteId, creadaEn, actualizadaEn],
    })
    resumen.partes++

    const alumnosPorSeccion = new Map(
      est.secciones.map((s) => [s.geSectionId, alumnosPorSeccionGlobal.get(s.geSectionId) ?? []]),
    )

    const todoRetirado = idxTodoRetirado.has(i)
    // Para el parte "todo retirado" forzamos una sola afectación: así el
    // movimiento de actualización que la retira describe exactamente lo que
    // pasó en la base, sin filas huérfanas que ningún movimiento explique.
    const cantidadAfectaciones = todoRetirado ? 1 : randInt(1, 3)
    const seccionesBarajadas = barajar(est.secciones)

    const afectacionesFinal = []
    const afectacionesIniciales = []

    for (let a = 0; a < cantidadAfectaciones; a++) {
      const categoria = elegir(['establecimiento', 'alumnos'])
      const severidad = SEVERIDADES[severidadCiclo % SEVERIDADES.length]
      severidadCiclo++

      const afectacionId = `demo-afectacion-${parteId.slice('demo-parte-'.length)}-${a + 1}`
      // Alcance: alterna secciones "completas" (sin filas de alumno) y
      // "parciales" (con selección), tomando 1 a 2 secciones del
      // establecimiento — nunca más de las que realmente tiene.
      const cantidadSecciones = Math.min(seccionesBarajadas.length, randInt(1, 2))
      const seccionesElegidas = seccionesBarajadas
        .slice(0, cantidadSecciones)
        .map((s, idx) => ({ geSectionId: s.geSectionId, completa: (a + idx) % 2 === 0 }))

      const rigeDesdeAfectacion = rigeDesdeParte
      // Retiradas: las partes 'todoRetirado' se retiran con la actualización
      // (como hoy). Además, en un subconjunto de partes con 2+ afectaciones
      // (idxAfectacionRetirada) se retira UNA — la última — con una fecha
      // propia distribuida en los últimos 5-30 días: la situación de esa
      // afectación se resolvió sin sacar al parte del mapa (siempre queda al
      // menos una afectación vigente).
      const esAfectacionRetirada =
        !todoRetirado &&
        idxAfectacionRetirada.has(i) &&
        cantidadAfectaciones >= 2 &&
        a === cantidadAfectaciones - 1

      const retiradaEn = todoRetirado
        ? actualizadaEn
        : esAfectacionRetirada
          ? diasAtras(randIntVariedad(5, Math.min(30, antiguedadDias - 1)), ahora)
          : null

      const { dominio } = armarAfectacion({
        id: afectacionId,
        parteId,
        categoria,
        severidad,
        rigeDesde: rigeDesdeAfectacion,
        creadaEn,
        secciones: seccionesElegidas,
        alumnosPorSeccion,
        retiradaEn,
      })

      await insertarAfectacion(hub, dominio)
      resumen.afectaciones++
      if (esAfectacionRetirada) resumen.afectacionesRetiradas++

      // La afectación retirada NO va al snapshot final (que modela el conjunto
      // vigente: una afectación retirada desaparece del after aunque su fila
      // siga existiendo con retiradaEn — mismo criterio que 'todoRetirado',
      // ver movimiento-diff.ts). Sí va a la inicial (con retiradaEn null: era
      // vigente al momento del reporte) para que el diff de actualización la
      // narre como retirada.
      if (!todoRetirado && !esAfectacionRetirada) afectacionesFinal.push(dominio)
      // La "inicial" (para el diff de reporte_inicial) sólo trae la primera
      // afectación: modela que el resto se agregó en una actualización
      // posterior, sin necesidad de tocar más filas reales. La excepción es la
      // afectación retirada de los partes con 2+: se informó en el reporte
      // inicial (vigente) y la retirada llega después.
      if (a === 0 || esAfectacionRetirada) afectacionesIniciales.push({ ...dominio, retiradaEn: null })
    }

    // --- Servicio educativo ---
    const serviciosFinal = []
    const serviciosIniciales = []
    let estadoServicioEsperado = 'normal'

    if (idxServicioSuspendido.has(i)) {
      const servicioId = `demo-servicio-${parteId.slice('demo-parte-'.length)}-1`
      const s = {
        id: servicioId,
        parteId,
        tipo: 'establecimiento',
        referenciaId: null,
        estado: 'suspendido',
        rigeDesde: rigeDesdeParte,
        creadaEn,
        retiradaEn: null,
      }
      await insertarServicioAlcance(hub, s)
      resumen.servicios++
      serviciosFinal.push(s)
      estadoServicioEsperado = 'suspendido'
    } else if (idxServicioParcial.has(i)) {
      const seccionElegida = est.secciones.length > 0 ? elegir(est.secciones) : null
      const servicioId = `demo-servicio-${parteId.slice('demo-parte-'.length)}-1`
      const s = {
        id: servicioId,
        parteId,
        tipo: seccionElegida ? 'seccion' : 'turno',
        referenciaId: seccionElegida ? String(seccionElegida.geSectionId) : 'Mañana',
        estado: 'suspendido',
        rigeDesde: rigeDesdeParte,
        creadaEn,
        retiradaEn: null,
      }
      await insertarServicioAlcance(hub, s)
      resumen.servicios++
      serviciosFinal.push(s)
      estadoServicioEsperado = seccionElegida
        ? (est.secciones.length > 1 ? 'parcial' : 'suspendido')
        : 'parcial'
    } else if (idxServicioRestaurado.has(i)) {
      // Servicio suspendido al inicio y RESTAURADO a mitad del período: la
      // fila se inserta con retiradaEn entre rigeDesdeParte y actualizadaEn
      // (mitad del intervalo), simulando "estuvo caído y se restableció a
      // mitad de la vigencia". Para la serie de evolución esto cuenta como
      // caído hasta esa fecha y como normal desde entonces — el intervalo
      // semiabierto [rigeDesde, retiradaEn) de vigencia-alcance.ts.
      //
      // Para el reporte de HOY el estado es 'normal': tras retiradaEn el
      // servicio cuenta como restaurado a partir de esa fecha (eso es lo que
      // calcula calcularEstadoServicioGeneral al resolver la vigencia con
      // retiradaEn). Por eso estadoServicioEsperado se computa igual que si
      // no hubiera fila vigente.
      const servicioId = `demo-servicio-${parteId.slice('demo-parte-'.length)}-1`
      const msRestaurado =
        new Date(rigeDesdeParte).getTime() +
        Math.round((new Date(actualizadaEn).getTime() - new Date(rigeDesdeParte).getTime()) / 2)
      const s = {
        id: servicioId,
        parteId,
        tipo: 'establecimiento',
        referenciaId: null,
        estado: 'suspendido',
        rigeDesde: rigeDesdeParte,
        creadaEn,
        retiradaEn: new Date(msRestaurado).toISOString(),
      }
      await insertarServicioAlcance(hub, s)
      resumen.servicios++
      resumen.serviciosRestaurados++
      // La fila se informó suspendida en el reporte inicial (por eso va al
      // snapshot INICIAL con retiradaEn null, vigente en ese momento) y hoy
      // quedó restaurada (no está en el final, que modela el conjunto
      // vigente): el diff de actualización narra "suspendido → normal" en vez
      // de un alta sin baja.
      serviciosIniciales.push({ ...s, retiradaEn: null })
      estadoServicioEsperado = 'normal'
    }
    resumen.porEstadoServicio[estadoServicioEsperado]++

    // --- Movimientos (trayectoria) ---
    const snapshotVacio = crearSnapshotVacio('habitual')
    const snapshotInicial = {
      estadoEstablecimiento: 'habitual',
      afectaciones: afectacionesIniciales,
      servicioAlcance: serviciosIniciales,
    }
    const snapshotFinal = {
      estadoEstablecimiento,
      afectaciones: afectacionesFinal,
      servicioAlcance: serviciosFinal,
    }

    const diffInicial = diffParte(snapshotVacio, snapshotInicial)
    const movimientoInicialId = `demo-movimiento-${parteId.slice('demo-parte-'.length)}-1`
    await insertarMovimiento(hub, {
      id: movimientoInicialId,
      parteId,
      tipo: 'reporte_inicial',
      rol: 'director',
      resumen: diffInicial,
      rigeDesde: rigeDesdeParte,
      creadaEn,
    })
    resumen.movimientos++

    // Actualización posterior: sólo cuando el estado inicial y el final
    // difieren de verdad (más afectaciones, servicio nuevo, cambio de
    // establecimiento o afectaciones retiradas) — evita un movimiento con
    // diff vacío, que nunca ocurre en el flujo real (esDiffVacio lo bloquea).
    const diffActualizacion = diffParte(snapshotInicial, snapshotFinal)
    const huboCambio =
      diffActualizacion.afectacionesAgregadas.length > 0 ||
      diffActualizacion.afectacionesRetiradas.length > 0 ||
      diffActualizacion.serviciosCambiados.length > 0 ||
      diffActualizacion.establecimientoCambiado !== null

    if (huboCambio) {
      const movimientoActualizacionId = `demo-movimiento-${parteId.slice('demo-parte-'.length)}-2`
      await insertarMovimiento(hub, {
        id: movimientoActualizacionId,
        parteId,
        tipo: 'actualizacion',
        rol: 'director',
        resumen: diffActualizacion,
        rigeDesde: actualizadaEn,
        creadaEn: actualizadaEn,
      })
      resumen.movimientos++
    }
  }

  return resumen
}

async function main() {
  const limpiarSolo = process.argv.includes('--limpiar')
  const sinPadronForzado = process.argv.includes('--sin-padron')
  const padronReal = process.argv.includes('--padron-real')

  const { ensureSeeded } = await import('../lib/db/seed.ts')
  await ensureSeeded()

  const raw = crearEjecutorSql(getRawClient())
  const ge = raw
  const hub = raw

  let corte = null
  if (!sinPadronForzado) {
    try { corte = await getCorteVigente(ge) } catch { corte = null }
  }

  if (limpiarSolo) {
    await ejecutarEnTransaccion(getRawClient(), (tx) => limpiarHub(tx))
    if (corte && !padronReal) await ejecutarEnTransaccion(getRawClient(), (tx) => limpiarGe(tx, corte.id))
    console.log('Datos de demo eliminados (schemas principal + ge).')
    return
  }

  // Período vigente: se REUSA el que ya exista, nunca se crea uno nuevo
  // salvo que no haya ninguno (instrucción explícita).
  let periodoRes = await hub.execute("SELECT id FROM infra_periodo WHERE estado = 'vigente' LIMIT 1")
  let periodoId
  if (periodoRes.rows.length > 0) {
    periodoId = String(periodoRes.rows[0].id)
  } else {
    periodoId = 'demo-periodo-enos'
    const ahoraIso = new Date().toISOString()
    await hub.execute({
      sql: `INSERT INTO infra_periodo (id, nombre, inicio_en, fin_en, estado, creada_en) VALUES (?,?,?,?,'vigente',?)`,
      args: [periodoId, 'Período de demo (creado por seed-demo-partes.mjs)', ahoraIso, null, ahoraIso],
    })
    console.log(`ADVERTENCIA: no había ningún infra_periodo vigente. Se creó uno nuevo: ${periodoId}`)
  }

  const localizacionesRes = await ge.execute('SELECT cue_anexo, departamento FROM ge.ge_localizacion')
  const localizaciones = localizacionesRes.rows.map((r) => ({
    cueAnexo: String(r.cue_anexo),
    departamento: String(r.departamento),
  }))

  const establecimientos = elegirEstablecimientos(localizaciones, TOTAL_PARTES, true)
  console.log(`Escuelas de demo elegidas: ${establecimientos.length} en ${new Set(establecimientos.map((e) => e.departamento)).size} departamentos.`)

  // Parte A entera (limpieza + siembra) en UNA transacción: miles de
  // inserts uno por uno, cada uno con su propio commit/fsync, tardaban
  // varios minutos. Agrupados en una sola transacción de escritura, SQLite
  // sólo fsync-ea una vez al final — la corrida pasa de minutos a segundos
  // sin cambiar una sola fila de lo que se inserta.
  let establecimientosConSecciones = []
  let totalSecciones = 0
  let totalAlumnos = 0
  let alumnosPorSeccionGlobal = new Map()
  if (corte && padronReal) {
    ;({ establecimientosConSecciones, totalSecciones, totalAlumnos, alumnosPorSeccionGlobal } =
      await cargarMatriculaReal(ge, corte.id, localizaciones, TOTAL_PARTES))
    console.log(`Parte A (padrón real, sin escrituras en ge): ${establecimientosConSecciones.length} escuelas, ${totalSecciones} secciones, ${totalAlumnos} alumnos (corte ${corte.id}).`)
  } else if (corte) {
    const matricula = await ejecutarEnTransaccion(getRawClient(), async (tx) => {
      await limpiarGe(tx, corte.id)
      return sembrarMatricula(tx, corte.id, establecimientos)
    })
    ;({ establecimientosConSecciones, totalSecciones, totalAlumnos, alumnosPorSeccionGlobal } = matricula)
    console.log(`Parte A: ${totalSecciones} secciones y ${totalAlumnos} alumnos sembrados en schema ge (corte ${corte.id}).`)
  } else {
    establecimientosConSecciones = establecimientos.map((escuela) => ({ ...escuela, secciones: [] }))
    console.log('Modo sin padrón: partes sin secciones ni alumnos nominales.')
  }

  // Mismo criterio para Parte B.
  const resumen = await ejecutarEnTransaccion(getRawClient(), async (tx) => {
    await limpiarHub(tx)
    return sembrarPartes(tx, periodoId, corte?.id ?? 0, establecimientosConSecciones, alumnosPorSeccionGlobal)
  })

  console.log(
    `Parte B: ${resumen.partes} partes, ${resumen.afectaciones} afectaciones, ${resumen.servicios} filas de servicio_alcance, ${resumen.movimientos} movimientos.`,
  )
  console.log(
    `  Desglose por estado de servicio (esperado, ver verificación con listarPartesVigentes): normal=${resumen.porEstadoServicio.normal}, parcial=${resumen.porEstadoServicio.parcial}, suspendido=${resumen.porEstadoServicio.suspendido}`,
  )
  console.log(`  Con retiradaEn: ${resumen.serviciosRestaurados} servicios restaurados y ${resumen.afectacionesRetiradas} afectaciones retiradas.`)
}

// --- Parte C: verificación end-to-end contra listarPartesVigentes --------
async function verificar() {
  if (process.argv.includes('--limpiar')) return
  const { listarPartesVigentes } = await import('../lib/infraestructura/parte-mapa.ts')
  const { partes, indicadores } = await listarPartesVigentes()

  console.log('\n--- Verificación: listarPartesVigentes() ---')
  console.log('Indicadores:', JSON.stringify(indicadores, null, 2))
  console.log(`Total de partes devueltos: ${partes.length}`)
  console.log('Primeras 3 escuelas:')
  for (const p of partes.slice(0, 3)) {
    console.log(
      `  - ${p.nombre} (${p.cueAnexo}, ${p.departamento}/${p.localidad}): servicio=${p.servicio}, estadoEstablecimiento=${p.estadoEstablecimiento}, peorSeveridad=${p.peorSeveridad}, categorias=${p.categorias.join(',')}, secciones=${p.seccionesAlcanzadas}, alumnos=${p.alumnosAlcanzados}, actualizadaEn=${p.actualizadaEn}`,
    )
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
    .then(verificar)
    .then(async () => {
      const client = getRawClient()
      if (typeof client.close === 'function') await client.close()
      else await client.end()
      process.exit(0)
    })
    .catch(async (error) => {
      console.error(error instanceof Error ? error.message : error)
      const client = getRawClient()
      try {
        if (typeof client.close === 'function') await client.close()
        else await client.end()
      } catch {}
      process.exit(1)
    })
}
