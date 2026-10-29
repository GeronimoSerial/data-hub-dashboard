import { sql } from 'drizzle-orm'
import { pgTable, text, integer, bigint, bigserial, serial, boolean, doublePrecision, jsonb, real, primaryKey, index, uniqueIndex, timestamp, check, foreignKey } from 'drizzle-orm/pg-core'

export const infraDatasetEntrega = pgTable('infra_dataset_entrega', {
  versionId: text('version_id').notNull().references(() => infraDatasetVersion.id),
  destino: text('destino').notNull(),
  intentos: integer('intentos').notNull().default(0),
  proximoIntento: timestamp('proximo_intento', { withTimezone: true }).notNull().defaultNow(),
  entregadaEn: timestamp('entregada_en', { withTimezone: true }),
  ultimoError: text('ultimo_error'),
  creadaEn: timestamp('creada_en', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.versionId, t.destino] }), index('infra_dataset_entrega_pendiente_idx').on(t.destino, t.proximoIntento)])

export const niveles = pgTable('niveles', {
  id: text('id').primaryKey(),
  nombre: text('nombre').notNull(),
  orden: integer('orden').notNull(),
})

export const tipos = pgTable('tipos', {
  id: text('id').primaryKey(),
  nombre: text('nombre').notNull(),
  aplicaA: jsonb('aplica_a').$type<string[]>().notNull(),
})

export const categorias = pgTable('categorias', {
  id: text('id').primaryKey(),
  nombre: text('nombre').notNull(),
  color: text('color').notNull(),
})

export const tags = pgTable('tags', {
  id: text('id').primaryKey(),
  nombre: text('nombre').notNull(),
})

export const recursos = pgTable('recursos', {
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
  cargadoEn: timestamp('cargado_en', { withTimezone: true, mode: 'string' }),
  size: integer('size'),
})

export const recursoTags = pgTable(
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

export const recursoAudienciaNiveles = pgTable(
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

// Catálogo de niveles jurisdiccionales de GE (ge.ge_nivel_jurisdiccional). El id
// es el mismo que usa GE (1 Secundario, 2 Privada, 4 Superior, ...), por eso no
// es autoincremental. Reemplaza progresivamente a `niveles` (ver T3/T4).
export const nivelesJurisdiccionales = pgTable('niveles_jurisdiccionales', {
  id: integer('id').primaryKey(),
  nombre: text('nombre').notNull(),
})

// Niveles jurisdiccionales de un usuario. Mismo patrón que userNiveles (sin
// fila = sin restricción por este eje; ver lib/acl.ts).
export const userNivelesJur = pgTable(
  'user_niveles_jur',
  {
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    nivelJurisdiccionalId: integer('nivel_jurisdiccional_id')
      .notNull()
      .references(() => nivelesJurisdiccionales.id),
  },
  (t) => [primaryKey({ columns: [t.userId, t.nivelJurisdiccionalId] })],
)

// Audiencia de un recurso expresada en niveles jurisdiccionales. Mismo patrón
// que recursoAudienciaNiveles.
export const recursoAudienciaNivelesJur = pgTable(
  'recurso_audiencia_niveles_jur',
  {
    recursoId: text('recurso_id')
      .notNull()
      .references(() => recursos.id, { onDelete: 'cascade' }),
    nivelJurisdiccionalId: integer('nivel_jurisdiccional_id')
      .notNull()
      .references(() => nivelesJurisdiccionales.id),
  },
  (t) => [primaryKey({ columns: [t.recursoId, t.nivelJurisdiccionalId] })],
)

export const recursoAudienciaUsuarios = pgTable(
  'recurso_audiencia_usuarios',
  {
    recursoId: text('recurso_id')
      .notNull()
      .references(() => recursos.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull(),
  },
  (t) => [primaryKey({ columns: [t.recursoId, t.userId] })],
)

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified')
    .default(false)
    .notNull(),
  image: text('image'),
  createdAt: timestamp('created_at', { mode: 'date' })
    .default(sql`now()`)
    .notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' })
    .default(sql`now()`)
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
  role: text('role'),
  banned: boolean('banned').default(false),
  banReason: text('ban_reason'),
  banExpires: timestamp('ban_expires', { mode: 'date' }),
  // 'todos' | 'seleccionados': si es 'seleccionados', el acceso de un usuario
  // consulta se restringe a los recursos listados en user_recursos (además
  // de la audiencia propia del recurso, ver lib/acl.ts puedeAbrir).
  accesoRecursos: text('acceso_recursos').notNull().default('todos'),
  // CUE-anexo del establecimiento asignado al operador_establecimiento (T6).
  geCueAnexo: text('ge_cue_anexo'),
  // NULL keeps legacy/unconfigured behavior; [] is an explicit deny-all policy.
  hubSecciones: jsonb('hub_secciones').$type<string[] | null>(),
  hubLanding: boolean('hub_landing'),
  hubDestino: text('hub_destino'),
})

export const session = pgTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: timestamp('expires_at', { mode: 'date' }).notNull(),
    token: text('token').notNull().unique(),
    createdAt: timestamp('created_at', { mode: 'date' })
      .default(sql`now()`)
      .notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date' })
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

export const account = pgTable(
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
    accessTokenExpiresAt: timestamp('access_token_expires_at', { mode: 'date' }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { mode: 'date' }),
    scope: text('scope'),
    password: text('password'),
    createdAt: timestamp('created_at', { mode: 'date' })
      .default(sql`now()`)
      .notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date' })
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex('account_issuer_accountId_uidx').on(table.issuer, table.accountId),
    index('account_userId_idx').on(table.userId),
  ],
)

export const verification = pgTable(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at', { mode: 'date' }).notNull(),
    createdAt: timestamp('created_at', { mode: 'date' })
      .default(sql`now()`)
      .notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date' })
      .default(sql`now()`)
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index('verification_identifier_idx').on(table.identifier)],
)

// Linktree público (/links): una sola fila (id = 1) con todo el documento de
// configuración. Se valida con zod al leer y al escribir (lib/linktree/config.ts).
export const linktreeConfig = pgTable('linktree_config', {
  id: integer('id').primaryKey(),
  config: jsonb('config').$type<Record<string, unknown>>().notNull(),
  actualizadoEn: timestamp('actualizado_en', { withTimezone: true })
    .default(sql`now()`)
    .notNull(),
  actualizadoPor: text('actualizado_por'),
}, (t) => [check('linktree_config_unica', sql`${t.id} = 1`)])

// Auditoría del SSO desde Gestión Educativa (GE, T6): cada login aceptado o
// rechazado y cada consumo de ticket. Nunca guarda la api_key.
export const geSsoEvento = pgTable('ge_sso_evento', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  at: timestamp('at', { withTimezone: true })
    .default(sql`now()`)
    .notNull(),
  email: text('email'),
  rol: text('rol'),
  cue: text('cue'),
  nivelJurisdiccionalId: integer('nivel_jurisdiccional_id'),
  ip: text('ip'),
  resultado: text('resultado').notNull(),
})

export const userNiveles = pgTable(
  'user_niveles',
  {
    userId: text('user_id').notNull(),
    nivelId: text('nivel_id')
      .notNull()
      .references(() => niveles.id),
  },
  (t) => [primaryKey({ columns: [t.userId, t.nivelId] })],
)

// Recursos individuales habilitados para un usuario cuando
// user.accesoRecursos = 'seleccionados'. Mismo patrón que userNiveles: sin
// esta fila el recurso queda fuera del alcance del usuario (independiente de
// la audiencia propia del recurso, ver lib/acl.ts puedeAbrir).
export const userRecursos = pgTable(
  'user_recursos',
  {
    userId: text('user_id').notNull(),
    recursoId: text('recurso_id')
      .notNull()
      .references(() => recursos.id),
  },
  (t) => [primaryKey({ columns: [t.userId, t.recursoId] })],
)

// Motivos de problemática: dato con ABM (ver app/api/infraestructura/motivos),
// no un enum en código. `categoria` referencia el catálogo fijo de
// lib/infraestructura/categorias.ts (no hay FK porque ese catálogo no es una
// tabla). `id` es un slug estable usado sólo en el ABM y en el formulario; lo
// que persiste infra_afectacion.motivo es el nombre, no este id.
export const infraMotivo = pgTable('infra_motivo', {
  id: text('id').primaryKey(),
  nombre: text('nombre').notNull(),
  categoria: text('categoria').notNull(),
  orden: integer('orden').notNull().default(0),
  // Gravedad que el wizard marca como "Sugerido" (spec rediseño §4.1).
  // Null = sin sugerido. Nunca restringe: el director elige libremente.
  severidadSugerida: text('severidad_sugerida'),
})

// Otorga a un usuario la capacidad de ver nombres de alumnos. `vence_en` es
// obligatorio: no existen grants permanentes. `otorgado_por` deja registrado
// quién lo concedió, incluso cuando un admin se lo otorga a sí mismo.
export const infraPermisoNominal = pgTable('infra_permiso_nominal', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  otorgadoPor: text('otorgado_por').notNull(),
  otorgadoEn: text('otorgado_en').notNull(),
  venceEn: text('vence_en').notNull(),
  revocadoEn: text('revocado_en'),
})

// Auditoría de cada consulta al alcance nominal: quién, qué afectación y
// cuántos alumnos vio. Se escribe en la misma transacción que sirve la
// respuesta del endpoint (ver app/api/mapas/infraestructura/nominal/route.ts;
// la ruta vieja sobre el modelo deprecado, app/api/infraestructura/nominal,
// se retiró en F3.3 frontend).
// `afectacionId` (F3.3) reemplaza a la columna `problematica_id` original:
// apuntaba al modelo deprecado, eliminado en la Fase 4.
// Sigue siendo texto plano SIN foreign key (nunca la tuvo), así que el rename
// no arrastra constraints ni índices.
export const infraAccesoNominalLog = pgTable('infra_acceso_nominal_log', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  afectacionId: text('afectacion_id').notNull(),
  cantidad: integer('cantidad').notNull(),
  consultadoEn: text('consultado_en').notNull(),
})

// --- Trayectoria de situaciones hidrometeorológicas ---
// Ver docs/especificacion-funcional-trayectoria-evento-hidrometeorologico.md
// y el CONTRACT.md del batch de esquema. Este es el modelo vigente: período /
// parte / afectación. Nació como migración aditiva por encima del modelo
// deprecado, que se eliminó por completo en la Fase 4 de
// odd/tasks/mapa-parte-operativo.md (ver DROP en lib/db/seed.ts).
//
// Todas las columnas de vigencia siguen la distinción de la spec §12: `rigeDesde`
// (cuándo empieza a regir el cambio, puede ser pasado o futuro) es siempre
// distinta de `creadaEn` (cuándo se cargó en el sistema, reloj del servidor).
// Ninguna se deriva de la otra. Se guardan como texto ISO 8601, nunca como
// entero epoch (ese modo sólo lo usan las tablas de better-auth).

// Período provincial (p. ej. protocolo ENOS 2026/2027). Sólo un período puede
// estar `vigente` a la vez: índice único parcial (`WHERE estado = 'vigente'`),
// no sobre la columna entera, para que puedan coexistir muchos períodos
// `historico`. La creación real de este índice vive en el DDL crudo de
// HUB_DDL (lib/db/seed.ts) porque este proyecto no corre drizzle-kit
// generate/push (ver seedHub) — la declaración acá mantiene el esquema
// tipado en sincro con esa DDL, no es lo que la crea en runtime.
export const infraPeriodo = pgTable(
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
export const infraParte = pgTable(
  'infra_parte',
  {
    id: text('id').primaryKey(),
    periodoId: text('periodo_id')
      .notNull()
      .references(() => infraPeriodo.id),
    cueAnexo: text('cue_anexo').notNull(),
    // 'habitual' | 'parcial' | 'evacuado' | 'centro_evacuados' | 'sin_clases' (spec §11). Independiente
    // del servicio educativo: ver infraServicioAlcance.
    estadoEstablecimiento: text('estado_establecimiento').notNull().default('habitual'),
    asistenciaPedagogica: text('asistencia_pedagogica'),
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
export const infraAfectacion = pgTable(
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
    // Justificación obligatoria al elegir Crítica cuando el motivo no la
    // sugería (spec rediseño §4.3). `detalle` sólo con justificación 'otro'.
    justificacionCritica: text('justificacion_critica'),
    justificacionCriticaDetalle: text('justificacion_critica_detalle'),
    // legacy: superseded by infra_afectacion_carrera; kept for backfill
    carreras: jsonb('carreras').$type<string[]>(),
    // Situación que provocó ésta (spec rediseño §4.4). Sin FK declarada: las
    // afectaciones nunca se borran y la causa puede vivir en otro parte
    // (otro período) de la misma escuela.
    causadaPorId: text('causada_por_id'),
    // Por qué dejó de regir: 'solucionada' | 'retirada'. Null mientras rige.
    cierre: text('cierre'),
  },
  (t) => [
    index('infra_afectacion_parte_id_idx').on(t.parteId),
    index('infra_afectacion_creada_en_idx_e7b').on(t.creadaEn),
    index('infra_afectacion_rige_desde_idx_e7b').on(t.rigeDesde),
    index('infra_afectacion_causada_por_id_idx').on(t.causadaPorId),
  ],
)

// Selección de secciones de una afectación: clave compuesta
// (afectacionId, geSectionId) y cascade desde infra_afectacion.
export const infraAfectacionSeccion = pgTable(
  'infra_afectacion_seccion',
  {
    afectacionId: text('afectacion_id')
      .notNull()
      .references(() => infraAfectacion.id, { onDelete: 'cascade' }),
    geSectionId: bigint('ge_section_id', { mode: 'number' }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.afectacionId, t.geSectionId] })],
)

// Alumnos seleccionados individualmente dentro de una sección (selección
// parcial). Una sección presente en infraAfectacionSeccion sin ninguna fila
// acá se interpreta como "sección completa"; la ausencia de filas es la
// semántica, no un estado transitorio.
export const infraAfectacionAlumno = pgTable(
  'infra_afectacion_alumno',
  {
    afectacionId: text('afectacion_id')
      .notNull()
      .references(() => infraAfectacion.id, { onDelete: 'cascade' }),
    gePersonId: bigint('ge_person_id', { mode: 'number' }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.afectacionId, t.gePersonId] })],
)

// Alcance de una afectación de instituto superior (matrícula, no padrón GE).
// Modelo propio (S4): una carrera sin alumnos seleccionados equivale a la
// carrera completa, igual que una sección sin filas en infraAfectacionAlumno.
// matriculaCorteId fija el corte con el que se eligió la carrera.
export const infraAfectacionCarrera = pgTable(
  'infra_afectacion_carrera',
  {
    afectacionId: text('afectacion_id')
      .notNull()
      .references(() => infraAfectacion.id, { onDelete: 'cascade' }),
    matriculaCorteId: integer('matricula_corte_id').notNull(),
    carreraId: integer('carrera_id').notNull(),
  },
  (t) => [primaryKey({ columns: [t.afectacionId, t.carreraId] })],
)

// Alumnos seleccionados dentro de una carrera de matrícula. alumnoId es el
// id de matricula_alumno (sin FK: el corte puede reemplazarse, el historial
// debe seguir resolviendo nombres por id).
export const infraAfectacionMatriculaAlumno = pgTable(
  'infra_afectacion_matricula_alumno',
  {
    afectacionId: text('afectacion_id')
      .notNull()
      .references(() => infraAfectacion.id, { onDelete: 'cascade' }),
    matriculaCorteId: integer('matricula_corte_id').notNull(),
    alumnoId: bigint('alumno_id', { mode: 'number' }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.afectacionId, t.alumnoId] })],
)

// Alcance de la suspensión del servicio educativo (spec §10). `tipo` indica
// qué clase de referencia es `referenciaId`: null para 'establecimiento',
// identificador de turno o `geSectionId` (como texto) para 'turno'/'seccion'.
// El estado general mostrado al director ('normal' | 'parcial' | 'suspendido')
// se calcula a partir de las filas vigentes de esta tabla — nunca se
// persiste, ver CONTRACT.md. Soft delete vía `retiradaEn`, mismo criterio que
// infraAfectacion.
export const infraServicioAlcance = pgTable(
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
export const infraMovimiento = pgTable(
  'infra_movimiento',
  {
    id: text('id').primaryKey(),
    parteId: text('parte_id')
      .notNull()
      .references(() => infraParte.id, { onDelete: 'cascade' }),
    // 'reporte_inicial' | 'actualizacion' | 'cambio_servicio' |
    // 'cambio_establecimiento' | 'confirmacion' | 'resolucion' (esta última reservada para el
    // futuro flujo de supervisor, nunca producida en esta etapa)
    tipo: text('tipo').notNull(),
    rol: text('rol').notNull(), // 'director' | 'supervisor'
    resumen: jsonb('resumen').$type<Record<string, unknown>>().notNull(),
    rigeDesde: text('rige_desde').notNull(),
    creadaEn: text('creada_en').notNull(),
    // Clave de idempotencia del POST que generó este movimiento (batch 3:
    // app/api/problematicas/parte/route.ts). Nullable y agregada por ALTER
    // (ver ensureMovimientoIdempotencyKeyColumn en lib/db/seed.ts) por el
    // mismo motivo que cualquier columna agregada con ALTER a una base
    // poblada: SQLite no permite agregar una columna NOT NULL a una tabla
    // con filas. El índice único es
    // parcial de hecho (no declarado como tal): SQLite trata cada NULL como
    // distinto en un índice único, así que las filas legacy sin clave nunca
    // colisionan entre sí.
    idempotencyKey: text('idempotency_key'),
  },
  (t) => [
    index('infra_movimiento_parte_id_idx').on(t.parteId),
    uniqueIndex('infra_movimiento_idempotency_key_uidx').on(t.idempotencyKey),
  ],
)

// Server-synced draft snapshot. The revision is owned by the server and only
// advances when a consolidated sync is accepted. Context is metadata only;
// photo bytes are never stored in JSON.
export const infraBorrador = pgTable(
  'infra_borrador',
  {
    id: text('id').primaryKey(),
    generacion: integer('generacion').notNull(),
    cueAnexo: text('cue_anexo').notNull(),
    contexto: jsonb('contexto').$type<Record<string, unknown>>().notNull(),
    paso: text('paso').notNull(),
    respuestas: jsonb('respuestas').$type<Record<string, unknown>>().notNull(),
    revision: integer('revision').notNull().default(0),
    estado: text('estado').notNull().default('open'),
    movimientoId: text('movimiento_id').references(() => infraMovimiento.id),
    creadoEn: text('creado_en').notNull(),
    actividadEn: text('actividad_en').notNull(),
    sincronizadoEn: text('sincronizado_en'),
  },
  (t) => [
    check('infra_borrador_generacion_check', sql`${t.generacion} > 0`),
    check('infra_borrador_revision_check', sql`${t.revision} >= 0`),
    check('infra_borrador_estado_check', sql`${t.estado} IN ('open', 'submitted', 'discarded')`),
    index('infra_borrador_cue_estado_idx').on(t.cueAnexo, t.estado),
    index('infra_borrador_cue_estado_actividad_id_idx').on(
      t.cueAnexo,
      t.estado,
      t.actividadEn,
      t.id,
    ),
  ],
)

// Permanent closure marker. Sync handlers check this key before accepting a
// write; the migration trigger also blocks late INSERT/UPDATE requests.
export const infraBorradorCierre = pgTable(
  'infra_borrador_cierre',
  {
    draftId: text('draft_id').primaryKey(),
    cueAnexo: text('cue_anexo').notNull(),
    estadoCierre: text('estado_cierre').notNull(),
    revisionCierre: integer('revision_cierre').notNull(),
    movimientoId: text('movimiento_id').references(() => infraMovimiento.id),
    cerradoEn: text('cerrado_en').notNull(),
  },
  (t) => [
    check(
      'infra_borrador_cierre_estado_check',
      sql`${t.estadoCierre} IN ('submitted', 'discarded')`,
    ),
    check('infra_borrador_cierre_revision_check', sql`${t.revisionCierre} >= 0`),
  ],
)

// Photo evidence linked to a movement. Object bytes stay in OBS; this row
// stores only the two server-controlled object keys and their verification
// metadata. One row represents one photo and its optimized/thumbnail variants.
export const infraAdjunto = pgTable(
  'infra_adjunto',
  {
    id: text('id').primaryKey(),
    movimientoId: text('movimiento_id')
      .notNull()
      .references(() => infraMovimiento.id, { onDelete: 'cascade' }),
    optimizadaObsKey: text('optimizada_obs_key').notNull(),
    optimizadaSize: integer('optimizada_size').notNull(),
    optimizadaContentType: text('optimizada_content_type').notNull(),
    optimizadaEtag: text('optimizada_etag'),
    miniaturaObsKey: text('miniatura_obs_key').notNull(),
    miniaturaSize: integer('miniatura_size').notNull(),
    miniaturaContentType: text('miniatura_content_type').notNull(),
    miniaturaEtag: text('miniatura_etag'),
    estado: text('estado').notNull().default('pending'),
    creadaPor: text('creada_por').notNull(),
  },
  (t) => [
    check('infra_adjunto_optimizada_size_check', sql`${t.optimizadaSize} > 0`),
    check('infra_adjunto_miniatura_size_check', sql`${t.miniaturaSize} > 0`),
    check('infra_adjunto_estado_check', sql`${t.estado} IN ('pending', 'confirmed')`),
    index('infra_adjunto_movimiento_id_idx').on(t.movimientoId),
  ],
)

// Pedido de verificación a un establecimiento (batch E1): confirma si sigue
// habiendo afectación. `estado` es el estado persistido ('pendiente' |
// 'respondida' | 'cancelada'); 'vencida' NO se persiste nunca: se deriva en
// runtime comparando `vencimientoEn` con el reloj, porque `vencimientoEn` es
// sólo un SLA informativo que no bloquea responder. `tokenExpiraEn` es
// distinto y sí bloquea (HTTP 410): es el vencimiento de seguridad de la
// credencial de acceso, independiente del SLA. `discrepancia` (boolean en
// integer, default 0) marca el caso en que se respondió 'sin_afectacion'
// mientras existía una afectación vigente. `movimientoId` enlaza la respuesta
// con afectación al movimiento real que se creó. `tokenHash` guarda el sha256
// hex de la credencial, nunca el token en claro.
//
// El monitoreo es continuo, no episódico (decisión post-E1: se descartó el
// concepto de "episodio" administrado a mano — nadie iba a abrirlos/cerrarlos
// manualmente). Por eso la verificación se ancla directamente al período
// provincial vigente (`periodoId`), resuelto en el momento de creación por
// `obtenerPeriodoVigente` (parte-consulta.ts), en vez de a un episodio
// intermedio.
export const infraVerificacion = pgTable(
  'infra_verificacion',
  {
    id: text('id').primaryKey(),
    periodoId: text('periodo_id')
      .notNull()
      .references(() => infraPeriodo.id),
    cueAnexo: text('cue_anexo').notNull(),
    estado: text('estado').notNull(), // 'pendiente' | 'respondida' | 'cancelada'
    solicitadaEn: text('solicitada_en').notNull(),
    solicitadaPorUserId: text('solicitada_por_user_id').notNull(),
    // SLA informativo: no bloquea responder.
    vencimientoEn: text('vencimiento_en'),
    resultado: text('resultado'), // 'sin_afectacion' | 'con_afectacion' | 'no_disponible'
    // Boolean: 1 cuando se respondió 'sin_afectacion' mientras había una
    // afectación vigente.
    discrepancia: boolean('discrepancia').notNull().default(false),
    respondidaEn: text('respondida_en'),
    respondidaCanal: text('respondida_canal'), // 'enlace' | 'telefono' | 'whatsapp' | 'presencial' | 'otro'
    respondidaPorUserId: text('respondida_por_user_id'),
    movimientoId: text('movimiento_id').references(() => infraMovimiento.id),
    canceladaEn: text('cancelada_en'),
    canceladaPorUserId: text('cancelada_por_user_id'),
    motivoCancelacion: text('motivo_cancelacion'),
    // sha256 hex de la credencial de acceso; nunca el token en claro.
    tokenHash: text('token_hash').notNull(),
    // Vencimiento de seguridad de la credencial: sí bloquea (410). Distinto de
    // vencimientoEn, que es el SLA informativo y no bloquea.
    tokenExpiraEn: text('token_expira_en').notNull(),
    tokenRevocadoEn: text('token_revocado_en'),
    tokenConsumidoEn: text('token_consumido_en'),
    creadaEn: text('creada_en').notNull(),
    actualizadaEn: text('actualizada_en').notNull(),
  },
  (t) => [
    index('infra_verificacion_periodo_id_idx').on(t.periodoId),
    index('infra_verificacion_cue_anexo_idx').on(t.cueAnexo),
    index('infra_verificacion_estado_idx').on(t.estado),
    uniqueIndex('infra_verificacion_token_hash_uidx').on(t.tokenHash),
  ],
)

// Auditoría append-only de la trayectoria de una verificación (batch E1).
// Nunca se actualiza ni se borra una fila después de insertarla: cada evento
// agrega una fila nueva, mismo criterio que infraMovimiento. `actorTipo`
// distingue quién disparó el evento ('usuario' | 'enlace' | 'sistema');
// `actorUserId` sólo aplica cuando el actor es un usuario.
export const infraVerificacionEvento = pgTable(
  'infra_verificacion_evento',
  {
    id: text('id').primaryKey(),
    verificacionId: text('verificacion_id')
      .notNull()
      .references(() => infraVerificacion.id, { onDelete: 'cascade' }),
    tipo: text('tipo').notNull(), // 'creada' | 'cancelada' | 'respondida' | 'discrepancia_detectada' | 'vinculo_fallido'
    actorTipo: text('actor_tipo').notNull(), // 'usuario' | 'enlace' | 'sistema'
    actorUserId: text('actor_user_id'),
    canal: text('canal'),
    motivo: text('motivo'),
    correlacionId: text('correlacion_id'),
    creadaEn: text('creada_en').notNull(),
  },
  (t) => [
    index('infra_verificacion_evento_verificacion_id_idx').on(t.verificacionId),
  ],
)

// Control de ejecución de jobs de infraestructura, con lease renovable. Un
// job_run por combinación (tipo, claveIdempotente): los reintentos de la MISMA
// invocación actualizan la fila existente (upsert), nunca crean una segunda
// fila — así dos invocaciones del mismo job no publican dos resultados.
// `estado` es texto plano ('pendiente' | 'en_progreso' | 'completado' |
// 'fallido', mismos valores que estadoJobSchema en
// lib/infraestructura/riesgo/tipos.ts); la validación de forma vive en la
// capa de dominio. Timestamps en texto ISO UTC (patrón de infraParte).
export const infraJobRun = pgTable(
  'infra_job_run',
  {
    id: text('id').primaryKey(),
    tipo: text('tipo').notNull(),
    claveIdempotente: text('clave_idempotente').notNull(),
    intento: integer('intento').notNull().default(1),
    // ISO UTC; se setea al crear la fila o al recuperar un lease vencido (no es null en ningún estado).
    iniciadoEn: text('iniciado_en').notNull(),
    finalizadoEn: text('finalizado_en'),
    estado: text('estado').notNull(),
    // p. ej. { procesados: 10, exitosos: 8, fallidos: 2 }.
    contadores: jsonb('contadores').$type<Record<string, number>>(),
    // Mensaje de error sin datos nominales ni secretos, para diagnóstico.
    errorSaneado: text('error_saneado'),
    version: text('version').notNull(),
    // Identificador del proceso/worker que sostiene el lease.
    leaseOwner: text('lease_owner'),
    // ISO UTC; null cuando no hay lease activo.
    leaseExpiraEn: text('lease_expira_en'),
    creadaEn: text('creada_en').notNull(),
    actualizadaEn: text('actualizada_en').notNull(),
  },
  (t) => [
    uniqueIndex('infra_job_run_clave_uidx').on(t.tipo, t.claveIdempotente),
    index('infra_job_run_estado_idx').on(t.estado),
  ],
)

// --- Amenazas hidrometeorológicas: perfiles geográficos, pronóstico,
// climatología y salud de fuentes ---
// `geometryRef` es la celda de grilla de 0.1° (formato "lat_lon") para las
// variables atmosféricas, o el id del punto de río para caudal. Todas estas
// tablas arrancan vacías: las llena un job de ingesta, no la siembra.

// Perfil geográfico por establecimiento (cueAnexo): resuelve una sola vez la
// coordenada y su calidad para no recalcular el join geográfico en cada sync
// de amenazas. `motivoExclusion` explica por qué no hay perfil válido (null =
// sí lo hay); `perfilVersion` permite reprocesar cuando cambia la regla de
// cálculo sin confundir una corrida vieja con una nueva.
export const infraGeoProfile = pgTable(
  'infra_geo_profile',
  {
    cueAnexo: text('cue_anexo').primaryKey(),
    lat: real('lat'),
    lon: real('lon'),
    geoCalidad: text('geo_calidad'),
    departamento: text('departamento'),
    geometryRef: text('geometry_ref'),
    // null = tiene perfil válido; 'sin_coordenadas' | 'coordenada_invalida' si no.
    motivoExclusion: text('motivo_exclusion'),
    perfilVersion: text('perfil_version').notNull(),
    calculadoEn: text('calculado_en').notNull(),
  },
  (t) => [index('infra_geo_profile_departamento_idx').on(t.departamento)],
)

// Pronóstico crudo por (provider, variable, celda) y corrida. El índice único
// sobre (provider, variable, geometryRef, corridaEn, validoEn) hace que
// repetir el sync del mismo run no duplique filas. `horizonteHoras` es la
// distancia entre `corridaEn` y `validoEn`; `pasoHoras` guarda el paso real
// del modelo en ese horizonte (1, 3 o 6), nunca un valor interpolado.
export const hazardForecast = pgTable(
  'hazard_forecast',
  {
    id: text('id').primaryKey(),
    provider: text('provider').notNull(),
    variable: text('variable').notNull(),
    geometryRef: text('geometry_ref').notNull(),
    corridaEn: text('corrida_en').notNull(),
    validoEn: text('valido_en').notNull(),
    horizonteHoras: integer('horizonte_horas').notNull(),
    valor: real('valor').notNull(),
    unidad: text('unidad').notNull(),
    pasoHoras: integer('paso_horas').notNull(),
    // Ruta del payload crudo bajo DATA_DIR; null si no se conservó.
    rawRef: text('raw_ref'),
    ingeridoEn: text('ingerido_en').notNull(),
  },
  (t) => [
    uniqueIndex('hazard_forecast_uidx').on(
      t.provider,
      t.variable,
      t.geometryRef,
      t.corridaEn,
      t.validoEn,
    ),
    index('hazard_forecast_geometry_ref_idx').on(t.geometryRef),
    index('hazard_forecast_precipitacion_run_idx')
      .on(t.geometryRef, t.corridaEn)
      .where(sql`${t.variable} = 'precipitacion'`),
  ],
)

// Climatología por celda: valores de referencia (p90/p95/p99) sobre una
// ventana histórica fija. `muestra` distingue todos los días de sólo los
// húmedos (>=1mm); la clave única incluye `version` para poder recalcular con
// una nueva regla sin pisar la versión anterior.
export const hazardClimatology = pgTable(
  'hazard_climatology',
  {
    id: text('id').primaryKey(),
    geometryRef: text('geometry_ref').notNull(),
    variable: text('variable').notNull(),
    percentil: text('percentil').notNull(),
    // 'todos_los_dias' | 'dias_humedos' (este último filtra días con >=1mm).
    muestra: text('muestra').notNull(),
    valor: real('valor').notNull(),
    unidad: text('unidad').notNull(),
    periodoDesde: text('periodo_desde').notNull(),
    periodoHasta: text('periodo_hasta').notNull(),
    version: text('version').notNull(),
    calculadoEn: text('calculado_en').notNull(),
    // Cobertura real de la climatología progresiva de precipitación (null en
    // filas previas y en caudal): años completos y días con dato usados.
    aniosCobertura: integer('anios_cobertura'),
    diasCobertura: integer('dias_cobertura'),
  },
  (t) => [
    uniqueIndex('hazard_climatology_uidx').on(
      t.geometryRef,
      t.variable,
      t.percentil,
      t.muestra,
      t.periodoDesde,
      t.periodoHasta,
      t.version,
    ),
    index('hazard_climatology_geometry_ref_idx').on(t.geometryRef),
  ],
)

// Serie diaria de precipitación ERA5 descargada para la climatología
// progresiva: una fila por celda ERA5 nativa (~0.25°) y año calendario. El
// año es la unidad de descarga, así que re-bajar el mismo año hace upsert
// sobre la misma fila. `valores[i]` es el día i del año (0 = 1 de enero);
// null = ERA5 no devolvió dato ese día (nunca se imputa 0 mm).
export const hazardPrecipitacionSerie = pgTable(
  'hazard_precipitacion_serie',
  {
    celdaEra5: text('celda_era5').notNull(),
    anio: integer('anio').notNull(),
    lat: real('lat').notNull(),
    lon: real('lon').notNull(),
    valores: jsonb('valores').$type<Array<number | null>>().notNull(),
    diasConDato: integer('dias_con_dato').notNull(),
    descargadoEn: text('descargado_en').notNull(),
  },
  (t) => [primaryKey({ columns: [t.celdaEra5, t.anio] })],
)

// Salud por proveedor de amenazas: cuándo tuvo éxito y cuándo se intentó por
// última vez, el estado actual y el TTL de frescura esperado. `ultimoErrorSaneado`
// guarda el error sin datos nominales ni secretos; `licencia` deja registrada
// la atribución obligatoria de cada fuente.
export const hazardSourceHealth = pgTable('hazard_source_health', {
  provider: text('provider').primaryKey(),
  ultimoExitoEn: text('ultimo_exito_en'),
  ultimoIntentoEn: text('ultimo_intento_en'),
  estado: text('estado').notNull(),
  ultimoErrorSaneado: text('ultimo_error_saneado'),
  ttlMinutos: integer('ttl_minutos').notNull(),
  licencia: text('licencia').notNull(),
  actualizadaEn: text('actualizada_en').notNull(),
})

// E3b: motor de riesgo v0 (infra_risk_run, infra_risk_snapshot, infra_risk_factor)

// Corrida del motor de riesgo: el "puntero" que se publica atómicamente. No
// confundir con infraJobRun, que es el lease genérico de ejecución de jobs de
// E0 — esta es la entidad de dominio. `infra_risk_run_vigente_unico` garantiza
// a nivel DB que exista a lo sumo UN run `vigente`, así publicar uno nuevo y
// marcar vencido el anterior es atómico sin depender de la disciplina de la
// app (mismo patrón de índice único parcial que infraPeriodo).
export const infraRiskRun = pgTable(
  'infra_risk_run',
  {
    id: text('id').primaryKey(),
    periodoId: text('periodo_id')
      .notNull()
      .references(() => infraPeriodo.id),
    modeloVersion: text('modelo_version').notNull(),
    iniciadoEn: text('iniciado_en').notNull(),
    publicadoEn: text('publicado_en'),
    // 'preparando' | 'vigente' | 'vencido' | 'fallido' | 'completado'.
    // 'completado' es el estado final de una corrida candidata (Motor v0.4):
    // terminó y es auditable, pero nunca pasa a 'vigente'.
    estado: text('estado').notNull(),
    // p. ej. { procesadas: 2005, conEvidencia: 1800, sinEvidencia: 205 }.
    cobertura: jsonb('cobertura').$type<Record<string, number>>(),
    creadaEn: text('creada_en').notNull(),
    // 'operativo' | 'candidato' (migración 0024). Las filas previas quedan
    // 'operativo' por defecto y se leen igual que antes.
    modo: text('modo').notNull().default('operativo'),
    // Metadatos de corrida v0.4 validados con
    // lib/infraestructura/riesgo/motor-v04/contratos.ts (null en v0.3).
    metadatos: jsonb('metadatos').$type<Record<string, unknown>>(),
  },
  (t) => [
    uniqueIndex('infra_risk_run_vigente_unico')
      .on(t.estado)
      .where(sql`${t.estado} = 'vigente'`),
    index('infra_risk_run_periodo_id_idx').on(t.periodoId),
    index('infra_risk_run_publicado_en_idx_e7b').on(t.publicadoEn),
    // Aislamiento del candidato a nivel DB: aunque el código fallara, una
    // corrida candidata no puede ocupar el puntero vigente.
    check('infra_risk_run_modo_check', sql`${t.modo} IN ('operativo', 'candidato')`),
    check('infra_risk_run_candidato_no_vigente', sql`${t.modo} <> 'candidato' OR ${t.estado} <> 'vigente'`),
    check('infra_risk_run_vigente_solo_v04', sql`${t.estado} <> 'vigente' OR ${t.modeloVersion} = 'motor-v0.4'`),
  ],
)

// Shared immutable Radar danger projection. The row is also its cross-process
// lease: only the current owner may publish, and ready payloads are write-once.
export const infraRadarRunCache = pgTable(
  'infra_radar_run_cache',
  {
    cacheKey: text('cache_key').primaryKey(),
    environment: text('environment').notNull(),
    riskRunId: text('risk_run_id').notNull().references(() => infraRiskRun.id),
    modeloVersion: text('modelo_version').notNull(),
    publicadoEn: text('publicado_en').notNull(),
    reglasVersion: text('reglas_version').notNull(),
    referenciasFingerprint: text('referencias_fingerprint').notNull(),
    estado: text('estado').notNull(),
    leaseOwner: text('lease_owner'),
    leaseExpiraEn: text('lease_expira_en'),
    payload: jsonb('payload').$type<Record<string, unknown>>(),
    creadaEn: text('creada_en').notNull(),
    actualizadaEn: text('actualizada_en').notNull(),
  },
  (t) => [
    index('infra_radar_run_cache_run_idx').on(t.riskRunId),
    check('infra_radar_run_cache_estado_check', sql`${t.estado} IN ('building', 'ready', 'failed')`),
    check(
      'infra_radar_run_cache_payload_check',
      sql`(${t.estado} = 'ready' AND ${t.payload} IS NOT NULL AND ${t.leaseOwner} IS NULL AND ${t.leaseExpiraEn} IS NULL) OR (${t.estado} = 'building' AND ${t.payload} IS NULL AND ${t.leaseOwner} IS NOT NULL AND ${t.leaseExpiraEn} IS NOT NULL) OR (${t.estado} = 'failed' AND ${t.payload} IS NULL AND ${t.leaseOwner} IS NULL AND ${t.leaseExpiraEn} IS NULL)`,
    ),
  ],
)

// Un score de riesgo por (run, escuela, horizonte). `evidenciaValida` indica
// si el score se calculó con evidencia suficiente; `nivelRiesgo` y `confianza`
// son texto validado en la capa de dominio. El índice único evita duplicar el
// mismo cálculo al reintentar la corrida.
export const infraRiskSnapshot = pgTable(
  'infra_risk_snapshot',
  {
    id: text('id').primaryKey(),
    runId: text('run_id')
      .notNull()
      .references(() => infraRiskRun.id),
    cueAnexo: text('cue_anexo').notNull(),
    // 24 | 72 | 240.
    horizonteHoras: integer('horizonte_horas').notNull(),
    evidenciaValida: boolean('evidencia_valida').notNull(),
    scoreRiesgo: real('score_riesgo'),
    // 'bajo' | 'moderado' | 'alto' | 'muy_alto'.
    nivelRiesgo: text('nivel_riesgo'),
    scoreAmenaza: real('score_amenaza'),
    // Nivel de la amenaza sola (mismos umbrales que nivelRiesgo), visible aunque
    // la prioridad educativa quede atenuada por baja vulnerabilidad.
    // 'bajo' | 'moderado' | 'alto' | 'muy_alto' (null = sin evidencia de amenaza).
    nivelAmenaza: text('nivel_amenaza'),
    scoreVulnerabilidad: real('score_vulnerabilidad'),
    // 'baja' | 'media' | 'alta'.
    confianza: text('confianza').notNull(),
    // Dimensión aparte 'riesgo de acceso' (aislamiento OSM x peligro del
    // horizonte x accesos interrumpidos): NUNCA se mezcla en el IRO compuesto.
    scoreRiesgoAcceso: real('score_riesgo_acceso'),
    // 'bajo' | 'moderado' | 'alto' (null = riesgo de acceso desconocido).
    nivelRiesgoAcceso: text('nivel_riesgo_acceso'),
    // 'baja' | 'media' | 'alta'.
    confianzaAcceso: text('confianza_acceso'),
    exposicionMatricula: integer('exposicion_matricula'),
    exposicionSecciones: integer('exposicion_secciones'),
    calculadoEn: text('calculado_en').notNull(),
    validoHasta: text('valido_hasta').notNull(),
    // Resultado probabilístico v0.4 por CUE/anexo × horizonte, validado con
    // motor-v04/contratos.ts. No reemplaza los scores heredados (null en v0.3).
    resultadoV04: jsonb('resultado_v04').$type<Record<string, unknown>>(),
  },
  (t) => [
    uniqueIndex('infra_risk_snapshot_uidx').on(t.runId, t.cueAnexo, t.horizonteHoras),
    index('infra_risk_snapshot_cue_anexo_idx').on(t.cueAnexo),
    index('infra_risk_snapshot_run_id_idx').on(t.runId),
  ],
)

// Factores que explican un snapshot (N por snapshot): cada fila aporta una
// variable con su contribución y su peso al score. `onDelete: 'cascade'`
// limpia los factores cuando se borra el snapshot.
export const infraRiskFactor = pgTable(
  'infra_risk_factor',
  {
    id: text('id').primaryKey(),
    snapshotId: text('snapshot_id')
      .notNull()
      .references(() => infraRiskSnapshot.id, { onDelete: 'cascade' }),
    // 'amenaza' | 'vulnerabilidad' | 'acceso' | 'exposicion' | 'urgencia'.
    tipo: text('tipo').notNull(),
    fuente: text('fuente').notNull(),
    variable: text('variable').notNull(),
    valor: real('valor'),
    unidad: text('unidad'),
    contribucion: real('contribucion').notNull(),
    peso: real('peso').notNull(),
    explicacion: text('explicacion').notNull(),
    observadoEn: text('observado_en'),
  },
  (t) => [index('infra_risk_factor_snapshot_id_idx').on(t.snapshotId)],
)

// E3a: señales v2 y capa de peligro estimado (batch E3a, ver
// docs/ejecucion-enos/E3a/registro.md). Bloque propio para que N1 resuelva el
// merge con los batches hermanos E3b/G1 sin tocar las tablas de E2 arriba.

// Asociación escuela → punto de río más cercano (lib/infraestructura/riesgo/puntos-rio.ts)
// dentro de un radio máximo documentado. Tabla propia en vez de columna nueva en
// `infra_geo_profile` para no competir por ese archivo con otros batches en la
// misma ola: `infra_geo_profile` sigue siendo propiedad exclusiva de E2/E3b.
// `puntoRioId` null y `distanciaKm` null significan "fuera de radio", nunca el
// punto más lejano encontrado.
export const infraGeoRio = pgTable('infra_geo_rio', {
  cueAnexo: text('cue_anexo').primaryKey(),
  puntoRioId: text('punto_rio_id'),
  distanciaKm: real('distancia_km'),
  radioMaximoKm: real('radio_maximo_km').notNull(),
  version: text('version').notNull(),
  calculadoEn: text('calculado_en').notNull(),
})

// Probabilidad de superar la climatología (P95/P99) por celda y horizonte,
// calculada sobre los miembros de la API Ensemble de Open-Meteo (~51 miembros
// ECMWF IFS). `dispersion` es la base del nivel de confianza reportado en
// `nivel.ts`. Índice único por corrida para que repetir el sync no duplique.
export const hazardEnsembleProb = pgTable(
  'hazard_ensemble_prob',
  {
    id: text('id').primaryKey(),
    geometryRef: text('geometry_ref').notNull(),
    variable: text('variable').notNull(),
    corridaEn: text('corrida_en').notNull(),
    validoEn: text('valido_en').notNull(),
    horizonteHoras: integer('horizonte_horas').notNull(),
    miembrosTotal: integer('miembros_total').notNull(),
    miembrosValidos: integer('miembros_validos').notNull(),
    probabilidadP95: real('probabilidad_p95').notNull(),
    probabilidadP99: real('probabilidad_p99').notNull(),
    dispersion: real('dispersion').notNull(),
    version: text('version').notNull(),
    ingeridoEn: text('ingerido_en').notNull(),
  },
  (t) => [
    uniqueIndex('hazard_ensemble_prob_uidx').on(
      t.geometryRef,
      t.variable,
      t.corridaEn,
      t.validoEn,
    ),
    index('hazard_ensemble_prob_geometry_ref_idx').on(t.geometryRef),
  ],
)

// Precipitación observada estimada por satélite (NASA GPM IMERG Early Run),
// modelo canónico §9.2 del plan base — E2 omitió esta tabla a propósito por no
// existir entonces una fuente observacional; E3a la crea. `validoDesde`/
// `validoHasta` son la ventana de 30 min del producto; `calidad` guarda
// `precipitationQualityIndex` cuando el granulo lo trae.
export const hazardObservation = pgTable(
  'hazard_observation',
  {
    id: text('id').primaryKey(),
    provider: text('provider').notNull(),
    variable: text('variable').notNull(),
    geometryRef: text('geometry_ref').notNull(),
    valor: real('valor').notNull(),
    unidad: text('unidad').notNull(),
    observadoEn: text('observado_en').notNull(),
    validoDesde: text('valido_desde').notNull(),
    validoHasta: text('valido_hasta').notNull(),
    calidad: real('calidad'),
    rawRef: text('raw_ref'),
    ingeridoEn: text('ingerido_en').notNull(),
  },
  (t) => [
    uniqueIndex('hazard_observation_uidx').on(
      t.provider,
      t.variable,
      t.geometryRef,
      t.observadoEn,
    ),
    index('hazard_observation_geometry_ref_idx').on(t.geometryRef),
  ],
)

// Alturas hidrométricas publicadas por Prefectura Naval Argentina (I-3). Una fila
// por estación y instante de medida; `medida_en` es ISO UTC. La unicidad
// (estacion_id, medida_en) también cubre las consultas de serie temporal por
// estación, así que no hace falta un índice descendente aparte. Una lectura ya
// guardada nunca se sobrescribe. `motivos_inconsistencia` es jsonb (array de
// strings, como `aplica_a` en `tipos`). `hash_original` es el sha256 de la fila
// normalizada de origen.
export const hidroLectura = pgTable(
  'hidro_lectura',
  {
    id: text('id').primaryKey(),
    estacionId: text('estacion_id').notNull(),
    fuente: text('fuente').notNull().default('prefectura'),
    lecturaM: doublePrecision('lectura_m'),
    variacionM: doublePrecision('variacion_m'),
    periodoHoras: integer('periodo_horas'),
    medidaEn: text('medida_en').notNull(),
    estadoPublicado: text('estado_publicado').notNull(),
    lecturaAnteriorM: doublePrecision('lectura_anterior_m'),
    medidaAnteriorEn: text('medida_anterior_en'),
    alertaM: doublePrecision('alerta_m'),
    evacuacionM: doublePrecision('evacuacion_m'),
    inconsistente: boolean('inconsistente').notNull().default(false),
    motivosInconsistencia: jsonb('motivos_inconsistencia').$type<string[]>().notNull(),
    hashOriginal: text('hash_original').notNull(),
    catalogoVersion: text('catalogo_version').notNull(),
    capturadaEn: text('capturada_en').notNull(),
  },
  (t) => [uniqueIndex('hidro_lectura_estacion_medida_uidx').on(t.estacionId, t.medidaEn)],
)

// Precipitación SYNOP por estación (Ogimet, FM-12 grupos 6RRRt). Una fila por
// estación, fin de período (`observado_en`, ISO UTC), duración y sección
// (1 o 3). Una medición ya guardada se actualiza en lugar de duplicarse.
export const lluviaEstacion = pgTable(
  'lluvia_estacion',
  {
    id: text('id').primaryKey(),
    estacionWmo: text('estacion_wmo').notNull(),
    observadoEn: text('observado_en').notNull(),
    periodoHoras: integer('periodo_horas').notNull(),
    seccion: integer('seccion').notNull(),
    precipitacionMm: doublePrecision('precipitacion_mm').notNull(),
    traza: boolean('traza').notNull().default(false),
    fuente: text('fuente').notNull().default('ogimet-synop'),
    capturadaEn: text('capturada_en').notNull(),
  },
  (t) => [
    uniqueIndex('lluvia_estacion_uidx').on(t.estacionWmo, t.observadoEn, t.periodoHoras, t.seccion),
    index('lluvia_estacion_observado_en_idx').on(t.observadoEn),
  ],
)

// Nivel de referencia por estación de Prefectura: estadísticas de las lecturas
// de los últimos `ventana_dias` días (página histórica de PNA). El motor usa la
// mediana como el nivel "típico" al que corresponde la superficie de agua del
// DEM (anomalía = lectura actual - mediana). Una fila por estación y ventana.
export const hidroReferencia = pgTable(
  'hidro_referencia',
  {
    estacionId: text('estacion_id').notNull(),
    ventanaDias: integer('ventana_dias').notNull(),
    n: integer('n').notNull(),
    medianaM: doublePrecision('mediana_m').notNull(),
    p10M: doublePrecision('p10_m').notNull(),
    p90M: doublePrecision('p90_m').notNull(),
    desde: text('desde').notNull(),
    hasta: text('hasta').notNull(),
    fuente: text('fuente').notNull().default('prefectura-historico'),
    calculadoEn: text('calculado_en').notNull(),
  },
  (t) => [primaryKey({ columns: [t.estacionId, t.ventanaDias] })],
)

// Exposición física estática de la escuela al río según el DEM (geo-static,
// job calcular_exposicion_rio_dem): cota del suelo (p10 DEM a 50 m), cota DEM
// del agua permanente más cercana (p10 de píxeles GSW >= 90 a <= 2 km) y
// distancia horizontal a ese agua. El motor la combina con el nivel actual del
// río (anomalía de la estación) para la exposición dinámica "estimada".
export const infraExposicionRioDem = pgTable(
  'infra_exposicion_rio_dem',
  {
    cueAnexo: text('cue_anexo').notNull(),
    versionJob: text('version_job').notNull(),
    sueloM: real('suelo_m'),
    nivelRioDemM: real('nivel_rio_dem_m'),
    distanciaRioM: real('distancia_rio_m'),
    fuente: text('fuente').notNull(),
    fechaCorrida: text('fecha_corrida').notNull(),
    importadoEn: text('importado_en').notNull(),
  },
  (t) => [primaryKey({ columns: [t.cueAnexo, t.versionJob] })],
)

// Motor v0.4 (U2): altimetría escolar por fuente importada del CSV
// conservador. Una versión por archivo (sha256); las versiones anteriores se
// conservan y el rollback consiste en leer la versión previa. La cota
// conservadora es un escenario (mínimo admisible), no una cota de piso.
export const infraAltimetriaEscolar = pgTable(
  'infra_altimetria_escolar',
  {
    cueAnexo: text('cue_anexo').notNull(),
    version: text('version').notNull(),
    estado: text('estado').notNull(),
    motivo: text('motivo'),
    ignP10M: doublePrecision('ign_p10_m'),
    copernicusP10M: doublePrecision('copernicus_p10_m'),
    cotaPrincipalM: doublePrecision('cota_principal_m'),
    cotaConservadoraM: doublePrecision('cota_conservadora_m'),
    fuenteConservadora: text('fuente_conservadora'),
    fuentesValidas: integer('fuentes_validas').notNull(),
    referenciaVertical: text('referencia_vertical').notNull(),
    operador: text('operador').notNull(),
    conversion: text('conversion').notNull(),
    origenSha256: text('origen_sha256').notNull(),
    importadoEn: text('importado_en').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.cueAnexo, t.version] }),
    index('infra_altimetria_escolar_version_idx').on(t.version, t.importadoEn),
    check('infra_altimetria_escolar_estado_check', sql`${t.estado} IN ('candidata', 'pendiente')`),
  ],
)

// Motor v0.4 (U3a): lotes crudos inmutables descargados de INA A5, por sha256
// del payload. Cada fila de hidro_serie_diaria apunta al lote que la trajo.
export const hidroLoteCrudo = pgTable('hidro_lote_crudo', {
  sha256: text('sha256').primaryKey(),
  fuente: text('fuente').notNull(),
  url: text('url').notNull(),
  serieId: integer('serie_id').notNull(),
  payload: jsonb('payload').notNull(),
  descargadoEn: text('descargado_en').notNull(),
})

// Motor v0.4 (U3a): altura diaria histórica por estación (fecha local
// YYYY-MM-DD). Se conserva la primera observación de cada fecha: reejecutar
// nunca cambia valor ni fecha; un valor distinto se informa como discrepancia.
export const hidroSerieDiaria = pgTable(
  'hidro_serie_diaria',
  {
    estacionId: text('estacion_id').notNull(),
    fecha: text('fecha').notNull(),
    fuente: text('fuente').notNull(),
    valorM: doublePrecision('valor_m').notNull(),
    serieId: integer('serie_id').notNull(),
    loteSha256: text('lote_sha256').notNull().references(() => hidroLoteCrudo.sha256),
    descargadoEn: text('descargado_en').notNull(),
  },
  (t) => [primaryKey({ columns: [t.estacionId, t.fecha, t.fuente] })],
)

// Motor v0.4 (U3b): corridas de pronóstico INA A5 (calibrados 499/289). La
// emisión se identifica por (cal_id, cor_id); volver a descargarla no cambia
// forecast_date. lote_sha256 apunta al payload crudo.
export const hidroInaCorrida = pgTable(
  'hidro_ina_corrida',
  {
    calId: integer('cal_id').notNull(),
    corId: integer('cor_id').notNull(),
    forecastDate: text('forecast_date').notNull(),
    descargadoEn: text('descargado_en').notNull(),
    loteSha256: text('lote_sha256').notNull().references(() => hidroLoteCrudo.sha256),
  },
  (t) => [primaryKey({ columns: [t.calId, t.corId] }), index('hidro_ina_corrida_cal_forecast_idx').on(t.calId, t.forecastDate)],
)

// Motor v0.4 (U3b): valores de cada corrida tal como los publica INA. El
// qualifier se guarda sin interpretar (main/p10/p90, inferior/medio/superior)
// y el soporte temporal sale del catálogo series-pronostico-a5.
export const hidroInaPronostico = pgTable(
  'hidro_ina_pronostico',
  {
    calId: integer('cal_id').notNull(),
    corId: integer('cor_id').notNull(),
    seriesId: integer('series_id').notNull(),
    estacionId: text('estacion_id'),
    variable: text('variable'),
    unidad: text('unidad'),
    timestart: text('timestart').notNull(),
    timeend: text('timeend').notNull(),
    soporte: text('soporte').notNull(),
    qualifier: text('qualifier'),
    valor: doublePrecision('valor').notNull(),
  },
  (t) => [
    foreignKey({ columns: [t.calId, t.corId], foreignColumns: [hidroInaCorrida.calId, hidroInaCorrida.corId] }),
    uniqueIndex('hidro_ina_pronostico_valor_uq').on(t.corId, t.seriesId, t.timestart, t.timeend, sql`coalesce(${t.qualifier}, '')`),
    check('hidro_ina_pronostico_soporte_check', sql`${t.soporte} in ('semanal_media', 'diario', 'instantaneo', 'desconocido')`),
  ],
)

// E7a: episodios derivados (calculados automáticamente)
// Episodio por unidad territorial (hoy sólo 'departamento'; el tipo queda
// parametrizado para poder pasar a 'cuenca' en una versión futura de la
// regla sin migrar el esquema). `reglaVersion` + `parametros` (json) quedan
// grabados con cada cálculo para que un recomputo con otra versión/parámetros
// no se confunda con uno viejo. `escuelasAfectadas` es la cuenta acumulada de
// CUE-anexo distintos que fueron miembro del episodio en algún momento (no
// sólo los vigentes al momento del cálculo). No existe columna `episodio` en
// infra_movimiento: el vínculo va sólo en infra_episodio_miembro.
export const infraEpisodioDerivado = pgTable(
  'infra_episodio_derivado',
  {
    id: text('id').primaryKey(),
    reglaVersion: text('regla_version').notNull(),
    parametros: jsonb('parametros').$type<Record<string, unknown>>().notNull(),
    // 'departamento' es el único valor emitido por la regla v0.1.
    unidadTipo: text('unidad_tipo').notNull(),
    unidadId: text('unidad_id').notNull(),
    inicioEn: text('inicio_en').notNull(),
    finEn: text('fin_en'),
    // 'abierto' | 'cerrado'.
    estado: text('estado').notNull(),
    escuelasAfectadas: integer('escuelas_afectadas').notNull(),
    calculadoEn: text('calculado_en').notNull(),
  },
  (t) => [
    index('infra_episodio_derivado_unidad_idx').on(t.unidadTipo, t.unidadId),
    index('infra_episodio_derivado_regla_version_idx').on(t.reglaVersion),
    index('infra_episodio_derivado_estado_idx').on(t.estado),
  ],
)

// Una fila por (episodio, cueAnexo): si la escuela se recupera y se vuelve a
// afectar dentro del MISMO episodio (el departamento no llegó a cerrarlo), se
// reutiliza esta misma fila (recuperadoEn vuelve a null), no se duplica.
// `movimientoId` es nullable: no toda infra_afectacion tiene un
// infra_movimiento con el mismo (parteId, rigeDesde) resoluble en datos
// legacy.
export const infraEpisodioMiembro = pgTable(
  'infra_episodio_miembro',
  {
    id: text('id').primaryKey(),
    episodioDerivadoId: text('episodio_derivado_id')
      .notNull()
      .references(() => infraEpisodioDerivado.id, { onDelete: 'cascade' }),
    cueAnexo: text('cue_anexo').notNull(),
    movimientoId: text('movimiento_id').references(() => infraMovimiento.id),
    primeraAfectacionEn: text('primera_afectacion_en').notNull(),
    recuperadoEn: text('recuperado_en'),
  },
  (t) => [
    index('infra_episodio_miembro_episodio_id_idx').on(t.episodioDerivadoId),
    index('infra_episodio_miembro_cue_anexo_idx').on(t.cueAnexo),
  ],
)

// OM-cupo: guarda de cupo compartida entre TODOS los adapters de Open-Meteo
// (hosts api./ensemble-api./archive-api./flood-api., y sus variantes
// customer-* cuando hay OPEN_METEO_API_KEY). Ver
// lib/infraestructura/riesgo/providers/cupo-om.ts y
// docs/ejecucion-enos/OM-cupo/registro.md para la fórmula de peso, la fuente
// citada y las decisiones de diseño.
//
// IMPORTANTE: los techos de Open-Meteo (600/min, 5.000/hora, 10.000/día,
// 300.000/mes) son de CUENTA/IP, no por subdominio — la página de pricing no
// distingue host por host. Por eso la columna `host` de estas dos tablas en
// realidad guarda un "bucket" compartido (`'open-meteo-free'` o
// `'open-meteo-pago'`, ver `bucketCupo` en cupo-om.ts), NO el literal
// api./ensemble-api./etc.: las 4 familias de host gastan del MISMO pozo.
// Se conserva el nombre de columna `host` para no romper el resto de este
// archivo con un rename cosmético.
//
// `om_cupo_contador`: peso acumulado por (host=bucket, ventana,
// claveVentana). Una fila por ventana de tiempo vigente
// (minuto/hora/dia/mes); las ventanas vencidas quedan como historial, no se
// borran (volumen acotado: 4 filas por bucket por ventana de calendario,
// nunca crece sin límite práctico).
export const omCupoContador = pgTable(
  'om_cupo_contador',
  {
    host: text('host').notNull(),
    ventana: text('ventana').notNull(),
    claveVentana: text('clave_ventana').notNull(),
    pesoAcumulado: real('peso_acumulado').notNull(),
    actualizadaEn: text('actualizada_en').notNull(),
  },
  (t) => [primaryKey({ columns: [t.host, t.ventana, t.claveVentana] })],
)

// `om_cupo_cooldown`: un HTTP 429 con `Retry-After` pone al BUCKET entero
// (todos los hosts de ese plan) en cooldown hasta `hastaEn`; mientras dure,
// ningún adapter vuelve a golpear ninguno de los 4 hosts (ver cupo-om.ts
// `estaEnCooldown`). `hostOrigen` es sólo informativo: qué host literal
// devolvió el 429 que originó el cooldown. Una fila por bucket (upsert).
export const omCupoCooldown = pgTable('om_cupo_cooldown', {
  host: text('host').primaryKey(),
  hostOrigen: text('host_origen').notNull(),
  hastaEn: text('hasta_en').notNull(),
  motivoSaneado: text('motivo_saneado').notNull(),
  retryAfterSegundos: integer('retry_after_segundos'),
  actualizadaEn: text('actualizada_en').notNull(),
})
// Seasonal: tendencia ENOS a 30-90 días (Open-Meteo Seasonal, ECMWF SEAS5 +
// EC46, 51 miembros, ~36 km) por CENTROIDE de departamento — nunca por
// escuela (plan-implementacion §9.3 / plan-ejecucion §E5, capa opcional
// detrás del flag SEASONAL_ENABLED). Ver
// lib/infraestructura/riesgo/providers/seasonal.ts para el detalle de las
// fuentes/modelos verificados y la simplificación v0 de
// `probabilidadSobreNormal`. Tabla propia (no reutiliza `hazard_forecast` ni
// `hazard_ensemble_prob`, que son por celda de grilla, no por departamento) e
// índice único por (departamento, variable, emisionEn, horizonteDesdeDias,
// horizonteHastaDias) para que reintentar el job no duplique.
export const hazardSeasonalTrend = pgTable(
  'hazard_seasonal_trend',
  {
    id: text('id').primaryKey(),
    departamento: text('departamento').notNull(),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    variable: text('variable').notNull(),
    emisionEn: text('emision_en').notNull(),
    validoDesde: text('valido_desde').notNull(),
    validoHasta: text('valido_hasta').notNull(),
    horizonteDesdeDias: integer('horizonte_desde_dias').notNull(),
    horizonteHastaDias: integer('horizonte_hasta_dias').notNull(),
    miembrosTotal: integer('miembros_total').notNull(),
    miembrosValidos: integer('miembros_validos').notNull(),
    mediaMm: real('media_mm'),
    medianaMm: real('mediana_mm'),
    dispersionMm: real('dispersion_mm'),
    probabilidadSobreNormal: real('probabilidad_sobre_normal'),
    version: text('version').notNull(),
    ingeridoEn: text('ingerido_en').notNull(),
  },
  (t) => [
    uniqueIndex('hazard_seasonal_trend_uidx').on(
      t.departamento,
      t.variable,
      t.emisionEn,
      t.horizonteDesdeDias,
      t.horizonteHastaDias,
    ),
    index('hazard_seasonal_trend_departamento_idx').on(t.departamento),
  ],
)

// E7b: los índices temporales para replay (infra_afectacion_creada_en_idx_e7b,
// infra_afectacion_rige_desde_idx_e7b, infra_risk_run_publicado_en_idx_e7b)
// viven en el tercer argumento de cada pgTable. No se pueden declarar como
// `index(...).on(columna)` sueltos a nivel de módulo: en drizzle-orm 0.45.2 el
// PgColumn de módulo no expone `defaultConfig`, así que `.on()` lanza
// `SyntaxError: "undefined" is not valid JSON` al evaluar el módulo (lo
// destapó drizzle-kit generate; ver brief DB1/F2).

// E5: Centro de Situación (infra_situacion_corte)
//
// Cada fila es UN corte (snapshot) ejecutivo completo del territorio, generado
// por un job periódico. No hay filas por escuela ni por departamento: el corte
// congela su propia cobertura y la salud de fuentes para poder reconstruir el
// briefing exactamente como se vio en ese instante, sin depender de qué
// infra_risk_run esté vigente cuando el corte se lea después.
export const infraSituacionCorte = pgTable(
  'infra_situacion_corte',
  {
    id: text('id').primaryKey(),
    // Instante "as-of" que representa el corte (ISO).
    generadoEn: text('generado_en').notNull(),
    // Run de riesgo vigente al generar el corte; null si no había ninguno.
    riskRunId: text('risk_run_id').references(() => infraRiskRun.id),
    // Copia de infraRiskRun.cobertura en ese instante (p. ej.
    // { procesadas, conEvidencia, sinEvidencia }).
    cobertura: jsonb('cobertura').$type<Record<string, number> | null>(),
    // Conteo de escuelas por nivelRiesgo ('bajo'/'moderado'/'alto'/'muy_alto')
    // al horizonte de 24h, en el instante del corte.
    conteosPorNivelRiesgo: jsonb('conteos_por_nivel_riesgo')
      .$type<Record<string, number>>()
      .notNull(),
    kpis: jsonb('kpis')
      .$type<{
        escuelasAfectacionConfirmadaVigente: number
        escuelasRiesgoAlto24h: number
        fuentesVencidas: number
      }>()
      .notNull(),
    // Salud de fuentes congelada en el instante del corte (frescura ya
    // calculada, no recalculada al leer).
    fuentesSalud: jsonb('fuentes_salud')
      .$type<Array<{ provider: string; estado: string; frescuraMinutos: number | null; vencida: boolean }>>()
      .notNull(),
    episodiosAbiertos: integer('episodios_abiertos').notNull().default(0),
    // Episodios que pasaron a cerrado entre el corte anterior y este.
    episodiosCerradosDesdeAnterior: integer('episodios_cerrados_desde_anterior').notNull().default(0),
    // Trazabilidad hacia el infra_job_run que produjo este corte.
    generadoPorJobRunId: text('generado_por_job_run_id').references(() => infraJobRun.id),
    creadaEn: text('creada_en').notNull(),
  },
  (t) => [
    index('infra_situacion_corte_generado_en_idx').on(t.generadoEn),
    index('infra_situacion_corte_risk_run_id_idx').on(t.riskRunId),
  ],
)

// E8: briefing narrativo asistido por IA (batch E8, ver plan-ejecucion §6-E8).
// `corteId` referencia infra_situacion_corte de E5 (ya mergeada). Un briefing
// por corte (`infra_briefing_corte_uidx` da la idempotencia) y
// `infra_briefing_creada_en_idx` permite sumar el `costoUsd` del mes vigente.
export const infraBriefing = pgTable(
  'infra_briefing',
  {
    id: text('id').primaryKey(),
    corteId: text('corte_id').notNull().references(() => infraSituacionCorte.id),
    modelo: text('modelo').notNull(),
    versionPrompt: text('version_prompt').notNull(),
    parametros: jsonb('parametros').$type<Record<string, unknown>>(),
    salidaIa: jsonb('salida_ia').$type<Record<string, unknown> | null>(),
    textoFinal: text('texto_final').notNull(),
    // 'ia' | 'plantilla'.
    fuente: text('fuente').notNull(),
    // 'json_invalido' | 'cifra_no_trazable' | 'timeout' | 'http_error' |
    // 'presupuesto_agotado' | 'sin_api_key' | null (si fue directo a IA).
    motivoFallback: text('motivo_fallback'),
    tokensEntrada: integer('tokens_entrada'),
    tokensSalida: integer('tokens_salida'),
    costoUsd: real('costo_usd'),
    latenciaMs: integer('latencia_ms'),
    validacion: jsonb('validacion').$type<Record<string, unknown> | null>(),
    auditoriaFallback: jsonb('auditoria_fallback').$type<Record<string, unknown> | null>(),
    creadaEn: text('creada_en').notNull(),
  },
  (t) => [
    uniqueIndex('infra_briefing_corte_uidx').on(t.corteId),
    index('infra_briefing_creada_en_idx').on(t.creadaEn),
  ],
)

// Reserva atómica del presupuesto mensual de E8: el costo de una corrida no
// se conoce hasta después de llamar al modelo, así que se reserva una
// estimación conservadora ANTES de llamar (UPDATE/INSERT condicionado, nunca
// select-then-compare) y se ajusta con el costo real al terminar. Evita que
// dos corridas casi simultáneas lean el mismo acumulado y juntas superen el
// techo (mismo defecto de clase que infraJobRun, ver job-run.ts).
export const infraBriefingPresupuestoMes = pgTable('infra_briefing_presupuesto_mes', {
  mes: text('mes').primaryKey(), // inicio de mes UTC en ISO, ej '2026-09-01T00:00:00.000Z'
  acumuladoUsd: real('acumulado_usd').notNull(),
  actualizadaEn: text('actualizada_en').notNull(),
})

// Veredicto diario de IA (ver docs/propuestas/veredicto-diario-ia.md). Cada
// versión de un (fecha, ambito) queda registrada; `reemplazado_por` marca la
// versión que la sucedió y la vigente es la de `reemplazado_por` nulo. Nunca
// se borra una fila.
export const infraVeredictoDia = pgTable(
  'infra_veredicto_dia',
  {
    id: text('id').primaryKey(),
    // Día ART en YYYY-MM-DD.
    fecha: text('fecha').notNull(),
    // 'provincia' | 'departamento:<id>'.
    ambito: text('ambito').notNull(),
    // 'observado' | 'hoy' | 'pronostico'.
    tipoDia: text('tipo_dia').notNull(),
    // 'sin_senal' | 'vigilancia' | 'alerta' | 'severo' | 'sin_dato'.
    nivel: text('nivel').notNull(),
    trazaReglas: jsonb('traza_reglas').$type<Record<string, unknown>>().notNull(),
    versionReglas: text('version_reglas'),
    metricas: jsonb('metricas').$type<Record<string, unknown>>().notNull(),
    inputsHash: text('inputs_hash'),
    cobertura: jsonb('cobertura').$type<Record<string, unknown>>().notNull(),
    textoFinal: text('texto_final'),
    salidaIa: jsonb('salida_ia').$type<Record<string, unknown> | null>(),
    // 'ia' | 'plantilla'.
    fuente: text('fuente').notNull(),
    // Motivo por el que se usó la plantilla en lugar de la IA; null si fue IA.
    motivoFallback: text('motivo_fallback'),
    modelo: text('modelo'),
    versionPrompt: text('version_prompt'),
    tokensEntrada: integer('tokens_entrada'),
    tokensSalida: integer('tokens_salida'),
    costoUsd: real('costo_usd'),
    latenciaMs: integer('latencia_ms'),
    enCalibracion: boolean('en_calibracion').notNull().default(true),
    generadoEn: text('generado_en').notNull(),
    jobRunId: text('job_run_id'),
    reemplazadoPor: text('reemplazado_por'),
    cerrado: boolean('cerrado').notNull().default(false),
  },
  (t) => [
    index('infra_veredicto_dia_hash_idx').on(t.fecha, t.ambito, t.inputsHash),
    uniqueIndex('infra_veredicto_dia_vigente_uidx')
      .on(t.fecha, t.ambito)
      .where(sql`${t.reemplazadoPor} is null`),
    index('infra_veredicto_dia_generado_en_idx').on(t.generadoEn),
  ],
)

// Enlaces de acceso de solo lectura al veredicto. Solo se guarda el hash del
// token; el token en claro nunca se persiste.
export const infraVeredictoEnlace = pgTable(
  'infra_veredicto_enlace',
  {
    id: text('id').primaryKey(),
    tokenHash: text('token_hash').notNull().unique(),
    fechaDesde: text('fecha_desde'),
    fechaHasta: text('fecha_hasta'),
    creadoPor: text('creado_por').notNull(),
    creadoEn: text('creado_en'),
    venceEn: text('vence_en'),
    revocadoEn: text('revocado_en'),
    revocadoPor: text('revocado_por'),
  },
)

// ============================================================
// G1: capas territoriales estáticas
// ============================================================
// Capas territoriales de largo plazo producidas por los jobs offline de
// services/geo-static/ (ver docs/ejecucion-enos/G1/contrato-datos.md). Son
// importadas por un importador aparte; ambas usan PK compuesta
// (cue_anexo, version_job) para permitir convivencia de versiones.

// Aislamiento de un anexo respecto de la red vial/OSM. Los campos de conteo y
// distancia pueden ser null cuando el job no pudo calcularlos; en ese caso
// `motivoSinDatos` explica por qué (por ejemplo 'sin_conexion_red') y
// `indiceAislamiento` queda null. Nunca se asume seguro por defecto.
export const infraAislamientoOsm = pgTable('infra_aislamiento_osm', {
  cueAnexo: text('cue_anexo').notNull(),
  versionJob: text('version_job').notNull(),
  distanciaViaPavimentadaM: real('distancia_via_pavimentada_m'),
  distanciaCabeceraDepartamentalM: real('distancia_cabecera_departamental_m'),
  tramosSinPavimentarCount: integer('tramos_sin_pavimentar_count'),
  tramosSinPavimentarKm: real('tramos_sin_pavimentar_km'),
  crucesAguaCount: integer('cruces_agua_count'),
  crucesAguaConPuenteCount: integer('cruces_agua_con_puente_count'),
  crucesAguaConVadoCount: integer('cruces_agua_con_vado_count'),
  crucesAguaConVadoExplicitoCount: integer('cruces_agua_con_vado_explicito_count'),
  crucesAguaConVadoProbableCount: integer('cruces_agua_con_vado_probable_count'),
  tieneAlternativaSinCruce: boolean('tiene_alternativa_sin_cruce'),
  tieneAlternativaPavimentada: boolean('tiene_alternativa_pavimentada'),
  indiceAislamiento: integer('indice_aislamiento'),
  motivoSinDatos: text('motivo_sin_datos'),
  snapDistanciaM: real('snap_distancia_m'),
  fechaExtractoOsm: text('fecha_extracto_osm').notNull(),
  licencia: text('licencia').notNull(),
  importadoEn: text('importado_en').notNull(),
}, (t) => [
  primaryKey({ columns: [t.cueAnexo, t.versionJob] }),
  index('infra_aislamiento_osm_indice_idx').on(t.indiceAislamiento),
])

// Susceptibilidad estática de largo plazo por período de retorno (physrisk).
// Es riesgo estático, NUNCA un pronóstico ni dato en tiempo real. `fuente`
// distingue 'physrisk' de 'no_disponible'; los peligros quedan null cuando no
// hay dato.
export const infraSusceptibilidadEstatica = pgTable('infra_susceptibilidad_estatica', {
  cueAnexo: text('cue_anexo').notNull(),
  versionJob: text('version_job').notNull(),
  peligroInundacionFluvial: real('peligro_inundacion_fluvial'),
  peligroInundacionPluvial: real('peligro_inundacion_pluvial'),
  peligroViento: real('peligro_viento'),
  peligroCalor: real('peligro_calor'),
  periodoRetornoAnios: integer('periodo_retorno_anios').notNull(),
  fuente: text('fuente').notNull(),
  fechaCorrida: text('fecha_corrida').notNull(),
  licencia: text('licencia').notNull(),
  importadoEn: text('importado_en').notNull(),
  // Flood model v2 (JRC 90 m + lagoon proximity + terrain margin). All nullable:
  // null means "no data", never "no flood". v1 columns above stay untouched.
  claseRio: text('clase_rio'),
  profundidadRp10M: real('profundidad_rp10_m'),
  profundidadRp100M: real('profundidad_rp100_m'),
  profundidadRp500M: real('profundidad_rp500_m'),
  margenRp10M: real('margen_rp10_m'),
  margenRp100M: real('margen_rp100_m'),
  margenRp500M: real('margen_rp500_m'),
  juntoLaguna: boolean('junto_laguna'),
  distanciaAguaM: real('distancia_agua_m'),
  alturaSobreAguaM: real('altura_sobre_agua_m'),
  versionInundacion: integer('version_inundacion'),
}, (t) => [
  primaryKey({ columns: [t.cueAnexo, t.versionJob] }),
])

export type CruceAccesoOsm = {
  lon: number
  lat: number
  clasificacion: 'puente' | 'vado' | 'vado_probable' | 'sin_evidencia'
  // OSM `name` of the crossed waterway; absent in rows imported before it existed.
  nombreCurso?: string | null
  // Bridge `bridge:name`/`name` for bridge crossings; absent in older rows.
  nombrePuente?: string | null
  // OSM `waterway` value of the crossed waterway (river, stream, canal...); absent in older rows.
  tipoCurso?: string | null
  // true for intermittent=yes or seasonal=yes, false only when tagged `no`, null when unknown.
  intermitente?: boolean | null
}

export type RutaGeoJson = {
  type: 'LineString'
  coordinates: Array<[number, number]>
}

/** Metres of the access route by surface (geo-static job v4, 2026-10-17 run onwards). */
export type SuperficiesAcceso = {
  pavimentado: number
  ripio: number
  tierra: number
}

export type ViaPrincipalAcceso = {
  nombre: string | null
  tipo: string
  pavimentada: boolean
}

// Huella OSM del edificio escolar asociada por el job geo-static
// (`edificio_escolar.py`). `poligono` null con `asociacion: 'ambigua'` = varios
// candidatos empatados; la coordenada de la escuela nunca se toca.
export type EdificioOsm = {
  asociacion: 'dentro' | 'nombre' | 'cercania' | 'ambigua'
  distanciaM: number | null
  osmId: number | string | null
  poligono: { type: 'Polygon' | 'MultiPolygon'; coordinates: unknown } | null
  candidatos: number
}

// Geometría OSM usada por el cálculo de aislamiento (ruta escuela → localidad
// urbana cercana y cruces de agua clasificados). Es contexto territorial
// derivado de OpenStreetMap: NUNCA un pronóstico ni el estado confirmado del
// edificio. `ruta` null + `motivoSinGeometria` explica la ausencia.
export const infraAccesoOsmGeometria = pgTable('infra_acceso_osm_geometria', {
  cueAnexo: text('cue_anexo').notNull(),
  versionJob: text('version_job').notNull(),
  ruta: jsonb('ruta').$type<RutaGeoJson>(),        // GeoJSON LineString | null
  cruces: jsonb('cruces').$type<CruceAccesoOsm[]>().notNull(), // array [{lon, lat, clasificacion, nombreCurso?, nombrePuente?}]
  viaPrincipal: text('via_principal'),
  destinoNombre: text('destino_nombre'),
  distanciaDestinoM: real('distancia_destino_m'),
  motivoSinGeometria: text('motivo_sin_geometria'),
  edificio: jsonb('edificio').$type<EdificioOsm>(),  // huella del edificio | null (extractos previos)
  fechaExtractoOsm: text('fecha_extracto_osm').notNull(),
  licencia: text('licencia').notNull(),
  importadoEn: text('importado_en').notNull(),
}, (t) => [primaryKey({ columns: [t.cueAnexo, t.versionJob] })])

export type CeldaExposicionRuta = {
  lon: number
  lat: number
  profundidadM: number | null
}

// Indicador historico/estatico por celda de ~1 km; NUNCA pronostico ni estado
// del camino. `sin_ruta` y `sin_dato` significan SIN DATO, no profundidad 0.
export const infraExposicionRutaInundacion = pgTable('infra_exposicion_ruta_inundacion', {
  cueAnexo: text('cue_anexo').notNull(),
  versionJob: text('version_job').notNull(),
  estado: text('estado').notNull(),
  motivoSinDato: text('motivo_sin_dato'),
  celdasTotal: integer('celdas_total').notNull(),
  celdasConDato: integer('celdas_con_dato').notNull(),
  celdasConProfundidad: integer('celdas_con_profundidad').notNull(),
  profundidadMaxM: real('profundidad_max_m'),
  cobertura: real('cobertura').notNull(),
  periodoRetornoAnios: integer('periodo_retorno_anios').notNull(),
  resolucionArcsec: integer('resolucion_arcsec').notNull(),
  escenario: text('escenario').notNull(),
  fuente: text('fuente').notNull(),
  celdas: jsonb('celdas').$type<CeldaExposicionRuta[]>().notNull(),
  fechaCorrida: text('fecha_corrida').notNull(),
  licencia: text('licencia').notNull(),
  importadoEn: text('importado_en').notNull(),
  // Flood model v2 route exposure (JRC 90 m, per-pixel terrain margin).
  // Reuses versionJob as the version marker. All nullable: null means "no
  // data"; sin_ruta / sin_dato are never rendered as depth 0.
  claseRuta: text('clase_ruta'),
  muestrasTotal: integer('muestras_total'),
  muestrasExpuestas: integer('muestras_expuestas'),
  muestrasSinDato: integer('muestras_sin_dato'),
  profundidadMaxRp10M: real('profundidad_max_rp10_m'),
  profundidadMaxRp100M: real('profundidad_max_rp100_m'),
  profundidadMaxRp500M: real('profundidad_max_rp500_m'),
}, (t) => [primaryKey({ columns: [t.cueAnexo, t.versionJob] })])
// ============================================================
// Fin bloque G1
// ============================================================
export const radarMeteoRun = pgTable('radar_meteo_run', {
  id: text('id').primaryKey(), provider: text('provider').notNull(), model: text('model').notNull(),
  gridVersion: text('grid_version').notNull(), runAt: text('run_at').notNull(), fetchedAt: text('fetched_at').notNull(),
  forecastStart: text('forecast_start').notNull(), forecastEnd: text('forecast_end').notNull(), stepMinutes: integer('step_minutes').notNull(),
  units: jsonb('units').$type<Record<string, string>>().notNull(), status: text('status').notNull(),
  idempotencyKey: text('idempotency_key').notNull(), payload: jsonb('payload').$type<unknown>().notNull(),
}, (t) => [uniqueIndex('radar_meteo_run_idempotency_uidx').on(t.idempotencyKey), index('radar_meteo_run_status_fetched_idx').on(t.status, t.fetchedAt)])
export const radarMeteoVerificacion = pgTable('radar_meteo_verificacion', {
  fecha: text('fecha').notNull(),
  departamento: text('departamento').notNull(),
  runId: text('run_id').notNull(),
  pronosticoMm: real('pronostico_mm'),
  observadoMm: real('observado_mm'),
  coberturaObs: real('cobertura_obs').notNull(),
  motivoExclusion: text('motivo_exclusion'),
  versionAlgoritmo: text('version_algoritmo').notNull(),
  creadoEn: text('creado_en').notNull(),
}, (t) => [primaryKey({ columns: [t.fecha, t.departamento] }), index('radar_meteo_verificacion_fecha_idx').on(t.fecha)])
export const smnAlerta = pgTable('smn_alerta', {
  id: text('id').primaryKey(), sender: text('sender').notNull(), sent: text('sent').notNull(), onset: text('onset'), expires: text('expires'),
  event: text('event').notNull(), severity: text('severity').notNull(), urgency: text('urgency'), certainty: text('certainty'), headline: text('headline'), description: text('description'), instruction: text('instruction'),
  nivelSat: text('nivel_sat'), departamentos: jsonb('departamentos').$type<Array<{id:string;nombre:string}>>().notNull(), poligonos: jsonb('poligonos').$type<unknown[]>().notNull(), raw: text('raw').notNull(), fetchedAt: text('fetched_at').notNull(), cancelada: boolean('cancelada').notNull().default(false),
}, (t) => [index('smn_alerta_fetched_idx').on(t.fetchedAt), index('smn_alerta_expires_idx').on(t.expires)])
export const radarMeteoEnsembleRun = pgTable('radar_meteo_ensemble_run', {
  id: text('id').primaryKey(), model: text('model').notNull(), runAt: text('run_at').notNull(), fetchedAt: text('fetched_at').notNull(), timezone: text('timezone').notNull(), departmentGeoVersion: text('department_geo_version').notNull(), forecastStart: text('forecast_start').notNull(), forecastEnd: text('forecast_end').notNull(), status: text('status').notNull(), idempotencyKey: text('idempotency_key').notNull(), payload: jsonb('payload').$type<unknown>().notNull(),
}, (t) => [uniqueIndex('radar_meteo_ensemble_run_idempotency_uidx').on(t.idempotencyKey), index('radar_meteo_ensemble_run_status_fetched_idx').on(t.status,t.fetchedAt)])
// DB1-F2 (pg-core): las fechas guardadas como `text` ISO-8601 UTC se conservan
// como `text` en esta fase (migrar a timestamptz queda como seguimiento F4/F5).
// Las tablas better-auth (user/session/account/verification) pasan de epoch ms
// `integer` a `timestamp` nativo (mode 'date') porque pg-core no admite
// `integer` con mode timestamp; default `now()`.
// Booleanos nativos: user.emailVerified, user.banned,
// infra_verificacion.discrepancia, infra_risk_snapshot.evidenciaValida,
// infra_aislamiento_osm.tieneAlternativaSinCruce. Sin TODO(DB1-F2) por duda.


// Fuentes de infraestructura: identidad → versiones → registros → publicación.
// Las tablas de dominio existentes son proyecciones operativas de estos datos.
export const infraDataset = pgTable('infra_dataset', {
  id: text('id').primaryKey(),
  nombre: text('nombre').notNull(),
})

export const infraDatasetVersion = pgTable('infra_dataset_version', {
  id: text('id').primaryKey(),
  datasetId: text('dataset_id').notNull().references(() => infraDataset.id),
  revision: text('revision').notNull(),
  checksum: text('checksum').notNull(),
  fuente: text('fuente').notNull(),
  licencia: text('licencia'),
  fechaFuente: timestamp('fecha_fuente', { withTimezone: true }),
  creadaEn: timestamp('creada_en', { withTimezone: true }).notNull().defaultNow(),
  formato: text('formato').notNull(),
  estructura: jsonb('estructura').$type<Record<string, unknown>>().notNull(),
  metadatos: jsonb('metadatos').$type<Record<string, unknown>>().notNull(),
  filas: integer('filas').notNull(),
}, (t) => [
  uniqueIndex('infra_dataset_version_dataset_id_uidx').on(t.datasetId, t.id),
  index('infra_dataset_version_dataset_fecha_idx').on(t.datasetId, t.creadaEn),
  check('infra_dataset_version_filas_check', sql`${t.filas} >= 0`),
])

export const infraDatasetRegistro = pgTable('infra_dataset_registro', {
  versionId: text('version_id').notNull().references(() => infraDatasetVersion.id),
  clave: text('clave').notNull(),
  orden: integer('orden').notNull(),
  datos: jsonb('datos').$type<Record<string, unknown>>().notNull(),
}, (t) => [
  primaryKey({ columns: [t.versionId, t.clave] }),
  uniqueIndex('infra_dataset_registro_orden_uidx').on(t.versionId, t.orden),
])

export const infraDatasetDependencia = pgTable('infra_dataset_dependencia', {
  versionId: text('version_id').notNull().references(() => infraDatasetVersion.id),
  entradaId: text('entrada_id').notNull().references(() => infraDatasetVersion.id),
}, (t) => [primaryKey({ columns: [t.versionId, t.entradaId] })])

export const infraDatasetPublicacion = pgTable('infra_dataset_publicacion', {
  datasetId: text('dataset_id').primaryKey().references(() => infraDataset.id),
  versionId: text('version_id').notNull(),
  publicadaEn: timestamp('publicada_en', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [foreignKey({
  columns: [t.datasetId, t.versionId],
  foreignColumns: [infraDatasetVersion.datasetId, infraDatasetVersion.id],
  name: 'infra_dataset_publicacion_version_fk',
})])

// --- Matrícula nominal de institutos superiores (CSV/XLSX por ciclo) ---
// Un corte por importación: 'cargando' mientras se escribe, 'vigente' al
// activarse (el anterior pasa a 'reemplazado') o 'fallido'. Sólo puede haber un
// vigente a la vez. El DNI nunca se guarda en claro: dni_hash es HMAC-SHA256.
// Retention: replaced cuts are kept and never purged. The parte stores
// (corte_id, alumno_id), so historic records keep resolving to their names.
export const matriculaCorte = pgTable('matricula_corte', {
  id: serial('id').primaryKey(),
  fuente: text('fuente').notNull(),
  cicloLectivo: integer('ciclo_lectivo').notNull(),
  estado: text('estado').notNull(),
  creadoEn: text('creado_en').notNull(),
  filasImportadas: integer('filas_importadas').notNull().default(0),
  filasExcluidas: integer('filas_excluidas').notNull().default(0),
}, (t) => [
  check('matricula_corte_estado_check', sql`${t.estado} IN ('cargando', 'vigente', 'reemplazado', 'fallido')`),
  uniqueIndex('matricula_corte_vigente_uidx').on(t.estado).where(sql`${t.estado} = 'vigente'`),
])

export const matriculaCarrera = pgTable('matricula_carrera', {
  id: serial('id').primaryKey(),
  corteId: integer('corte_id').notNull().references(() => matriculaCorte.id, { onDelete: 'cascade' }),
  cueAnexo: text('cue_anexo').notNull(),
  instituto: text('instituto').notNull(),
  nombre: text('nombre').notNull(),
  rm: text('rm').notNull(),
  tipo: text('tipo').notNull(),
  estado: text('estado').notNull(),
  sector: text('sector').notNull(),
}, (t) => [
  uniqueIndex('matricula_carrera_uidx').on(t.corteId, t.cueAnexo, t.nombre, t.rm),
  index('matricula_carrera_cue_idx').on(t.corteId, t.cueAnexo),
  check('matricula_carrera_estado_check', sql`${t.estado} IN ('ABIERTA', 'CERRADA')`),
  check('matricula_carrera_sector_check', sql`${t.sector} IN ('estatal', 'privado')`),
])

// id es el identificador de miembro que guarda el parte.
export const matriculaAlumno = pgTable('matricula_alumno', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  corteId: integer('corte_id').notNull().references(() => matriculaCorte.id, { onDelete: 'cascade' }),
  carreraId: integer('carrera_id').notNull().references(() => matriculaCarrera.id, { onDelete: 'cascade' }),
  apellidos: text('apellidos').notNull(),
  nombres: text('nombres').notNull(),
  nombreBusqueda: text('nombre_busqueda').notNull(),
  dniHash: text('dni_hash').notNull(),
}, (t) => [
  // Exact DNI lookup is per career (unique key above); prefix LIKE on the name
  // needs text_pattern_ops to use the index outside the C locale.
  uniqueIndex('matricula_alumno_carrera_dni_uidx').on(t.carreraId, t.dniHash),
  index('matricula_alumno_busqueda_idx').on(t.carreraId, t.nombreBusqueda.op('text_pattern_ops')),
])
