import { sql } from 'drizzle-orm'
import { integer, sqliteTable, text, primaryKey, index, uniqueIndex } from 'drizzle-orm/sqlite-core'

export const niveles = sqliteTable('niveles', {
  id: text('id').primaryKey(),
  nombre: text('nombre').notNull(),
  orden: integer('orden').notNull(),
})

export const tipos = sqliteTable('tipos', {
  id: text('id').primaryKey(),
  nombre: text('nombre').notNull(),
  aplicaA: text('aplica_a', { mode: 'json' }).$type<string[]>().notNull(),
})

export const categorias = sqliteTable('categorias', {
  id: text('id').primaryKey(),
  nombre: text('nombre').notNull(),
  color: text('color').notNull(),
})

export const tags = sqliteTable('tags', {
  id: text('id').primaryKey(),
  nombre: text('nombre').notNull(),
})

export const recursos = sqliteTable('recursos', {
  id: text('id').primaryKey(),
  titulo: text('titulo').notNull(),
  descripcion: text('descripcion').notNull(),
  formato: text('formato').notNull(),
  nivelId: text('nivel_id')
    .notNull()
    .references(() => niveles.id),
  tipoId: text('tipo_id')
    .notNull()
    .references(() => tipos.id),
  categoriaId: text('categoria_id')
    .notNull()
    .references(() => categorias.id),
  area: text('area').notNull(),
  actualizado: text('actualizado').notNull(),
  estado: text('estado').notNull(),
  ruta: text('ruta'),
  storageKey: text('storage_key'),
  mime: text('mime'),
  nombreOriginal: text('nombre_original'),
  size: integer('size'),
})

export const recursoTags = sqliteTable(
  'recurso_tags',
  {
    recursoId: text('recurso_id')
      .notNull()
      .references(() => recursos.id, { onDelete: 'cascade' }),
    tagId: text('tag_id')
      .notNull()
      .references(() => tags.id),
  },
  (t) => [primaryKey({ columns: [t.recursoId, t.tagId] })],
)

export const recursoAudienciaNiveles = sqliteTable(
  'recurso_audiencia_niveles',
  {
    recursoId: text('recurso_id')
      .notNull()
      .references(() => recursos.id, { onDelete: 'cascade' }),
    nivelId: text('nivel_id')
      .notNull()
      .references(() => niveles.id),
  },
  (t) => [primaryKey({ columns: [t.recursoId, t.nivelId] })],
)

export const recursoAudienciaUsuarios = sqliteTable(
  'recurso_audiencia_usuarios',
  {
    recursoId: text('recurso_id')
      .notNull()
      .references(() => recursos.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull(),
  },
  (t) => [primaryKey({ columns: [t.recursoId, t.userId] })],
)

export const user = sqliteTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' })
    .default(false)
    .notNull(),
  image: text('image'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
  role: text('role'),
  banned: integer('banned', { mode: 'boolean' }).default(false),
  banReason: text('ban_reason'),
  banExpires: integer('ban_expires', { mode: 'timestamp_ms' }),
})

export const session = sqliteTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    token: text('token').notNull().unique(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    impersonatedBy: text('impersonated_by'),
  },
  (table) => [index('session_userId_idx').on(table.userId)],
)

export const account = sqliteTable(
  'account',
  {
    id: text('id').primaryKey(),
    issuer: text('issuer').notNull(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: integer('access_token_expires_at', {
      mode: 'timestamp_ms',
    }),
    refreshTokenExpiresAt: integer('refresh_token_expires_at', {
      mode: 'timestamp_ms',
    }),
    scope: text('scope'),
    password: text('password'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex('account_issuer_accountId_uidx').on(table.issuer, table.accountId),
    index('account_userId_idx').on(table.userId),
  ],
)

export const verification = sqliteTable(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index('verification_identifier_idx').on(table.identifier)],
)

export const userNiveles = sqliteTable(
  'user_niveles',
  {
    userId: text('user_id').notNull(),
    nivelId: text('nivel_id')
      .notNull()
      .references(() => niveles.id),
  },
  (t) => [primaryKey({ columns: [t.userId, t.nivelId] })],
)

// Motivos de problemática: dato con ABM (ver app/api/infraestructura/motivos),
// no un enum en código. `categoria` referencia el catálogo fijo de
// lib/infraestructura/categorias.ts (no hay FK porque ese catálogo no es una
// tabla). `id` es un slug estable usado sólo en el ABM y en el formulario; lo
// que persiste infra_problematica.motivo es el nombre, no este id.
export const infraMotivo = sqliteTable('infra_motivo', {
  id: text('id').primaryKey(),
  nombre: text('nombre').notNull(),
  categoria: text('categoria').notNull(),
  orden: integer('orden').notNull().default(0),
})

export const infraProblematica = sqliteTable('infra_problematica', {
  id: text('id').primaryKey(),
  cueAnexo: text('cue_anexo').notNull(),
  motivo: text('motivo').notNull(),
  // Resuelta por el servidor a partir de infra_motivo en el momento del alta
  // (ver resolverCategoria en lib/infraestructura/validacion.ts); nunca la
  // decide el cliente. Columna agregada con ALTER a las bases existentes
  // (ver ensureCategoriaColumn en lib/db/seed.ts) porque SQLite no permite
  // agregarla NOT NULL con filas ya presentes: acá se declara notNull porque
  // el backfill la completa antes de que cualquier lectura la use.
  categoria: text('categoria').notNull(),
  severidad: text('severidad').notNull(),
  descripcion: text('descripcion'),
  corteId: integer('corte_id').notNull(),
  creadaEn: text('creada_en').notNull(),
  idempotencyKey: text('idempotency_key').notNull().unique(),
  origen: text('origen').notNull(),
  // Enlace aditivo al modelo de parte (ver
  // docs/especificacion-funcional-trayectoria-evento-hidrometeorologico.md).
  // Nullable a propósito: mismo motivo que categoria arriba, columna agregada
  // con ALTER (ver ensureParteIdColumn en lib/db/seed.ts) porque SQLite no
  // permite agregarla NOT NULL con filas ya presentes. El backfill
  // (backfillPeriodoYPartes) la completa para las filas existentes, pero
  // nunca se vuelve NOT NULL a nivel de esquema: una fila histórica de una
  // base que todavía no corrió el backfill debe seguir siendo válida.
  parteId: text('parte_id').references(() => infraParte.id),
})

export const infraProblematicaSeccion = sqliteTable(
  'infra_problematica_seccion',
  {
    problematicaId: text('problematica_id')
      .notNull()
      .references(() => infraProblematica.id, { onDelete: 'cascade' }),
    geSectionId: integer('ge_section_id').notNull(),
  },
  (t) => [primaryKey({ columns: [t.problematicaId, t.geSectionId] })],
)

// Alumnos seleccionados individualmente dentro de una sección (selección
// parcial). Una sección presente en infraProblematicaSeccion sin ninguna fila
// acá se interpreta como "sección completa": la ausencia de filas es la
// semántica, no un estado transitorio. Mismo estilo que
// infraProblematicaSeccion, misma clave compuesta y el mismo cascade.
export const infraProblematicaAlumno = sqliteTable(
  'infra_problematica_alumno',
  {
    problematicaId: text('problematica_id')
      .notNull()
      .references(() => infraProblematica.id, { onDelete: 'cascade' }),
    gePersonId: integer('ge_person_id').notNull(),
  },
  (t) => [primaryKey({ columns: [t.problematicaId, t.gePersonId] })],
)

// Otorga a un usuario la capacidad de ver nombres de alumnos. `vence_en` es
// obligatorio: no existen grants permanentes. `otorgado_por` deja registrado
// quién lo concedió, incluso cuando un admin se lo otorga a sí mismo.
export const infraPermisoNominal = sqliteTable('infra_permiso_nominal', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  otorgadoPor: text('otorgado_por').notNull(),
  otorgadoEn: text('otorgado_en').notNull(),
  venceEn: text('vence_en').notNull(),
  revocadoEn: text('revocado_en'),
})

// Auditoría de cada consulta al alcance nominal: quién, qué problemática y
// cuántos alumnos vio. Se escribe en la misma transacción que sirve la
// respuesta del endpoint (ver app/api/infraestructura/nominal/route.ts).
export const infraAccesoNominalLog = sqliteTable('infra_acceso_nominal_log', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  problematicaId: text('problematica_id').notNull(),
  cantidad: integer('cantidad').notNull(),
  consultadoEn: text('consultado_en').notNull(),
})

// --- Trayectoria de situaciones hidrometeorológicas ---
// Ver docs/especificacion-funcional-trayectoria-evento-hidrometeorologico.md
// y el CONTRACT.md del batch de esquema. Migración aditiva: infra_problematica
// (arriba) sigue existiendo tal cual y mapea ~1:1 a "afectación"; estas tablas
// nuevas agregan el modelo de período/parte por encima, sin tocar el
// contrato existente de POST /api/problematicas.
//
// Todas las columnas de vigencia siguen la distinción de la spec §12: `rigeDesde`
// (cuándo empieza a regir el cambio, puede ser pasado o futuro) es siempre
// distinta de `creadaEn` (cuándo se cargó en el sistema, reloj del servidor).
// Ninguna se deriva de la otra. Igual que `infra_problematica.creadaEn`, se
// guardan como texto ISO 8601, nunca como entero epoch (ese modo sólo lo usan
// las tablas de better-auth).

// Período provincial (p. ej. protocolo ENOS 2026/2027). Sólo un período puede
// estar `vigente` a la vez: índice único parcial (`WHERE estado = 'vigente'`),
// no sobre la columna entera, para que puedan coexistir muchos períodos
// `historico`. La creación real de este índice vive en el DDL crudo de
// HUB_DDL (lib/db/seed.ts) porque este proyecto no corre drizzle-kit
// generate/push (ver seedHub) — la declaración acá mantiene el esquema
// tipado en sincro con esa DDL, no es lo que la crea en runtime.
export const infraPeriodo = sqliteTable(
  'infra_periodo',
  {
    id: text('id').primaryKey(),
    nombre: text('nombre').notNull(),
    inicioEn: text('inicio_en').notNull(),
    // Nullable: un período vigente todavía no tiene fecha de fin conocida.
    finEn: text('fin_en'),
    estado: text('estado').notNull(), // 'vigente' | 'historico'
    creadaEn: text('creada_en').notNull(),
  },
  (t) => [
    uniqueIndex('infra_periodo_vigente_unico')
      .on(t.estado)
      .where(sql`${t.estado} = 'vigente'`),
  ],
)

// Lo que el director ve y actualiza: un parte por cada (cueAnexo, periodoId).
// `infra_parte_cue_periodo_uidx` impone esa unicidad. Intentar iniciar un
// reporte cuando ya existe un parte para el establecimiento en el período
// vigente resuelve a "actualizar el parte" (spec §8, CONTRACT.md — spec §14
// "Continuar como otro episodio" queda muerta).
export const infraParte = sqliteTable(
  'infra_parte',
  {
    id: text('id').primaryKey(),
    periodoId: text('periodo_id')
      .notNull()
      .references(() => infraPeriodo.id),
    cueAnexo: text('cue_anexo').notNull(),
    // 'habitual' | 'evacuado' | 'centro_evacuados' (spec §11). Independiente
    // del servicio educativo: ver infraServicioAlcance.
    estadoEstablecimiento: text('estado_establecimiento').notNull().default('habitual'),
    estadoEstablecimientoRigeDesde: text('estado_establecimiento_rige_desde').notNull(),
    corteId: integer('corte_id').notNull(),
    creadaEn: text('creada_en').notNull(),
    actualizadaEn: text('actualizada_en').notNull(),
  },
  (t) => [
    uniqueIndex('infra_parte_cue_periodo_uidx').on(t.cueAnexo, t.periodoId),
    index('infra_parte_periodo_id_idx').on(t.periodoId),
  ],
)

// Una consecuencia concreta del parte (spec §3.2, §9). N por parte, cada una
// con severidad y alcance propios: modificar una no altera las demás. Soft
// delete vía `retiradaEn` (nullable): "retirar" una afectación no borra la
// fila para que el historial (spec §15) conserve la trayectoria completa
// (spec §8: la actualización conserva el estado anterior en el historial).
export const infraAfectacion = sqliteTable(
  'infra_afectacion',
  {
    id: text('id').primaryKey(),
    parteId: text('parte_id')
      .notNull()
      .references(() => infraParte.id, { onDelete: 'cascade' }),
    motivo: text('motivo').notNull(),
    categoria: text('categoria').notNull(),
    severidad: text('severidad').notNull(),
    descripcion: text('descripcion'),
    rigeDesde: text('rige_desde').notNull(),
    creadaEn: text('creada_en').notNull(),
    // Soft delete: nunca se borra una fila, se marca el momento en que dejó
    // de regir. Null mientras la afectación sigue vigente.
    retiradaEn: text('retirada_en'),
  },
  (t) => [index('infra_afectacion_parte_id_idx').on(t.parteId)],
)

// Mismo estilo, misma clave compuesta y el mismo cascade que
// infraProblematicaSeccion.
export const infraAfectacionSeccion = sqliteTable(
  'infra_afectacion_seccion',
  {
    afectacionId: text('afectacion_id')
      .notNull()
      .references(() => infraAfectacion.id, { onDelete: 'cascade' }),
    geSectionId: integer('ge_section_id').notNull(),
  },
  (t) => [primaryKey({ columns: [t.afectacionId, t.geSectionId] })],
)

// Alumnos seleccionados individualmente dentro de una sección (selección
// parcial). Misma semántica que infraProblematicaAlumno: una sección presente
// en infraAfectacionSeccion sin ninguna fila acá se interpreta como "sección
// completa"; la ausencia de filas es la semántica, no un estado transitorio.
export const infraAfectacionAlumno = sqliteTable(
  'infra_afectacion_alumno',
  {
    afectacionId: text('afectacion_id')
      .notNull()
      .references(() => infraAfectacion.id, { onDelete: 'cascade' }),
    gePersonId: integer('ge_person_id').notNull(),
  },
  (t) => [primaryKey({ columns: [t.afectacionId, t.gePersonId] })],
)

// Alcance de la suspensión del servicio educativo (spec §10). `tipo` indica
// qué clase de referencia es `referenciaId`: null para 'establecimiento',
// identificador de turno o `geSectionId` (como texto) para 'turno'/'seccion'.
// El estado general mostrado al director ('normal' | 'parcial' | 'suspendido')
// se calcula a partir de las filas vigentes de esta tabla — nunca se
// persiste, ver CONTRACT.md. Soft delete vía `retiradaEn`, mismo criterio que
// infraAfectacion.
export const infraServicioAlcance = sqliteTable(
  'infra_servicio_alcance',
  {
    id: text('id').primaryKey(),
    parteId: text('parte_id')
      .notNull()
      .references(() => infraParte.id, { onDelete: 'cascade' }),
    tipo: text('tipo').notNull(), // 'establecimiento' | 'turno' | 'seccion'
    referenciaId: text('referencia_id'),
    estado: text('estado').notNull(), // 'normal' | 'suspendido'
    rigeDesde: text('rige_desde').notNull(),
    creadaEn: text('creada_en').notNull(),
    retiradaEn: text('retirada_en'),
  },
  (t) => [index('infra_servicio_alcance_parte_id_idx').on(t.parteId)],
)

// Auditoría append-only de la trayectoria del parte (spec §3.3, §15). Nunca
// se actualiza ni se borra una fila después de insertarla — cada guardado
// agrega un movimiento nuevo, no reescribe los anteriores (spec §19,
// "Historial"). `resumen` guarda el diff estructurado como JSON (columna
// text con mode 'json', mismo patrón que tipos.aplicaA arriba); la forma
// exacta del diff la define la capa de dominio del batch 2 (movement
// diffing), acá sólo se reserva la columna.
export const infraMovimiento = sqliteTable(
  'infra_movimiento',
  {
    id: text('id').primaryKey(),
    parteId: text('parte_id')
      .notNull()
      .references(() => infraParte.id, { onDelete: 'cascade' }),
    // 'reporte_inicial' | 'actualizacion' | 'cambio_servicio' |
    // 'cambio_establecimiento' | 'resolucion' (esta última reservada para el
    // futuro flujo de supervisor, nunca producida en esta etapa)
    tipo: text('tipo').notNull(),
    rol: text('rol').notNull(), // 'director' | 'supervisor'
    resumen: text('resumen', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
    rigeDesde: text('rige_desde').notNull(),
    creadaEn: text('creada_en').notNull(),
  },
  (t) => [index('infra_movimiento_parte_id_idx').on(t.parteId)],
)
