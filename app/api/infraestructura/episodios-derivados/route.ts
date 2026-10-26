import { and, desc, eq, gte, lte, sql } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '@/lib/db'
import { infraEpisodioDerivado } from '@/lib/db/schema'
import { ensureSeeded } from '@/lib/db/seed'
import { respuestaAccesoDenegado } from '@/lib/infraestructura/respuesta-acceso-denegado'
import { verificarAccesoLectura } from '@/lib/infraestructura/acceso-lectura'
import { EPISODIOS_REGLA_VERSION } from '@/lib/infraestructura/episodios-derivados/regla'
import { jsonError } from '@/lib/infraestructura/respuesta-error'
import { jsonNoStore } from '@/lib/infraestructura/respuesta-no-store'
import { ruta } from '@/lib/http/ruta'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Los timestamps de esta tabla se escriben siempre en el mismo formato UTC
// (sufijo Z), por eso la comparación de strings de `inicioEn` es válida acá.
const episodiosQuerySchema = z.object({
  estado: z.enum(['abierto', 'cerrado']).optional(),
  departamento: z.string().min(1).optional(),
  desde: z.iso.datetime({ offset: false }).optional(),
  hasta: z.iso.datetime({ offset: false }).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
})

async function handleGET(request: Request) {
  // ACL primero: una request sin sesión no debe disparar trabajo de DB
  // (ensureSeeded) antes de fallar.
  const acceso = await verificarAccesoLectura()
  if (!acceso.ok) return respuestaAccesoDenegado(acceso)

  await ensureSeeded()

  const { searchParams } = new URL(request.url)

  const parsed = episodiosQuerySchema.safeParse({
    estado: searchParams.get('estado') ?? undefined,
    departamento: searchParams.get('departamento') ?? undefined,
    desde: searchParams.get('desde') ?? undefined,
    hasta: searchParams.get('hasta') ?? undefined,
    page: searchParams.get('page') ?? undefined,
    pageSize: searchParams.get('pageSize') ?? undefined,
  })
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return jsonError(`Parámetro inválido: ${issue.path.join('.')}`, 400)
  }
  const { estado, departamento, desde, hasta, page, pageSize } = parsed.data

  const condiciones = [
    eq(infraEpisodioDerivado.reglaVersion, EPISODIOS_REGLA_VERSION),
  ]
  if (estado !== undefined) {
    condiciones.push(eq(infraEpisodioDerivado.estado, estado))
  }
  if (departamento !== undefined) {
    // El dato viene normalizado en mayúsculas desde la capa que escribe la
    // tabla; acá la comparación es exacta, sin normalizar.
    condiciones.push(eq(infraEpisodioDerivado.unidadId, departamento))
  }
  if (desde !== undefined) {
    condiciones.push(gte(infraEpisodioDerivado.inicioEn, desde))
  }
  if (hasta !== undefined) {
    condiciones.push(lte(infraEpisodioDerivado.inicioEn, hasta))
  }
  const where = condiciones.length > 0 ? and(...condiciones) : undefined

  const db = getDb()

  const [countRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(infraEpisodioDerivado)
    .where(where)
  const total = Number(countRow?.count ?? 0)

  const items = await db
    .select({
      id: infraEpisodioDerivado.id,
      reglaVersion: infraEpisodioDerivado.reglaVersion,
      unidadTipo: infraEpisodioDerivado.unidadTipo,
      departamento: infraEpisodioDerivado.unidadId,
      inicioEn: infraEpisodioDerivado.inicioEn,
      finEn: infraEpisodioDerivado.finEn,
      estado: infraEpisodioDerivado.estado,
      escuelasAfectadas: infraEpisodioDerivado.escuelasAfectadas,
      calculadoEn: infraEpisodioDerivado.calculadoEn,
    })
    .from(infraEpisodioDerivado)
    .where(where)
    .orderBy(desc(infraEpisodioDerivado.inicioEn))
    .limit(pageSize)
    .offset((page - 1) * pageSize)

  return jsonNoStore({ items, page, pageSize, total, totalPages: Math.ceil(total / pageSize) })
}

export const GET = ruta('infraestructura.episodios-derivados.get', handleGET)
