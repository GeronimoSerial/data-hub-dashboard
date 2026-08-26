import { count } from 'drizzle-orm'
import {
  categorias as seedCategorias,
  niveles as seedNiveles,
  recursos as seedRecursos,
  tags as seedTags,
  tipos as seedTipos,
} from '@/lib/model'
import { getDb } from './index'
import {
  categorias,
  niveles,
  recursoTags,
  recursos,
  tags,
  tipos,
} from './schema'

const HUB_DDL = `
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS \`niveles\` (
  \`id\` text PRIMARY KEY NOT NULL,
  \`nombre\` text NOT NULL,
  \`orden\` integer NOT NULL
);
CREATE TABLE IF NOT EXISTS \`tipos\` (
  \`id\` text PRIMARY KEY NOT NULL,
  \`nombre\` text NOT NULL,
  \`aplica_a\` text NOT NULL
);
CREATE TABLE IF NOT EXISTS \`categorias\` (
  \`id\` text PRIMARY KEY NOT NULL,
  \`nombre\` text NOT NULL,
  \`color\` text NOT NULL
);
CREATE TABLE IF NOT EXISTS \`tags\` (
  \`id\` text PRIMARY KEY NOT NULL,
  \`nombre\` text NOT NULL
);
CREATE TABLE IF NOT EXISTS \`recursos\` (
  \`id\` text PRIMARY KEY NOT NULL,
  \`titulo\` text NOT NULL,
  \`descripcion\` text NOT NULL,
  \`formato\` text NOT NULL,
  \`nivel_id\` text NOT NULL,
  \`tipo_id\` text NOT NULL,
  \`categoria_id\` text NOT NULL,
  \`area\` text NOT NULL,
  \`actualizado\` text NOT NULL,
  \`estado\` text NOT NULL,
  \`ruta\` text,
  \`storage_key\` text,
  \`mime\` text,
  \`nombre_original\` text,
  \`size\` integer,
  FOREIGN KEY (\`nivel_id\`) REFERENCES \`niveles\`(\`id\`),
  FOREIGN KEY (\`tipo_id\`) REFERENCES \`tipos\`(\`id\`),
  FOREIGN KEY (\`categoria_id\`) REFERENCES \`categorias\`(\`id\`)
);
CREATE TABLE IF NOT EXISTS \`recurso_tags\` (
  \`recurso_id\` text NOT NULL,
  \`tag_id\` text NOT NULL,
  PRIMARY KEY(\`recurso_id\`, \`tag_id\`),
  FOREIGN KEY (\`recurso_id\`) REFERENCES \`recursos\`(\`id\`) ON DELETE CASCADE,
  FOREIGN KEY (\`tag_id\`) REFERENCES \`tags\`(\`id\`)
);
CREATE TABLE IF NOT EXISTS \`recurso_audiencia_niveles\` (
  \`recurso_id\` text NOT NULL,
  \`nivel_id\` text NOT NULL,
  PRIMARY KEY(\`recurso_id\`, \`nivel_id\`),
  FOREIGN KEY (\`recurso_id\`) REFERENCES \`recursos\`(\`id\`) ON DELETE CASCADE,
  FOREIGN KEY (\`nivel_id\`) REFERENCES \`niveles\`(\`id\`)
);
CREATE TABLE IF NOT EXISTS \`recurso_audiencia_usuarios\` (
  \`recurso_id\` text NOT NULL,
  \`user_id\` text NOT NULL,
  PRIMARY KEY(\`recurso_id\`, \`user_id\`),
  FOREIGN KEY (\`recurso_id\`) REFERENCES \`recursos\`(\`id\`) ON DELETE CASCADE
);
`

let seedPromise: Promise<void> | null = null

export function ensureSeeded() {
  if (!seedPromise) {
    seedPromise = seedHub().catch((err) => {
      seedPromise = null
      throw err
    })
  }
  return seedPromise
}

async function seedHub() {
  const db = getDb()
  await db.$client.executeMultiple(HUB_DDL)

  const [row] = await db.select({ n: count() }).from(niveles)
  if ((row?.n ?? 0) > 0) return

  const tagJoins = seedRecursos.flatMap((r) =>
    r.tagIds.map((tagId) => ({ recursoId: r.id, tagId })),
  )

  await db.transaction(async (tx) => {
    await tx.insert(niveles).values(seedNiveles)
    await tx.insert(tipos).values(seedTipos)
    await tx.insert(categorias).values(seedCategorias)
    await tx.insert(tags).values(seedTags)
    await tx.insert(recursos).values(
      seedRecursos.map(
        ({ tagIds: _tagIds, audienciaNivelIds: _n, audienciaUserIds: _u, ...row }) =>
          row,
      ),
    )
    if (tagJoins.length > 0) {
      await tx.insert(recursoTags).values(tagJoins)
    }
  })
}
