import { randomUUID } from 'node:crypto'
import { and, desc, eq, ne, sql } from 'drizzle-orm'
import { transaccionContextual } from '@/lib/db/contexto'
import { getDb } from '@/lib/db'
import { infraAdjunto, infraMovimiento, infraParte } from '@/lib/db/schema'
import { tieneAccesoAlParteParaCue } from '@/lib/infraestructura/acceso-parte'
import { cambioAuditado } from '@/lib/infraestructura/auditoria/servidor'
import { auth } from '@/lib/auth'

const LIMITE_FOTOS = 3
const LIMITE_OPTIMIZADA = 600 * 1024
const LIMITE_MINIATURA = 40 * 1024
const ID_SEGURO = /^[a-zA-Z0-9_-]{1,128}$/
const TIPOS_FOTO = new Set(['image/jpeg', 'image/webp'])

export interface DeclaracionFoto {
  attachmentId: string
  optimizadaSize: number
  optimizadaContentType: 'image/jpeg' | 'image/webp'
  miniaturaSize: number
  miniaturaContentType: 'image/jpeg' | 'image/webp'
}

export interface CrearEvidenciaFotograficaInput {
  movimientoBaseId: string
  idempotencyKey: string
  fotos: DeclaracionFoto[]
}

export interface ResultadoEvidenciaFotografica {
  movimientoId: string
  attachmentIds: string[]
  repetido: boolean
}

export class ErrorEvidenciaFotografica extends Error {
  readonly status: 400 | 403 | 404 | 409

  constructor(
    message: string,
    status: 400 | 403 | 404 | 409,
  ) {
    super(message)
    this.name = 'ErrorEvidenciaFotografica'
    this.status = status
  }
}

type Db = ReturnType<typeof getDb>

/** Lecturas y controles previos a cualquier escritura: se hacen fuera de la transacción auditada. */
export interface EvidenciaPreparada {
  input: CrearEvidenciaFotograficaInput
  base: { id: string; tipo: string; parteId: string; rigeDesde: string; cueAnexo: string }
  creadaPor: string
  dbTime: string
  movimientoId: string
}

/**
 * Valida, resuelve el movimiento base, verifica el acceso y la sesión. No escribe.
 * Sus errores de negocio llegan como ErrorEvidenciaFotografica antes de abrir ninguna transacción.
 */
async function prepararEvidenciaFotografica(
  request: Request,
  input: CrearEvidenciaFotograficaInput,
  ahora = new Date(),
): Promise<EvidenciaPreparada> {
  validarEntrada(input)

  const db = getDb()
  const [base] = await db
    .select({
      id: infraMovimiento.id,
      tipo: infraMovimiento.tipo,
      parteId: infraMovimiento.parteId,
      rigeDesde: infraMovimiento.rigeDesde,
      cueAnexo: infraParte.cueAnexo,
    })
    .from(infraMovimiento)
    .innerJoin(infraParte, eq(infraParte.id, infraMovimiento.parteId))
    .where(eq(infraMovimiento.id, input.movimientoBaseId))
    .limit(1)
  if (!base) throw new ErrorEvidenciaFotografica('Base movement not found', 404)
  if (!(await tieneAccesoAlParteParaCue(request, base.cueAnexo))) {
    throw new ErrorEvidenciaFotografica('Not authorized to update evidence', 403)
  }
  if (base.tipo === 'evidencia_fotografica') {
    throw new ErrorEvidenciaFotografica('Evidence cannot be attached to evidence movements', 400)
  }

  const session = await auth.api.getSession({ headers: request.headers })
  return {
    input,
    base,
    creadaPor: session?.user.id ?? 'public-parte',
    dbTime: ahora.toISOString(),
    movimientoId: randomUUID(),
  }
}

/**
 * Escribe el movimiento de evidencia y reserva sus claves OBS. Con `db` = transacción
 * auditada se anida como savepoint; sin ella abre su propia transacción.
 */
async function escribirEvidenciaFotografica(
  db: Pick<Db, 'transaction'>,
  preparada: EvidenciaPreparada,
): Promise<ResultadoEvidenciaFotografica> {
  const { input, base, creadaPor, dbTime, movimientoId } = preparada
  const extensionPorTipo = (contentType: string) => contentType === 'image/webp' ? 'webp' : 'jpg'

  return db.transaction(async (tx) => {
    // Serialize evidence updates for this source movement before creating a
    // new evidence movement. The trigger independently guards every target.
    await tx.execute(
      sql`SELECT id FROM infra_movimiento WHERE id = ${base.id} FOR UPDATE`,
    )

    const [existing] = await tx
      .select({ id: infraMovimiento.id, tipo: infraMovimiento.tipo })
      .from(infraMovimiento)
      .where(eq(infraMovimiento.idempotencyKey, input.idempotencyKey))
      .limit(1)
    if (existing) {
      if (existing.tipo !== 'evidencia_fotografica') {
        throw new ErrorEvidenciaFotografica('Idempotency key already used', 409)
      }
      const [existingSummary] = await tx
        .select({ resumen: infraMovimiento.resumen })
        .from(infraMovimiento)
        .where(eq(infraMovimiento.id, existing.id))
        .limit(1)
      const declaredIds = (existingSummary?.resumen.attachmentIds as unknown[] | undefined) ?? []
      const attached = await tx
        .select({
          id: infraAdjunto.id,
          optimizadaSize: infraAdjunto.optimizadaSize,
          optimizadaContentType: infraAdjunto.optimizadaContentType,
          miniaturaSize: infraAdjunto.miniaturaSize,
          miniaturaContentType: infraAdjunto.miniaturaContentType,
        })
        .from(infraAdjunto)
        .where(eq(infraAdjunto.movimientoId, existing.id))
      const sameBody =
        existingSummary?.resumen.documentaMovimientoId === base.id &&
        declaredIds.length === input.fotos.length &&
        input.fotos.every((foto, index) => {
          const row = attached.find((candidate) => candidate.id === foto.attachmentId)
          return (
            declaredIds[index] === foto.attachmentId &&
            row?.optimizadaSize === foto.optimizadaSize &&
            row.optimizadaContentType === foto.optimizadaContentType &&
            row.miniaturaSize === foto.miniaturaSize &&
            row.miniaturaContentType === foto.miniaturaContentType
          )
        })
      if (!sameBody) throw new ErrorEvidenciaFotografica('Idempotency key body mismatch', 409)
      return {
        movimientoId: existing.id,
        attachmentIds: attached.map((row) => row.id),
        repetido: true,
      }
    }

    await tx.insert(infraMovimiento).values({
      id: movimientoId,
      parteId: base.parteId,
      tipo: 'evidencia_fotografica',
      rol: 'director',
      resumen: {
        documentaMovimientoId: base.id,
        attachmentIds: input.fotos.map((foto) => foto.attachmentId),
      },
      rigeDesde: base.rigeDesde,
      creadaEn: dbTime,
      idempotencyKey: input.idempotencyKey,
    })

    await tx.insert(infraAdjunto).values(
      input.fotos.map((foto) => {
        const extensionOptimizada = extensionPorTipo(foto.optimizadaContentType)
        const extensionMiniatura = extensionPorTipo(foto.miniaturaContentType)
        return {
          id: foto.attachmentId,
          movimientoId,
          optimizadaObsKey: `reportes/${base.cueAnexo}/${movimientoId}/${foto.attachmentId}/optimizada.${extensionOptimizada}`,
          optimizadaSize: foto.optimizadaSize,
          optimizadaContentType: foto.optimizadaContentType,
          optimizadaEtag: null,
          miniaturaObsKey: `reportes/${base.cueAnexo}/${movimientoId}/${foto.attachmentId}/miniatura.${extensionMiniatura}`,
          miniaturaSize: foto.miniaturaSize,
          miniaturaContentType: foto.miniaturaContentType,
          miniaturaEtag: null,
          estado: 'pending',
          creadaPor,
        }
      }),
    )
    return {
      movimientoId,
      attachmentIds: input.fotos.map((foto) => foto.attachmentId),
      repetido: false,
    }
  })
}

/**
 * Crea un movimiento de evidencia solo fotográfica y reserva sus claves OBS. Los bytes de
 * imagen nunca pasan por este servicio. El bloqueo del movimiento padre y el trigger de la
 * base mantienen el límite de tres fotos bajo solicitudes concurrentes.
 */
export async function crearEvidenciaFotografica(
  request: Request,
  input: CrearEvidenciaFotograficaInput,
  ahora = new Date(),
): Promise<ResultadoEvidenciaFotografica> {
  // Lecturas y permisos primero, fuera de cualquier transacción; luego sólo la escritura y su evento.
  const preparada = await prepararEvidenciaFotografica(request, input, ahora)
  const descripcion = (valor: ResultadoEvidenciaFotografica) => ({
    status: 200,
    resultado: valor.repetido ? 'repetido' as const : 'exito' as const,
    objetoTipo: 'movimiento',
    objetoId: valor.movimientoId,
  })
  // Dentro de una transacción auditada ajena (el evento lo escribe su dueño), la escritura se anida.
  if (transaccionContextual.getStore()) return escribirEvidenciaFotografica(getDb(), preparada)
  return cambioAuditado(tx => escribirEvidenciaFotografica(tx, preparada), descripcion)
}

/**
 * Latest non-evidence movement of the school's report: what photos attach to
 * when the caller only knows the school. Null when the school has no report.
 */
export async function resolverMovimientoBaseEvidencia(cueAnexo: string): Promise<string | null> {
  const [fila] = await getDb()
    .select({ id: infraMovimiento.id })
    .from(infraMovimiento)
    .innerJoin(infraParte, eq(infraParte.id, infraMovimiento.parteId))
    .where(and(eq(infraParte.cueAnexo, cueAnexo), ne(infraMovimiento.tipo, 'evidencia_fotografica')))
    .orderBy(desc(infraMovimiento.creadaEn))
    .limit(1)
  return fila?.id ?? null
}

function validarEntrada(input: CrearEvidenciaFotograficaInput): void {
  if (!ID_SEGURO.test(input.movimientoBaseId) || !ID_SEGURO.test(input.idempotencyKey)) {
    throw new ErrorEvidenciaFotografica('Invalid movement or idempotency identifier', 400)
  }
  if (input.fotos.length < 1 || input.fotos.length > LIMITE_FOTOS) {
    throw new ErrorEvidenciaFotografica('A movement accepts one to three photos', 400)
  }
  const ids = new Set<string>()
  for (const foto of input.fotos) {
    if (!ID_SEGURO.test(foto.attachmentId) || ids.has(foto.attachmentId)) {
      throw new ErrorEvidenciaFotografica('Invalid or duplicate attachment identifier', 400)
    }
    ids.add(foto.attachmentId)
    if (
      !TIPOS_FOTO.has(foto.optimizadaContentType) ||
      !TIPOS_FOTO.has(foto.miniaturaContentType) ||
      !Number.isInteger(foto.optimizadaSize) ||
      foto.optimizadaSize < 1 ||
      foto.optimizadaSize > LIMITE_OPTIMIZADA ||
      !Number.isInteger(foto.miniaturaSize) ||
      foto.miniaturaSize < 1 ||
      foto.miniaturaSize > LIMITE_MINIATURA
    ) {
      throw new ErrorEvidenciaFotografica('Invalid photo metadata', 400)
    }
  }
}
