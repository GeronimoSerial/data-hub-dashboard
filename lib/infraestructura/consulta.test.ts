import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createClient, type Client } from '@libsql/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { listarAlertasActivas } from './consulta'
import { ensureGeSchema, openGeDb } from './ge-db'

let dir: string
let prevDataDir: string | undefined

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'consulta-'))
  prevDataDir = process.env.DATA_DIR
  process.env.DATA_DIR = dir
})

afterEach(() => {
  if (prevDataDir === undefined) delete process.env.DATA_DIR
  else process.env.DATA_DIR = prevDataDir
  rmSync(dir, { recursive: true, force: true })
})

function openHub(): Client {
  return createClient({ url: `file:${path.join(dir, 'hub-test.sqlite')}` })
}

async function createInfraTables(client: Client) {
  await client.execute(`CREATE TABLE IF NOT EXISTS infra_problematica (
    id text PRIMARY KEY NOT NULL,
    cue_anexo text NOT NULL,
    motivo text NOT NULL,
    severidad text NOT NULL,
    descripcion text,
    corte_id integer NOT NULL,
    creada_en text NOT NULL,
    idempotency_key text NOT NULL,
    origen text NOT NULL
  )`)
  await client.execute(
    'CREATE UNIQUE INDEX IF NOT EXISTS infra_problematica_idempotency_key_unique ON infra_problematica (idempotency_key)',
  )
  await client.execute(`CREATE TABLE IF NOT EXISTS infra_problematica_seccion (
    problematica_id text NOT NULL,
    ge_section_id integer NOT NULL,
    PRIMARY KEY(problematica_id, ge_section_id)
  )`)
}

async function seedGe() {
  const ge = openGeDb()
  try {
    await ensureGeSchema(ge)
    await ge.execute(
      "INSERT INTO ge_corte (id, ciclo_lectivo, fetched_at, estado) VALUES (1, 2025, '2025-01-01T00:00:00Z', 'vigente')",
    )
    // CUE 04: con coordenadas y sin CUI, dos niveles (primaria y secundaria).
    await ge.execute(
      "INSERT INTO ge_localizacion (cue_anexo, cui, nombre, departamento, localidad, lat, lon) VALUES ('1801605-04', NULL, 'Escuela 4', 'ER', 'Parana', -31.7, -60.5)",
    )
    await ge.execute(
      "INSERT INTO ge_seccion (corte_id, ge_section_id, cue_anexo, curso, division, nivel, turno) VALUES (1, 10, '1801605-04', '1', 'A', 'PRIMARIA', 'MAÑANA')",
    )
    await ge.execute(
      "INSERT INTO ge_seccion (corte_id, ge_section_id, cue_anexo, curso, division, nivel, turno) VALUES (1, 20, '1801605-04', '1', 'A', 'SECUNDARIA', 'TARDE')",
    )
    for (let i = 0; i < 25; i++) {
      await ge.execute({
        sql: 'INSERT INTO ge_alumno_seccion (corte_id, ge_section_id, ge_person_id) VALUES (1, 10, ?)',
        args: [i],
      })
    }
    for (let i = 100; i < 110; i++) {
      await ge.execute({
        sql: 'INSERT INTO ge_alumno_seccion (corte_id, ge_section_id, ge_person_id) VALUES (1, 20, ?)',
        args: [i],
      })
    }
    // CUE 05: sin coordenadas, con CUI, comparte departamento con el 04.
    await ge.execute(
      "INSERT INTO ge_localizacion (cue_anexo, cui, nombre, departamento, localidad, lat, lon) VALUES ('1801605-05', 'CUI-1', 'Escuela 5', 'ER', 'Diamante', NULL, NULL)",
    )
    await ge.execute(
      "INSERT INTO ge_seccion (corte_id, ge_section_id, cue_anexo, curso, division, nivel, turno) VALUES (1, 30, '1801605-05', '1', 'A', 'PRIMARIA', 'MAÑANA')",
    )
    for (let i = 200; i < 210; i++) {
      await ge.execute({
        sql: 'INSERT INTO ge_alumno_seccion (corte_id, ge_section_id, ge_person_id) VALUES (1, 30, ?)',
        args: [i],
      })
    }
  } finally {
    ge.close()
  }
}

describe('listarAlertasActivas', () => {
  it('un usuario permitido obtiene el mismo total en lista e indicadores', async () => {
    await seedGe()
    const hub = openHub()
    try {
      await createInfraTables(hub)
      await hub.execute(
        "INSERT INTO infra_problematica (id, cue_anexo, motivo, severidad, corte_id, creada_en, idempotency_key, origen) VALUES ('p1', '1801605-04', 'Inundación', 'Alta', 1, '2025-01-01T00:00:00Z', 'k1', 'enlace-cue')",
      )
      await hub.execute(
        "INSERT INTO infra_problematica_seccion (problematica_id, ge_section_id) VALUES ('p1', 10)",
      )

      const resultado = await listarAlertasActivas(hub, {})
      expect(resultado.alertas.length).toBe(1)
      expect(resultado.indicadores.escuelas).toBe(1)
      expect(new Set(resultado.alertas.map((a) => a.cueAnexo)).size).toBe(
        resultado.indicadores.escuelas,
      )
    } finally {
      hub.close()
    }
  })

  it('varios incidentes sobre una escuela cuentan una sola escuela afectada', async () => {
    await seedGe()
    const hub = openHub()
    try {
      await createInfraTables(hub)
      await hub.execute(
        "INSERT INTO infra_problematica (id, cue_anexo, motivo, severidad, corte_id, creada_en, idempotency_key, origen) VALUES ('p1', '1801605-04', 'Inundación', 'Alta', 1, '2025-01-01T00:00:00Z', 'k1', 'enlace-cue')",
      )
      await hub.execute(
        "INSERT INTO infra_problematica (id, cue_anexo, motivo, severidad, corte_id, creada_en, idempotency_key, origen) VALUES ('p2', '1801605-04', 'Anegamiento', 'Media', 1, '2025-01-02T00:00:00Z', 'k2', 'enlace-cue')",
      )
      await hub.execute(
        "INSERT INTO infra_problematica_seccion (problematica_id, ge_section_id) VALUES ('p1', 10)",
      )
      await hub.execute(
        "INSERT INTO infra_problematica_seccion (problematica_id, ge_section_id) VALUES ('p2', 10)",
      )

      const resultado = await listarAlertasActivas(hub, {})
      expect(resultado.alertas.length).toBe(2)
      expect(resultado.indicadores.escuelas).toBe(1)
      // Dos alertas sobre la misma sección no duplican alumnos: unión, no suma.
      expect(resultado.indicadores.alumnos).toBe(25)
    } finally {
      hub.close()
    }
  })

  it('distingue CUE, localizaciones e inmuebles sin mezclarlas, e informa inmuebles no disponible sin marcarlo como cero', async () => {
    await seedGe()
    const hub = openHub()
    try {
      await createInfraTables(hub)
      // p1 en el CUE con coordenadas y sin CUI.
      await hub.execute(
        "INSERT INTO infra_problematica (id, cue_anexo, motivo, severidad, corte_id, creada_en, idempotency_key, origen) VALUES ('p1', '1801605-04', 'Inundación', 'Alta', 1, '2025-01-01T00:00:00Z', 'k1', 'enlace-cue')",
      )
      await hub.execute(
        "INSERT INTO infra_problematica_seccion (problematica_id, ge_section_id) VALUES ('p1', 10)",
      )
      const soloSinCui = await listarAlertasActivas(hub, {})
      expect(soloSinCui.indicadores.escuelas).toBe(1)
      expect(soloSinCui.indicadores.localizaciones).toBe(1)
      expect(soloSinCui.indicadores.inmueblesDisponible).toBe(false)
      expect(soloSinCui.indicadores.inmuebles).toBeNull()

      // p2 en el CUE sin coordenadas pero con CUI: sigue en lista y en escuelas,
      // pero no suma a localizaciones (no se puede plotear).
      await hub.execute(
        "INSERT INTO infra_problematica (id, cue_anexo, motivo, severidad, corte_id, creada_en, idempotency_key, origen) VALUES ('p2', '1801605-05', 'Sin energía o agua', 'Baja', 1, '2025-01-03T00:00:00Z', 'k2', 'enlace-cue')",
      )
      await hub.execute(
        "INSERT INTO infra_problematica_seccion (problematica_id, ge_section_id) VALUES ('p2', 30)",
      )

      const resultado = await listarAlertasActivas(hub, {})
      expect(resultado.alertas.length).toBe(2)
      expect(resultado.indicadores.escuelas).toBe(2)
      expect(resultado.indicadores.localizaciones).toBe(1)
      expect(resultado.indicadores.inmueblesDisponible).toBe(true)
      expect(resultado.indicadores.inmuebles).toBe(1)
    } finally {
      hub.close()
    }
  })

  it('población acotada al nivel filtrado: un CUE con varios niveles no aporta toda su matrícula a uno solo', async () => {
    await seedGe()
    const hub = openHub()
    try {
      await createInfraTables(hub)
      await hub.execute(
        "INSERT INTO infra_problematica (id, cue_anexo, motivo, severidad, corte_id, creada_en, idempotency_key, origen) VALUES ('p1', '1801605-04', 'Inundación', 'Alta', 1, '2025-01-01T00:00:00Z', 'k1', 'enlace-cue')",
      )
      await hub.execute(
        "INSERT INTO infra_problematica_seccion (problematica_id, ge_section_id) VALUES ('p1', 10)",
      )
      await hub.execute(
        "INSERT INTO infra_problematica_seccion (problematica_id, ge_section_id) VALUES ('p1', 20)",
      )

      const sinFiltro = await listarAlertasActivas(hub, {})
      expect(sinFiltro.indicadores.alumnos).toBe(35)

      const soloPrimaria = await listarAlertasActivas(hub, { nivel: 'PRIMARIA' })
      expect(soloPrimaria.indicadores.alumnos).toBe(25)
      // El universo educativo de "PRIMARIA" sin filtro de establecimiento
      // incluye también la sección de primaria del CUE 05 (10 alumnos): es la
      // población total del nivel, no solo la del CUE con alerta.
      expect(soloPrimaria.indicadores.universoEducativo).toBe(35)

      const soloPrimariaDelCue = await listarAlertasActivas(hub, {
        nivel: 'PRIMARIA',
        cueAnexo: '1801605-04',
      })
      expect(soloPrimariaDelCue.indicadores.universoEducativo).toBe(25)

      const soloSecundaria = await listarAlertasActivas(hub, { nivel: 'SECUNDARIA' })
      expect(soloSecundaria.indicadores.alumnos).toBe(10)
    } finally {
      hub.close()
    }
  })

  it('los casos sin CUI o sin coordenadas se informan y no se excluyen de los totales', async () => {
    await seedGe()
    const hub = openHub()
    try {
      await createInfraTables(hub)
      await hub.execute(
        "INSERT INTO infra_problematica (id, cue_anexo, motivo, severidad, corte_id, creada_en, idempotency_key, origen) VALUES ('p1', '1801605-05', 'Evacuación preventiva', 'Crítica', 1, '2025-01-01T00:00:00Z', 'k1', 'enlace-cue')",
      )
      await hub.execute(
        "INSERT INTO infra_problematica_seccion (problematica_id, ge_section_id) VALUES ('p1', 30)",
      )

      const resultado = await listarAlertasActivas(hub, {})
      expect(resultado.alertas.length).toBe(1)
      expect(resultado.alertas[0].lat).toBeNull()
      expect(resultado.alertas[0].lon).toBeNull()
      expect(resultado.indicadores.escuelas).toBe(1)
      expect(resultado.indicadores.alumnos).toBe(10)
    } finally {
      hub.close()
    }
  })

  it('filtra por territorio, establecimiento, motivo y severidad', async () => {
    await seedGe()
    const hub = openHub()
    try {
      await createInfraTables(hub)
      await hub.execute(
        "INSERT INTO infra_problematica (id, cue_anexo, motivo, severidad, corte_id, creada_en, idempotency_key, origen) VALUES ('p1', '1801605-04', 'Inundación', 'Alta', 1, '2025-01-01T00:00:00Z', 'k1', 'enlace-cue')",
      )
      await hub.execute(
        "INSERT INTO infra_problematica_seccion (problematica_id, ge_section_id) VALUES ('p1', 10)",
      )
      await hub.execute(
        "INSERT INTO infra_problematica (id, cue_anexo, motivo, severidad, corte_id, creada_en, idempotency_key, origen) VALUES ('p2', '1801605-05', 'Sin energía o agua', 'Baja', 1, '2025-01-02T00:00:00Z', 'k2', 'enlace-cue')",
      )
      await hub.execute(
        "INSERT INTO infra_problematica_seccion (problematica_id, ge_section_id) VALUES ('p2', 30)",
      )

      const porLocalidad = await listarAlertasActivas(hub, { territorio: 'Diamante' })
      expect(porLocalidad.alertas.map((a) => a.id)).toEqual(['p2'])

      const porEstablecimiento = await listarAlertasActivas(hub, { cueAnexo: '1801605-04' })
      expect(porEstablecimiento.alertas.map((a) => a.id)).toEqual(['p1'])

      const porMotivo = await listarAlertasActivas(hub, { motivo: 'Sin energía o agua' })
      expect(porMotivo.alertas.map((a) => a.id)).toEqual(['p2'])

      const porSeveridad = await listarAlertasActivas(hub, { severidad: 'Alta' })
      expect(porSeveridad.alertas.map((a) => a.id)).toEqual(['p1'])
    } finally {
      hub.close()
    }
  })

  it('el payload no contiene ningún campo nominal', async () => {
    await seedGe()
    const hub = openHub()
    try {
      await createInfraTables(hub)
      await hub.execute(
        "INSERT INTO infra_problematica (id, cue_anexo, motivo, severidad, corte_id, creada_en, idempotency_key, origen) VALUES ('p1', '1801605-04', 'Inundación', 'Alta', 1, '2025-01-01T00:00:00Z', 'k1', 'enlace-cue')",
      )
      await hub.execute(
        "INSERT INTO infra_problematica_seccion (problematica_id, ge_section_id) VALUES ('p1', 10)",
      )

      const resultado = await listarAlertasActivas(hub, {})
      const serializado = JSON.stringify(resultado)
      expect(serializado).not.toMatch(/gePersonId|ge_person_id|nombreAlumno|apellido/i)
      for (const alerta of resultado.alertas) {
        expect(Object.keys(alerta).sort()).toEqual(
          [
            'creadaEn',
            'cueAnexo',
            'departamento',
            'id',
            'localidad',
            'lat',
            'lon',
            'motivo',
            'nombre',
            'severidad',
          ].sort(),
        )
      }
    } finally {
      hub.close()
    }
  })

  it('devuelve un resultado vacío, con inmuebles no disponible, cuando no hay corte vigente', async () => {
    const ge = openGeDb()
    try {
      await ensureGeSchema(ge)
    } finally {
      ge.close()
    }
    const hub = openHub()
    try {
      const resultado = await listarAlertasActivas(hub, {})
      expect(resultado.alertas).toEqual([])
      expect(resultado.indicadores.escuelas).toBe(0)
      expect(resultado.indicadores.inmuebles).toBeNull()
      expect(resultado.indicadores.inmueblesDisponible).toBe(false)
    } finally {
      hub.close()
    }
  })
})
