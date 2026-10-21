#!/usr/bin/env node
import { fileURLToPath } from 'node:url'
import { registerTsResolver } from './lib/register-ts-resolver.mjs'
registerTsResolver(process.cwd())

export async function aplicarRecuperacion(db, filasGe, acumulador, clave, niveles = { niveles: [], cues: [] }) {
  const { sql } = await import('drizzle-orm')
  const { publicarLocalizacionesGe } = await import('./localizaciones-ge.mjs')
  const { cifrarIdentidad } = await import('../lib/infraestructura/identidad-cripto.ts')
  if (clave.length !== 32) throw new Error('NOMINAL_ENCRYPTION_KEY inválida')
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('ge-recuperar-cobertura'))`)
    const corte = (await tx.execute(sql`SELECT id FROM ge.ge_corte WHERE estado='vigente' FOR UPDATE`)).rows
    if (corte.length !== 1) throw new Error('Se requiere un único corte vigente')
    const corteId = Number(corte[0].id)
    const { nuevas, versionId } = await publicarLocalizacionesGe(tx, filasGe)
    const cues = new Set(nuevas.map((r) => r.cueAnexo))
    if (!cues.size) return { versionId, corteId, cues: [], secciones: 0, membresias: 0 }
    const secciones = [...acumulador.secciones].map(([id, r]) => ({ id, ...r }))
    if (secciones.some((r) => !cues.has(r.cueAnexo)) || nuevas.some((r) => !secciones.some((s) => s.cueAnexo === r.cueAnexo))) {
      throw new Error('Las secciones recuperadas no coinciden con los CUE nuevos')
    }
    const ids = JSON.stringify(secciones.map((r) => r.id))
    const existentes = await tx.execute(sql`SELECT ge_section_id FROM ge.ge_seccion WHERE corte_id=${corteId}
      AND ge_section_id IN (SELECT value::bigint FROM jsonb_array_elements_text(${ids}::jsonb))`)
    if (existentes.rows.length) throw new Error('Colisión con secciones existentes; no se modificó el corte')
    await tx.execute(sql`INSERT INTO ge.ge_seccion (corte_id,ge_section_id,cue_anexo,curso,division,nivel,turno)
      SELECT ${corteId},r.id,r."cueAnexo",r.curso,r.division,r.nivel,r.turno
      FROM jsonb_to_recordset(${JSON.stringify(secciones)}::jsonb)
      AS r(id bigint,"cueAnexo" text,curso text,division text,nivel text,turno text)`)
    const identidades = [...acumulador.personas].map(([id, p]) => ({ id, payload: cifrarIdentidad(p.nombre, p.apellido, clave) }))
    await tx.execute(sql`INSERT INTO ge.ge_alumno_identidad (ge_person_id,payload_cifrado)
      SELECT r.id,r.payload FROM jsonb_to_recordset(${JSON.stringify(identidades)}::jsonb) AS r(id bigint,payload text)
      ON CONFLICT (ge_person_id) DO NOTHING`)
    await tx.execute(sql`INSERT INTO ge.ge_alumno_seccion (corte_id,ge_section_id,ge_person_id)
      SELECT ${corteId},r."geSectionId",r."gePersonId" FROM jsonb_to_recordset(${JSON.stringify(acumulador.membresias)}::jsonb)
      AS r("geSectionId" bigint,"gePersonId" bigint) ON CONFLICT DO NOTHING`)
    const asignaciones = niveles.cues.filter((r) => cues.has(r.cueAnexo))
    const idsNivel = new Set(asignaciones.map((r) => r.nivelJurisdiccionalId))
    for (const r of niveles.niveles.filter((r) => idsNivel.has(r.id))) {
      await tx.execute(sql`INSERT INTO ge.ge_nivel_jurisdiccional(id,nombre) VALUES(${r.id},${r.nombre}) ON CONFLICT DO NOTHING`)
    }
    for (const r of asignaciones) {
      await tx.execute(sql`INSERT INTO ge.ge_escuela_nivel_jur(cue_anexo,nivel_jurisdiccional_id,ciclo_lectivo)
        SELECT ${r.cueAnexo},${r.nivelJurisdiccionalId},ciclo_lectivo FROM ge.ge_corte WHERE id=${corteId} ON CONFLICT DO NOTHING`)
    }
    return { versionId, corteId, cues: [...cues], secciones: secciones.length, membresias: acumulador.membresias.length }
  })
}

async function main() {
  const { getDb, getRawClient } = await import('../lib/db/index.ts')
  const { leerVersion } = await import('../lib/infraestructura/datasets/repositorio.ts')
  const { completarLocalizaciones, leerLocalizacionesDesdeGe } = await import('./localizaciones-ge.mjs')
  const { crearAcumulador } = await import('./import-padron.mjs')
  const { recorrerPadronDesdeGe, leerNivelesJurisdiccionalesDesdeGe } = await import('./padron-ge.mjs')
  try {
    const db = getDb()
    const actual = await leerVersion('localizaciones')
    if (!actual) throw new Error('Falta el catálogo de localizaciones')
    const corte = (await getRawClient().query("SELECT ciclo_lectivo FROM ge.ge_corte WHERE estado='vigente'")).rows
    if (corte.length !== 1) throw new Error('Se requiere un único corte vigente')
    const cicloLectivo = String(corte[0].ciclo_lectivo)
    const filasGe = await leerLocalizacionesDesdeGe({ cicloLectivo })
    const plan = completarLocalizaciones(actual.documento, filasGe)
    console.log(JSON.stringify({ nuevas: plan.nuevas, excluidas: plan.excluidas }))
    if (!process.argv.includes('--aplicar') || !plan.nuevas.length) return
    const cues = new Set(plan.nuevas.map((r) => r.cueAnexo))
    const acumulador = crearAcumulador()
    await recorrerPadronDesdeGe({ cicloLectivo, onLote: (filas) => acumulador.agregar(filas.filter((r) => cues.has(r.cueAnexo))) })
    const niveles = await leerNivelesJurisdiccionalesDesdeGe({ cicloLectivo })
    const clave = Buffer.from(process.env.NOMINAL_ENCRYPTION_KEY ?? '', 'base64')
    console.log(JSON.stringify(await aplicarRecuperacion(db, filasGe, acumulador, clave, niveles)))
  } finally {
    const raw = getRawClient()
    if (typeof raw.end === 'function') await raw.end()
    else await raw.close()
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main().catch((e) => { console.error(e.message); process.exitCode = 1 })
}
