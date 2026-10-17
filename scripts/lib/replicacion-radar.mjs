const TABLAS = [
  { nombre: 'radar_meteo_run', fecha: 'fetched_at', clave: ['idempotency_key'] },
  { nombre: 'radar_meteo_ensemble_run', fecha: 'fetched_at', clave: ['idempotency_key'] },
  { nombre: 'radar_meteo_verificacion', fecha: 'fecha', clave: ['fecha', 'departamento'] },
]

export function validarDestinosRadar(origen, destino) {
  try {
    const source = new URL(origen), target = new URL(destino)
    const postgres = (url) => ['postgres:', 'postgresql:'].includes(url.protocol)
    if (postgres(source) && postgres(target) && decodeURIComponent(source.pathname) === '/hub_prod' &&
      ['/hub_staging', '/hub_dev'].includes(decodeURIComponent(target.pathname))) return
  } catch { /* El error público no incluye URLs con credenciales. */ }
  throw new Error('La réplica requiere origen hub_prod y destino hub_staging o hub_dev')
}

// Recibe conexiones dedicadas: las transacciones no deben intercalarse con otros jobs.
export async function replicarRadar(origen, destino, ahora = new Date()) {
  const limite = new Date(ahora.getTime() - 14 * 86_400_000).toISOString()
  await origen.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
  let transaccionDestino = false
  try {
    await destino.query('BEGIN')
    transaccionDestino = true
    await destino.query(`LOCK TABLE ${TABLAS.map(t => `public.${t.nombre}`).join(', ')} IN SHARE ROW EXCLUSIVE MODE`)
    /** @type {Record<string, {copiadas: number, purgadas: number}>} */
    const resultado = {}
    for (const { nombre, clave, fecha } of TABLAS) {
      const corte = fecha === 'fecha' ? limite.slice(0, 10) : limite
      let copiadas = 0
      // Los payloads de grilla son grandes; no acumular los 14 días en memoria.
      for (;;) {
        const { rows } = await origen.query(`SELECT * FROM public.${nombre} WHERE ${fecha} >= $1
          ORDER BY ${clave.join(', ')} LIMIT 5 OFFSET $2`, [corte, copiadas])
        if (!rows.length) break
        const columnas = Object.keys(rows[0])
        if (columnas.some(c => !/^[a-z_]+$/.test(c))) throw new Error('Esquema radar inesperado')
        const cambios = columnas.filter(c => !clave.includes(c)).map(c => `${c} = EXCLUDED.${c}`).join(', ')
        await destino.query(`INSERT INTO public.${nombre} SELECT * FROM jsonb_populate_recordset(NULL::public.${nombre}, $1::jsonb)
          ON CONFLICT (${clave.join(', ')}) DO UPDATE SET ${cambios}`, [JSON.stringify(rows)])
        copiadas += rows.length
      }
      const purga = await destino.query(`DELETE FROM public.${nombre} WHERE ${fecha} < $1`, [corte])
      resultado[nombre] = { copiadas, purgadas: purga.rowCount ?? purga.affectedRows }
    }
    await origen.query('COMMIT')
    await destino.query('COMMIT')
    return resultado
  } catch (error) {
    await origen.query('ROLLBACK')
    if (transaccionDestino) await destino.query('ROLLBACK')
    throw error
  }
}
