import { beforeAll, describe, expect, it } from 'vitest'
import { getRawClient } from '@/lib/db'
import { ensureSeeded } from '@/lib/db/seed'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { obtenerEvolucionMapa } from './evolucion'
import { crearEjecutorSql, ensureGeSchema } from './ge-db'
import { listarPartesVigentes } from './parte-mapa'
import { crearAfectacion, crearParte, crearServicioAlcance } from './test-utils/parte-fixtures'

usarDbTemporal('evolucion', { seed: false, env: { ADMIN_EMAIL: undefined, ADMIN_PASSWORD: undefined } })

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
  await sembrarGe()
  await ensureSeeded()
})

describe('obtenerEvolucionMapa', () => {
  it('filtra por departamento normalizado y agrega sólo las escuelas coincidentes', async () => {
    const client = crearEjecutorSql(getRawClient())
    for (const [cue, departamento, seccion] of [
      ['CUE-EV-FILTRO-CONCORDIA', 'Concordia', 91001],
      ['CUE-EV-FILTRO-PARANA', 'Paraná', 91002],
    ] as const) {
      await client.execute({
        sql: 'INSERT INTO ge.ge_localizacion (cue_anexo, cui, nombre, departamento, localidad, lat, lon) VALUES (?, NULL, ?, ?, ?, ?, ?)',
        args: [cue, `Escuela ${cue}`, departamento, departamento, -31.7, -60.5],
      })
      await client.execute({
        sql: 'INSERT INTO ge.ge_seccion (corte_id, ge_section_id, cue_anexo, curso, division, nivel, turno) VALUES (1, ?, ?, ?, ?, ?, ?)',
        args: [seccion, cue, '1', 'A', 'PRIMARIA', 'MAÑANA'],
      })
    }
    const concordia = await crearParte('CUE-EV-FILTRO-CONCORDIA')
    const parana = await crearParte('CUE-EV-FILTRO-PARANA')
    await crearAfectacion({ parteId: concordia, motivo: 'Filtro Concordia', secciones: [91001] })
    await crearAfectacion({ parteId: parana, motivo: 'Filtro Paraná', secciones: [91002] })

    const resultado = await obtenerEvolucionMapa({ departamentos: ['CONCORDIA'] })

    expect(resultado.rankingDepartamentos).toEqual([{ departamento: 'Concordia', escuelasAfectadas: 1, alumnosAlcanzados: 0 }])
    expect(resultado.distribucionMotivo).toEqual([{ motivo: 'Filtro Concordia', afectacionesVigentes: 1 }])
    expect(resultado.serieEscuelasServicioCaido.every((punto) => punto.escuelas === 0)).toBe(true)
    expect(await obtenerEvolucionMapa({ departamentos: ['Concordia'] })).toEqual(resultado)
    expect(await obtenerEvolucionMapa({ departamentos: ['Concordía'] })).toEqual(resultado)
  })

  it('filtra niveles exactos con trim y cuenta una escuela con varios niveles una sola vez', async () => {
    const client = crearEjecutorSql(getRawClient())
    const cue = 'CUE-EV-FILTRO-NIVELES'
    await client.execute({
      sql: 'INSERT INTO ge.ge_localizacion (cue_anexo, cui, nombre, departamento, localidad, lat, lon) VALUES (?, NULL, ?, ?, ?, ?, ?)',
      args: [cue, 'Escuela niveles', 'Nivel Test', 'Nivel Test', -31.7, -60.5],
    })
    for (const [seccion, nivel] of [[92001, 'PRIMARIA'], [92002, 'SECUNDARIA']] as const) {
      await client.execute({
        sql: 'INSERT INTO ge.ge_seccion (corte_id, ge_section_id, cue_anexo, curso, division, nivel, turno) VALUES (1, ?, ?, ?, ?, ?, ?)',
        args: [seccion, cue, '1', 'A', nivel, 'MAÑANA'],
      })
    }
    const parteId = await crearParte(cue)
    await crearAfectacion({ parteId, motivo: 'Filtro niveles', secciones: [92001, 92002] })

    const primaria = await obtenerEvolucionMapa({ departamentos: ['nivel test'], niveles: ['PRIMARIA'] })
    const secundaria = await obtenerEvolucionMapa({ departamentos: ['NIVEL TEST'], niveles: ['SECUNDARIA'] })

    expect(primaria.rankingDepartamentos).toEqual([{ departamento: 'Nivel Test', escuelasAfectadas: 1, alumnosAlcanzados: 0 }])
    expect(secundaria.rankingDepartamentos).toEqual(primaria.rankingDepartamentos)
    expect(primaria.distribucionMotivo).toEqual([{ motivo: 'Filtro niveles', afectacionesVigentes: 1 }])
    expect(secundaria.serieEscuelasServicioCaido).toEqual(primaria.serieEscuelasServicioCaido)
    expect(primaria.alumnosAcumulados).toEqual(primaria.alumnosAcumulados.map((p) => ({ ...p, alumnosAcumulados: 0 })))
  })

  it('mantiene el resultado actual al llamar sin filtros y devuelve vacío si el nivel no coincide', async () => {
    const actual = await obtenerEvolucionMapa()
    expect(await obtenerEvolucionMapa({})).toEqual(actual)
    expect(await obtenerEvolucionMapa({ departamentos: [], niveles: [] })).toEqual(actual)
    expect(await obtenerEvolucionMapa({ departamentos: ['Goya'], niveles: ['NIVEL INEXISTENTE'] })).toEqual({
      serieEscuelasServicioCaido: [], rankingDepartamentos: [], distribucionMotivo: [], alumnosAcumulados: [],
    })
  })

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

      let contadorFiltrado = 0
      raw.query = async (...args: unknown[]) => {
        contadorFiltrado++
        return original(...args)
      }
      await obtenerEvolucionMapa({ niveles: ['PRIMARIA'] })
      const queriesFiltradasConDiezPartes = contadorFiltrado
      raw.query = original
      expect(queriesFiltradasConDiezPartes).toBe(queriesConUnParte)
    })
  })
})

describe('instituto superior en la serie de servicio caído', () => {
  it('cuenta el CUE cuando sólo una de sus carreras está suspendida', async () => {
    const client = crearEjecutorSql(getRawClient())
    const corte = await client.execute(`INSERT INTO matricula_corte (fuente, ciclo_lectivo, estado, creado_en)
      VALUES ('test-evolucion', 2026, 'vigente', '2026-10-01') RETURNING id`)
    const corteId = Number(corte.rows[0]!.id)
    const carreras = await client.execute({
      sql: `INSERT INTO matricula_carrera (corte_id, cue_anexo, instituto, nombre, rm, tipo, estado, sector) VALUES
        (?, 'CUE-EV-11', 'Instituto EV', 'Carrera EV A', 'RM-EV-1', 'Tecnicatura', 'ABIERTA', 'estatal'),
        (?, 'CUE-EV-11', 'Instituto EV', 'Carrera EV B', 'RM-EV-2', 'Profesorado', 'ABIERTA', 'estatal')
        RETURNING id`,
      args: [corteId, corteId],
    })
    const carreraA = Number(carreras.rows[0]!.id)

    const parte = await client.execute("SELECT id FROM infra_parte WHERE cue_anexo = 'CUE-EV-11'")
    const parteId = String(parte.rows[0]!.id)
    // Sólo la carrera A suspendida: el CUE queda "parcial" y cuenta como afectado.
    await client.execute({
      sql: `INSERT INTO infra_servicio_alcance (id, parte_id, tipo, referencia_id, estado, rige_desde, creada_en, retirada_en)
            VALUES (?, ?, 'carrera', ?, 'suspendido', ?, ?, NULL)`,
      args: [crypto.randomUUID(), parteId, String(carreraA), inicioDeDia(-5), inicioDeDia(-5)],
    })

    const { serieEscuelasServicioCaido } = await obtenerEvolucionMapa()
    const hoy = serieEscuelasServicioCaido.find((p) => p.fecha === diaIso(0))
    expect(hoy?.escuelas).toBeGreaterThan(0)
  })

  it('suma a la serie de alumnos los alumnos elegidos de la carrera de matrícula', async () => {
    // Usa el CUE y la carrera A del test anterior (mismo archivo, orden secuencial).
    const client = crearEjecutorSql(getRawClient())
    await client.execute(`INSERT INTO ge.ge_nivel_jurisdiccional (id, nombre) VALUES (4, 'Dirección de Nivel Superior')
      ON CONFLICT DO NOTHING`)
    await client.execute(`INSERT INTO ge.ge_escuela_nivel_jur (cue_anexo, nivel_jurisdiccional_id, ciclo_lectivo)
      VALUES ('CUE-EV-11', 4, 2026)`)
    const carrera = await client.execute(
      "SELECT id, corte_id FROM matricula_carrera WHERE cue_anexo = 'CUE-EV-11' AND nombre = 'Carrera EV A'",
    )
    const carreraA = Number(carrera.rows[0]!.id)
    const corteId = Number(carrera.rows[0]!.corte_id)
    const parte = await client.execute("SELECT id FROM infra_parte WHERE cue_anexo = 'CUE-EV-11' LIMIT 1")
    const parteId = String(parte.rows[0]!.id)

    const antes = (await obtenerEvolucionMapa()).alumnosAcumulados.at(-1)!.alumnosAcumulados

    const alumnos = await client.execute({
      sql: `INSERT INTO matricula_alumno (corte_id, carrera_id, apellidos, nombres, nombre_busqueda, dni_hash) VALUES
        (?, ?, 'Evolucion', 'Uno', 'evolucion uno', 'h-ev-1'),
        (?, ?, 'Evolucion', 'Dos', 'evolucion dos', 'h-ev-2') RETURNING id`,
      args: [corteId, carreraA, corteId, carreraA],
    })
    const alumnoElegido = Number(alumnos.rows[0]!.id)
    const afectacionId = await crearAfectacion({
      parteId,
      motivo: 'Alumnos sin clase',
      secciones: [],
      rigeDesde: inicioDeDia(-2),
    })
    await client.execute({
      sql: 'INSERT INTO infra_afectacion_carrera (afectacion_id, matricula_corte_id, carrera_id) VALUES (?, ?, ?)',
      args: [afectacionId, corteId, carreraA],
    })
    await client.execute({
      sql: 'INSERT INTO infra_afectacion_matricula_alumno (afectacion_id, matricula_corte_id, alumno_id) VALUES (?, ?, ?)',
      args: [afectacionId, corteId, alumnoElegido],
    })

    // Un solo alumno elegido dentro de la carrera: suma exactamente uno.
    const despues = (await obtenerEvolucionMapa()).alumnosAcumulados.at(-1)!.alumnosAcumulados
    expect(despues - antes).toBe(1)
  })
})

