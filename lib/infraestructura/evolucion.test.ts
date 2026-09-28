import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getDb, getRawClient } from '@/lib/db'
import { ensureSeeded, PERIODO_ENOS_2026_2027_ID } from '@/lib/db/seed'
import {
  infraAfectacion,
  infraAfectacionAlumno,
  infraAfectacionSeccion,
  infraParte,
  infraServicioAlcance,
} from '@/lib/db/schema'
import { obtenerEvolucionMapa } from './evolucion'
import { crearEjecutorSql, ensureGeSchema } from './ge-db'
import { listarPartesVigentes } from './parte-mapa'

let dir: string
let prevDataDir: string | undefined
let prevAdminEmail: string | undefined
let prevAdminPassword: string | undefined

// Un día calendario (UTC), desplazado `offsetDias` respecto de hoy — mismo
// concepto que usa evolucion.ts para construir el rango de días del período.
// El período sembrado (PERIODO_ENOS_2026_2027_ID) arranca en 2026-01-01 y no
// tiene finEn, así que el rango siempre llega hasta "hoy" real del reloj de
// este proceso: estos fixtures se anclan a ese mismo reloj, nunca a una
// fecha fija, para no depender de cuándo se corran los tests.
function diaIso(offsetDias: number): string {
  const fecha = new Date(Date.now() + offsetDias * 24 * 60 * 60 * 1000)
  return fecha.toISOString().slice(0, 10)
}

function inicioDeDia(offsetDias: number): string {
  return `${diaIso(offsetDias)}T00:00:00.000Z`
}

async function sembrarGe(): Promise<void> {
  const client = crearEjecutorSql(getRawClient())
  await ensureGeSchema(client)
  await client.execute(
    "INSERT INTO ge.ge_corte (id, ciclo_lectivo, fetched_at, estado) OVERRIDING SYSTEM VALUE VALUES (1, 2026, '2026-01-01T00:00:00Z', 'vigente')",
  )
  for (let n = 1; n <= 12; n++) {
    const cue = `CUE-EV-${n}`
    await client.execute({
      sql: 'INSERT INTO ge.ge_localizacion (cue_anexo, cui, nombre, departamento, localidad, lat, lon) VALUES (?, NULL, ?, ?, ?, ?, ?)',
      args: [cue, `Escuela EV ${n}`, n <= 2 ? 'Paraná' : 'Concordia', 'Paraná', -31.7, -60.5],
    })
    const seccion = n * 1000 + 1
    await client.execute({
      sql: 'INSERT INTO ge.ge_seccion (corte_id, ge_section_id, cue_anexo, curso, division, nivel, turno) VALUES (1, ?, ?, ?, ?, ?, ?)',
      args: [seccion, cue, '1', 'A', 'PRIMARIA', 'MAÑANA'],
    })
    for (let i = 0; i < 3; i++) {
      await client.execute({
        sql: 'INSERT INTO ge.ge_alumno_seccion (corte_id, ge_section_id, ge_person_id) VALUES (1, ?, ?)',
        args: [seccion, seccion * 1000 + i],
      })
    }
  }
}

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'evolucion-'))
  prevDataDir = process.env.DATA_DIR
  prevAdminEmail = process.env.ADMIN_EMAIL
  prevAdminPassword = process.env.ADMIN_PASSWORD
  process.env.DATA_DIR = dir
  delete process.env.ADMIN_EMAIL
  delete process.env.ADMIN_PASSWORD

  await sembrarGe()
  await ensureSeeded()
})

afterAll(() => {
  if (prevDataDir === undefined) delete process.env.DATA_DIR
  else process.env.DATA_DIR = prevDataDir
  if (prevAdminEmail === undefined) delete process.env.ADMIN_EMAIL
  else process.env.ADMIN_EMAIL = prevAdminEmail
  if (prevAdminPassword === undefined) delete process.env.ADMIN_PASSWORD
  else process.env.ADMIN_PASSWORD = prevAdminPassword
  rmSync(dir, { recursive: true, force: true })
})

async function crearParte(cue: string): Promise<string> {
  const db = getDb()
  const id = crypto.randomUUID()
  const ahora = new Date().toISOString()
  await db.insert(infraParte).values({
    id,
    periodoId: PERIODO_ENOS_2026_2027_ID,
    cueAnexo: cue,
    estadoEstablecimiento: 'habitual',
    estadoEstablecimientoRigeDesde: ahora,
    corteId: 1,
    creadaEn: ahora,
    actualizadaEn: ahora,
  })
  return id
}

async function crearAfectacion(params: {
  parteId: string
  motivo?: string
  categoria?: 'establecimiento' | 'alumnos'
  severidad?: 'Baja' | 'Media' | 'Alta' | 'Crítica'
  rigeDesde?: string
  retiradaEn?: string | null
  secciones: number[]
  alumnos?: number[]
}): Promise<string> {
  const db = getDb()
  const id = crypto.randomUUID()
  const ahora = new Date().toISOString()
  await db.insert(infraAfectacion).values({
    id,
    parteId: params.parteId,
    motivo: params.motivo ?? 'Inundación',
    categoria: params.categoria ?? 'establecimiento',
    severidad: params.severidad ?? 'Alta',
    descripcion: null,
    rigeDesde: params.rigeDesde ?? ahora,
    creadaEn: ahora,
    retiradaEn: params.retiradaEn ?? null,
  })
  if (params.secciones.length > 0) {
    await db
      .insert(infraAfectacionSeccion)
      .values(params.secciones.map((geSectionId) => ({ afectacionId: id, geSectionId })))
  }
  if (params.alumnos && params.alumnos.length > 0) {
    await db
      .insert(infraAfectacionAlumno)
      .values(params.alumnos.map((gePersonId) => ({ afectacionId: id, gePersonId })))
  }
  return id
}

async function crearServicioAlcance(params: {
  parteId: string
  tipo: 'establecimiento' | 'turno' | 'seccion'
  referenciaId?: string | null
  estado: 'normal' | 'suspendido'
  rigeDesde?: string
  retiradaEn?: string | null
}): Promise<void> {
  const db = getDb()
  const ahora = new Date().toISOString()
  await db.insert(infraServicioAlcance).values({
    id: crypto.randomUUID(),
    parteId: params.parteId,
    tipo: params.tipo,
    referenciaId: params.referenciaId ?? null,
    estado: params.estado,
    rigeDesde: params.rigeDesde ?? ahora,
    creadaEn: ahora,
    retiradaEn: params.retiradaEn ?? null,
  })
}

describe('obtenerEvolucionMapa', () => {
  it('reconstruye la serie de servicio caído por intervalos, no por snapshot', async () => {
    const parteId = await crearParte('CUE-EV-1')
    // Afectación vigente hoy: sin esto el parte no entra en la población del
    // mapa (listarPartesVigentes) y no aparecería en ninguna serie.
    await crearAfectacion({ parteId, rigeDesde: inicioDeDia(-30), secciones: [1001] })
    // Servicio suspendido vigente entre el día -9 y el día -3 (exclusivo):
    // "vigente entre el 3 y el 9 cuenta en todos esos días" del enunciado.
    await crearServicioAlcance({
      parteId,
      tipo: 'establecimiento',
      estado: 'suspendido',
      rigeDesde: inicioDeDia(-9),
      retiradaEn: inicioDeDia(-3),
    })

    const { serieEscuelasServicioCaido } = await obtenerEvolucionMapa()
    const porFecha = new Map(serieEscuelasServicioCaido.map((p) => [p.fecha, p.escuelas]))

    expect(porFecha.get(diaIso(-9))).toBe(1)
    expect(porFecha.get(diaIso(-4))).toBe(1)
    // El intervalo es semiabierto: el día en que retiradaEn arranca ya NO
    // cuenta.
    expect(porFecha.get(diaIso(-3))).toBe(0)
    expect(porFecha.get(diaIso(-10))).toBe(0)
  })

  it('acumula alumnos distintos a lo largo del período sin decrecer, aunque una afectación se retire', async () => {
    // Línea de base ANTES de sembrar este fixture: los tests anteriores de
    // este archivo ya dejaron alumnos alcanzados en el acumulado global (el
    // dedupe es por gePersonId a lo largo de TODO el período, no por
    // parte), así que las aserciones comparan contra esta base en vez de
    // asumir 0 — el acumulado nunca es "sólo de este test".
    const { alumnosAcumulados: antes } = await obtenerEvolucionMapa()
    const baseAntesDelPrimero = antes.find((p) => p.fecha === diaIso(-21))!.alumnosAcumulados
    const baseAntesDelSegundo = antes.find((p) => p.fecha === diaIso(-10))!.alumnosAcumulados

    const parteId = await crearParte('CUE-EV-2')
    // Afectación retirada hace tiempo: alcanzó al alumno 2001000 entre los
    // días -20 y -15.
    await crearAfectacion({
      parteId,
      motivo: 'Corte de ruta',
      rigeDesde: inicioDeDia(-20),
      retiradaEn: inicioDeDia(-15),
      secciones: [2001],
      alumnos: [2001000],
    })
    // Afectación vigente hoy, desde el día -5: alcanza a un alumno distinto
    // en la misma sección (2001001, matriculado por sembrarGe).
    await crearAfectacion({
      parteId,
      rigeDesde: inicioDeDia(-5),
      secciones: [2001],
      alumnos: [2001001],
    })

    const { alumnosAcumulados } = await obtenerEvolucionMapa()
    const porFecha = new Map(alumnosAcumulados.map((p) => [p.fecha, p.alumnosAcumulados]))

    expect(porFecha.get(diaIso(-21))).toBe(baseAntesDelPrimero)
    // Ya alcanzó al primer alumno, aunque esa afectación siga vigente.
    expect(porFecha.get(diaIso(-18))).toBeGreaterThanOrEqual(baseAntesDelPrimero + 1)
    // La afectación ya se retiró (día -15), pero el acumulado NO baja: sigue
    // contando al alumno 2001000 aunque hoy ya no esté "vigente".
    expect(porFecha.get(diaIso(-10))).toBeGreaterThanOrEqual(baseAntesDelSegundo + 1)
    // Desde el día -5 se suma el segundo alumno.
    const hoy = porFecha.get(diaIso(0))!
    const antesDelSegundo = porFecha.get(diaIso(-10))!
    expect(hoy).toBeGreaterThan(antesDelSegundo)

    // Nunca decrece día a día.
    let anterior = 0
    for (const punto of alumnosAcumulados) {
      expect(punto.alumnosAcumulados).toBeGreaterThanOrEqual(anterior)
      anterior = punto.alumnosAcumulados
    }
  })

  it('ordena el ranking de departamentos por escuelas afectadas y suma alumnos alcanzados', async () => {
    // Departamento fijado por sembrarGe (n <= 2 → Paraná, resto →
    // Concordia): CUE-EV-1/2 (tests anteriores) ya aportan 2 escuelas a
    // Paraná, así que la aserción no asume aislamiento entre tests — compara
    // el ranking ANTES y DESPUÉS de agregar 3 escuelas nuevas a Concordia.
    const { rankingDepartamentos: antes } = await obtenerEvolucionMapa()
    const concordiaAntes = antes.find((r) => r.departamento === 'Concordia')?.escuelasAfectadas ?? 0

    const parteConcordia1 = await crearParte('CUE-EV-3')
    const parteConcordia2 = await crearParte('CUE-EV-4')
    const parteConcordia3 = await crearParte('CUE-EV-5')
    await crearAfectacion({ parteId: parteConcordia1, secciones: [3001] })
    await crearAfectacion({ parteId: parteConcordia2, secciones: [4001] })
    await crearAfectacion({ parteId: parteConcordia3, secciones: [5001] })

    const { rankingDepartamentos } = await obtenerEvolucionMapa()
    const concordia = rankingDepartamentos.find((r) => r.departamento === 'Concordia')
    const parana = rankingDepartamentos.find((r) => r.departamento === 'Paraná')

    expect(concordia?.escuelasAfectadas).toBe(concordiaAntes + 3)
    expect(concordia!.escuelasAfectadas).toBeGreaterThan(parana!.escuelasAfectadas)
    expect(rankingDepartamentos.indexOf(concordia!)).toBeLessThan(rankingDepartamentos.indexOf(parana!))
  })

  it('distribución por motivo cuenta sólo afectaciones vigentes', async () => {
    const parteId = await crearParte('CUE-EV-6')
    await crearAfectacion({ parteId, motivo: 'Inundación', secciones: [6001] })
    await crearAfectacion({
      parteId,
      motivo: 'Corte de ruta',
      rigeDesde: inicioDeDia(-10),
      retiradaEn: inicioDeDia(-9),
      secciones: [6001],
    })

    const { distribucionMotivo } = await obtenerEvolucionMapa()
    const inundacion = distribucionMotivo.find((m) => m.motivo === 'Inundación')
    const corteDeRuta = distribucionMotivo.find((m) => m.motivo === 'Corte de ruta')

    expect(inundacion?.afectacionesVigentes).toBeGreaterThanOrEqual(1)
    expect(corteDeRuta).toBeUndefined()
  })

  describe('coherencia con IndicadoresMapa', () => {
    it('el último punto de la serie de servicio caído coincide con el indicador de hoy', async () => {
      const parteId = await crearParte('CUE-EV-7')
      await crearAfectacion({ parteId, secciones: [7001] })
      await crearServicioAlcance({ parteId, tipo: 'establecimiento', estado: 'suspendido' })

      const { indicadores } = await listarPartesVigentes()
      const { serieEscuelasServicioCaido } = await obtenerEvolucionMapa()
      const puntoDeHoy = serieEscuelasServicioCaido.at(-1)!

      expect(puntoDeHoy.fecha).toBe(diaIso(0))
      expect(puntoDeHoy.escuelas).toBe(indicadores.conServicioSuspendido + indicadores.conServicioParcial)
    })

    it('la suma del ranking de departamentos coincide con escuelas y alumnos del mapa', async () => {
      const { indicadores } = await listarPartesVigentes()
      const { rankingDepartamentos } = await obtenerEvolucionMapa()

      const totalEscuelas = rankingDepartamentos.reduce((acc, r) => acc + r.escuelasAfectadas, 0)
      const totalAlumnos = rankingDepartamentos.reduce((acc, r) => acc + r.alumnosAlcanzados, 0)

      expect(totalEscuelas).toBe(indicadores.escuelas)
      expect(totalAlumnos).toBe(indicadores.alumnosAlcanzados)
    })
  })

  describe('guard anti N+1', () => {
    it('ejecuta el mismo número de queries con 1 parte que con 10 partes', async () => {
      // La producción crea su propio envoltorio con
      // crearEjecutorSql(getRawClient()) en cada llamada, así que el punto de
      // intercepción compartido es el cliente crudo: todo envoltorio delega en
      // raw.query(...).
      const raw = getRawClient() as unknown as {
        query: (...args: unknown[]) => Promise<{ rows: unknown[] }>
      }
      const original = raw.query.bind(raw)

      const parteUnico = await crearParte('CUE-EV-8')
      await crearAfectacion({ parteId: parteUnico, secciones: [8001] })
      await crearServicioAlcance({ parteId: parteUnico, tipo: 'establecimiento', estado: 'suspendido' })

      let contador = 0
      raw.query = async (...args: unknown[]) => {
        contador++
        return original(...args)
      }

      await obtenerEvolucionMapa()
      const queriesConUnParte = contador
      raw.query = original
      expect(queriesConUnParte).toBeGreaterThan(0)

      for (let n = 9; n <= 12; n++) {
        const cue = `CUE-EV-${n}`
        const parteId = await crearParte(cue)
        await crearAfectacion({ parteId, secciones: [n * 1000 + 1] })
        await crearServicioAlcance({ parteId, tipo: 'establecimiento', estado: 'suspendido' })
      }

      let contador2 = 0
      raw.query = async (...args: unknown[]) => {
        contador2++
        return original(...args)
      }

      await obtenerEvolucionMapa()
      raw.query = original

      expect(contador2).toBe(queriesConUnParte)
    })
  })
})
