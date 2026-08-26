import { integer, sqliteTable, text, primaryKey } from 'drizzle-orm/sqlite-core'

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
