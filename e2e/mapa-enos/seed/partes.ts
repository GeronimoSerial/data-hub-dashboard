import { eq } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { infraAfectacion, infraMovimiento, infraParte } from '@/lib/db/schema'
import { getRawClient } from '@/lib/db/index'
import { reemplazarComedores } from '@/lib/infraestructura/comedores/repositorio'
import { activarCorte, crearEjecutorSql, ensureGeSchema } from '@/lib/infraestructura/ge-db'
import type { ComedorAgregado } from '@/lib/infraestructura/comedores/importar'
import { diffParte } from '@/lib/infraestructura/movimiento-diff'
import {
  crearAfectacion,
  crearParte,
} from '@/lib/infraestructura/test-utils/parte-fixtures'
import type { Afectacion, EstadoEstablecimiento, ParteSnapshot } from '@/lib/infraestructura/trayectoria-tipos'
import type { Severidad } from '@/lib/infraestructura/validacion'

// Partes del mapa e2e. Todo se escribe con las funciones de la app (crearParte,
// crearAfectacion, diffParte, reemplazarComedores). Los únicos UPDATE directos son
// de columnas que el helper de fixtures no expone y que el flujo real de la app
// escribe igual (ver app/api/problematicas/parte/route.ts, cierre de afectaciones).
//
// Modelo que usa el mapa (ver lib/infraestructura/mapa/*.ts):
// - Una escuela aparece con parte sólo si tiene al menos una afectación vigente.
// - "Sin actualizar": infra_parte.actualizada_en más viejo que UMBRAL_SIN_ACTUALIZAR_HORAS (72 h).
// - "Solucionada reciente": afectación con cierre='solucionada' y retirada_en dentro de
//   VENTANA_CAUSA_DIAS (15 días). No requiere parte vigente.
// - "Con comedor": el servicio de comedor viene de la planilla MEC (infra_comedor_escuela),
//   no de un campo del parte. Se siembra acá porque es el único dato del mapa que depende
//   de los partes para el mismo conjunto de escuelas.
// - Gravedad = severidad de la afectación principal (categoría 'establecimiento', sin
//   secciones GE, así la prioridad por alumnos no interviene).
// - Clase: estado del establecimiento (sin_clases, evacuado, centro_evacuados) o servicio suspendido.
// - Apoyo: sólo para escuelas sin clases normales; sin asistencia cargada es 'sin_dato'.
//
// Los CUE salen del roster ESCUELAS: no se repiten nombres ni niveles acá.

const DIA_MS = 24 * 60 * 60 * 1000
const FUENTE_COMEDORES = 'e2e-partes-v1'

function hace(dias: number): string {
  return new Date(Date.now() - dias * DIA_MS).toISOString()
}

type Asistencia = { brinda: boolean; modalidades: string[] }

async function fijarParte(
  parteId: string,
  cambios: { estadoEstablecimiento?: EstadoEstablecimiento; asistenciaPedagogica?: Asistencia; actualizadaEn?: string },
): Promise<void> {
  await getDb()
    .update(infraParte)
    .set({
      ...(cambios.estadoEstablecimiento ? { estadoEstablecimiento: cambios.estadoEstablecimiento } : {}),
      ...(cambios.asistenciaPedagogica ? { asistenciaPedagogica: JSON.stringify(cambios.asistenciaPedagogica) } : {}),
      ...(cambios.actualizadaEn ? { actualizadaEn: cambios.actualizadaEn } : {}),
    })
    .where(eq(infraParte.id, parteId))
}

async function sembrarParteVigente(corteId: number, params: {
  cue: string
  severidad: Severidad
  motivo: string
  estado?: EstadoEstablecimiento
  asistencia?: Asistencia
  rigeDesdeHaceDias?: number
  actualizadaHaceDias?: number
  secciones?: number[]
}): Promise<void> {
  const parteId = await crearParte(params.cue, corteId)
  await crearAfectacion({
    parteId,
    motivo: params.motivo,
    categoria: 'establecimiento',
    severidad: params.severidad,
    rigeDesde: hace(params.rigeDesdeHaceDias ?? 0),
    secciones: params.secciones ?? [],
  })
  await fijarParte(parteId, {
    estadoEstablecimiento: params.estado,
    asistenciaPedagogica: params.asistencia,
    actualizadaEn: hace(params.actualizadaHaceDias ?? 0),
  })
}

async function sembrarSolucionada(corteId: number, params: { cue: string; solucionadaHaceDias: number }): Promise<void> {
  const parteId = await crearParte(params.cue, corteId)
  const afectacionId = await crearAfectacion({
    parteId,
    motivo: 'Inundación',
    categoria: 'establecimiento',
    severidad: 'Media',
    rigeDesde: hace(params.solucionadaHaceDias + 10),
    retiradaEn: hace(params.solucionadaHaceDias),
    secciones: [],
  })
  await getDb()
    .update(infraAfectacion)
    .set({ cierre: 'solucionada' })
    .where(eq(infraAfectacion.id, afectacionId))
}

// Historial de la escuela 1800117-00: cinco movimientos en orden conocido, cada uno
// con el diff que produce la app (diffParte) entre el estado anterior y el nuevo.
async function sembrarHistorial(corteId: number, cue: string): Promise<void> {
  const db = getDb()
  const parteId = await crearParte(cue, corteId)
  const afectaciones: Afectacion[] = []
  let estado: EstadoEstablecimiento = 'habitual'
  const snapshot = (): ParteSnapshot => ({
    estadoEstablecimiento: estado,
    asistenciaPedagogica: null,
    // Copias: diffParte compara fotografías, así que el estado anterior no puede compartir objetos con el actual.
    afectaciones: afectaciones.filter((a) => a.retiradaEn === null).map((a) => ({ ...a })),
    servicioAlcance: [],
  })

  const registrar = async (tipo: 'reporte_inicial' | 'actualizacion', antes: ParteSnapshot, instante: string) => {
    const diff = diffParte(antes, snapshot())
    await db.insert(infraMovimiento).values({
      id: crypto.randomUUID(),
      parteId,
      tipo,
      rol: 'director',
      resumen: diff as unknown as Record<string, unknown>,
      rigeDesde: instante,
      creadaEn: instante,
      idempotencyKey: null,
    })
  }

  // 1. Reporte inicial: una afectación de baja severidad.
  let antes = snapshot()
  const idInundacion = await crearAfectacion({
    parteId, motivo: 'Inundación', categoria: 'establecimiento', severidad: 'Baja',
    rigeDesde: hace(5), secciones: [],
  })
  afectaciones.push({
    id: idInundacion, parteId, motivo: 'Inundación', categoria: 'establecimiento', severidad: 'Baja',
    descripcion: null, creadaEn: hace(5), rigeDesde: hace(5), retiradaEn: null, secciones: [],
  })
  await registrar('reporte_inicial', antes, hace(5))

  // 2. Se sube la severidad de la inundación de Baja a Media.
  antes = snapshot()
  afectaciones[0].severidad = 'Media'
  await db.update(infraAfectacion).set({ severidad: 'Media' }).where(eq(infraAfectacion.id, idInundacion))
  await registrar('actualizacion', antes, hace(4))

  // 3. Se informa un corte de luz de severidad Alta.
  antes = snapshot()
  const idCorte = await crearAfectacion({
    parteId, motivo: 'Corte de luz', categoria: 'establecimiento', severidad: 'Alta',
    rigeDesde: hace(3), secciones: [],
  })
  afectaciones.push({
    id: idCorte, parteId, motivo: 'Corte de luz', categoria: 'establecimiento', severidad: 'Alta',
    descripcion: null, creadaEn: hace(3), rigeDesde: hace(3), retiradaEn: null, secciones: [],
  })
  await registrar('actualizacion', antes, hace(3))

  // 4. El corte de luz deja de informarse (retirada, no solucionada: no cuenta como solucionada reciente).
  antes = snapshot()
  afectaciones[1].retiradaEn = hace(2)
  await db.update(infraAfectacion).set({ retiradaEn: hace(2), cierre: 'retirada' }).where(eq(infraAfectacion.id, idCorte))
  await registrar('actualizacion', antes, hace(2))

  // 5. El establecimiento pasa a funcionamiento parcial.
  antes = snapshot()
  estado = 'parcial'
  await fijarParte(parteId, { estadoEstablecimiento: 'parcial', actualizadaEn: hace(1) })
  await registrar('actualizacion', antes, hace(1))
}

async function sembrarComedores(): Promise<void> {
  const servicio = (cueAnexo: string, desayuno: boolean, almuerzo: boolean): ComedorAgregado => ({
    cueAnexo, desayuno, almuerzo, proveedor: null, fuentes: [FUENTE_COMEDORES],
  })
  await reemplazarComedores(
    [
      servicio('1800643-00', true, true),
      servicio('1801110-00', false, true),
      servicio('1801016-00', true, false),
      servicio('1800939-00', true, true),
      servicio('1801608-03', true, true),
    ],
    { fuente: FUENTE_COMEDORES },
  )
}

// Corte vigente de Gestión Educativa para el ciclo 2026. Sin él, el historial responde 503
// (getCorteVigente) y los partes no tienen corte contra el que resolver alcance.
// No hay función de la app que cree un corte: el import del padrón (scripts/import-padron.mjs)
// hace el mismo INSERT en 'importando' y luego llama a activarCorte, que es el paso que
// valida y lo deja 'vigente'. Se replica ese camino; el INSERT es SQL directo, único y documentado.
const CICLO_CORTE_SEMBRADO = 2026

async function crearCorteVigente(): Promise<number> {
  const client = crearEjecutorSql(getRawClient())
  await ensureGeSchema(client)
  const res = await client.execute({
    sql: "INSERT INTO ge.ge_corte (ciclo_lectivo, fetched_at, estado) VALUES (?, ?, 'importando') RETURNING id",
    args: [CICLO_CORTE_SEMBRADO, new Date().toISOString()],
  })
  const corteId = Number(res.rows[0].id)
  await activarCorte(client, corteId)
  return corteId
}

// Una sección GE con matrícula para la escuela de acceso-roles.spec.ts: la ficha sólo muestra
// el alcance en alumnos cuando es mayor que cero, y ese control positivo necesita un valor real.
const SECCION_CON_MATRICULA = 990001
const ALUMNOS_CON_MATRICULA = 12

async function sembrarSeccionConMatricula(corteId: number, cue: string): Promise<void> {
  const client = crearEjecutorSql(getRawClient())
  await client.execute({
    sql: `INSERT INTO ge.ge_seccion (corte_id, ge_section_id, cue_anexo, curso, division, nivel, turno)
          VALUES (?, ?, ?, '1', 'A', 'Primario', 'Mañana') ON CONFLICT DO NOTHING`,
    args: [corteId, SECCION_CON_MATRICULA, cue],
  })
  for (let indice = 0; indice < ALUMNOS_CON_MATRICULA; indice++) {
    await client.execute({
      sql: `INSERT INTO ge.ge_alumno_seccion (corte_id, ge_section_id, ge_person_id)
            VALUES (?, ?, ?) ON CONFLICT DO NOTHING`,
      args: [corteId, SECCION_CON_MATRICULA, 99_000_000 + indice],
    })
  }
}

export async function sembrarPartes(): Promise<void> {
  const corteId = await crearCorteVigente()
  await sembrarSeccionConMatricula(corteId, '1800554-00')

  // Vigentes: actualizados hoy, con afectación activa.
  await sembrarParteVigente(corteId, { cue: '1800554-00', severidad: 'Media', motivo: 'Inundación', secciones: [SECCION_CON_MATRICULA] })
  await sembrarParteVigente(corteId, { cue: '1800643-00', severidad: 'Baja', motivo: 'Inundación' })
  await sembrarParteVigente(corteId, {
    cue: '1801899-00', severidad: 'Alta', motivo: 'Falta de calefacción',
    estado: 'sin_clases', asistencia: { brinda: true, modalidades: ['Asistencia virtual'] },
  })
  await sembrarParteVigente(corteId, {
    cue: '1801855-00', severidad: 'Crítica', motivo: 'Incendio',
    estado: 'evacuado', asistencia: { brinda: false, modalidades: [] },
  })
  await sembrarParteVigente(corteId, { cue: '1801110-00', severidad: 'Media', motivo: 'Corte de agua' })
  await sembrarParteVigente(corteId, { cue: '1801533-00', severidad: 'Alta', motivo: 'Inundación', estado: 'centro_evacuados' })
  await sembrarParteVigente(corteId, { cue: '1801016-00', severidad: 'Baja', motivo: 'Corte de luz' })
  await sembrarParteVigente(corteId, { cue: '1800953-00', severidad: 'Crítica', motivo: 'Inundación' })
  await sembrarParteVigente(corteId, {
    cue: '1800405-00', severidad: 'Media', motivo: 'Falta de calefacción',
    estado: 'sin_clases', asistencia: { brinda: true, modalidades: ['Cuadernillos impresos'] },
  })
  await sembrarParteVigente(corteId, { cue: '1800929-00', severidad: 'Alta', motivo: 'Corte de agua' })
  await sembrarParteVigente(corteId, { cue: '1801475-00', severidad: 'Baja', motivo: 'Corte de luz' })
  await sembrarParteVigente(corteId, {
    cue: '1801285-00', severidad: 'Crítica', motivo: 'Incendio', estado: 'evacuado',
  })

  // Sin actualizar: actualizados hace 30 días (umbral 72 h), con afectación activa desde entonces.
  for (const [cue, severidad, motivo] of [
    ['1801477-00', 'Alta', 'Inundación'],
    ['1800939-00', 'Media', 'Corte de luz'],
    ['1801039-00', 'Baja', 'Corte de agua'],
    ['1801101-00', 'Media', 'Corte de luz'],
  ] as const) {
    await sembrarParteVigente(corteId, {
      cue, severidad, motivo, rigeDesdeHaceDias: 30, actualizadaHaceDias: 30,
    })
  }

  // Historial de varios cambios.
  await sembrarHistorial(corteId, '1800117-00')

  // Solucionadas: una dentro de la ventana de 15 días (dos escuelas), una fuera (control).
  await sembrarSolucionada(corteId, { cue: '1801644-00', solucionadaHaceDias: 3 })
  await sembrarSolucionada(corteId, { cue: '1800893-00', solucionadaHaceDias: 5 })
  await sembrarSolucionada(corteId, { cue: '1800887-00', solucionadaHaceDias: 40 })

  await sembrarComedores()
}

// Valores que el mapa debe producir con el seed de arriba. Literales a propósito:
// si cambia el seed, cambia acá en el mismo commit.
export const ESPERADOS_PARTES = {
  // Escuelas con parte visible en el mapa (al menos una afectación vigente): 17.
  conParteVisible: [
    '1800554-00', '1800643-00', '1801899-00', '1801855-00', '1801110-00', '1801533-00',
    '1801016-00', '1800953-00', '1800405-00', '1800929-00', '1801475-00', '1801285-00',
    '1801477-00', '1800939-00', '1801039-00', '1801101-00', '1800117-00',
  ],
  // Vigentes (visible y no sin actualizar): 13.
  vigentes: [
    '1800554-00', '1800643-00', '1801899-00', '1801855-00', '1801110-00', '1801533-00',
    '1801016-00', '1800953-00', '1800405-00', '1800929-00', '1801475-00', '1801285-00',
    '1800117-00',
  ],
  // Sin actualizar: 4.
  sinActualizar: ['1801477-00', '1800939-00', '1801039-00', '1801101-00'],
  // Solucionadas dentro de 15 días: 2 escuelas, sin parte visible.
  solucionadasRecientes: ['1801644-00', '1800893-00'],
  // Solucionada hace 40 días: fuera de la ventana, no cuenta.
  solucionadaFueraDeVentana: ['1800887-00'],
  // Con comedor (planilla): 5 escuelas; 1801608-03 no tiene parte visible.
  conComedor: ['1800643-00', '1801110-00', '1801016-00', '1800939-00', '1801608-03'],
  historial: {
    cue: '1800117-00',
    // Orden que devuelve el historial: más reciente primero.
    tipos: ['actualizacion', 'actualizacion', 'actualizacion', 'actualizacion', 'reporte_inicial'],
  },
  // Conteos sobre las 17 escuelas con parte visible.
  porDepartamento: { Capital: 7, Goya: 4, 'Paso de los Libres': 3, 'Santo Tomé': 3 },
  porGravedad: { 1: 4, 2: 6, 3: 4, 4: 3 },
  porClase: { normal: 12, parcial: 0, sin: 2, evacuado: 2, centro: 1 },
  porApoyo: { brinda: 2, no: 1, sin_dato: 2 },
  // Escuelas del roster sin parte visible: 32 - 17 = 15.
  totalEscuelas: 32,
} as const
