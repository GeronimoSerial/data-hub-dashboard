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
