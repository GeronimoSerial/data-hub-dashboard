import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { nextCookies } from 'better-auth/next-js'
import { admin as adminPlugin } from 'better-auth/plugins'
import { getDb } from '@/lib/db'
import * as schema from '@/lib/db/schema'
import {
  ac,
  admin,
  editor,
  consulta,
  directorNivel,
  adminGe,
  operadorEstablecimiento,
} from '@/lib/auth-permissions'
import { geSsoPlugin } from '@/lib/ge-sso/plugin'

type Db = ReturnType<typeof getDb>

// El adaptador de better-auth conserva el `db` que recibe. Si se le pasa la base
// vigente al construir la instancia, cualquier alta, rol, ban o sesión de
// better-auth escribe fuera de la transacción auditada (o, si la instancia se
// construyó dentro de una, usa una transacción ya cerrada). El proxy resuelve
// `getDb()` en cada acceso: dentro de cambioAuditado usa `tx`; fuera, la misma
// instancia de siempre.
const dbDelegada = new Proxy({} as Db, {
  get(_target, prop) {
    const real = getDb() as object
    const valor = Reflect.get(real, prop, real)
    return typeof valor === 'function' ? valor.bind(real) : valor
  },
})

// Función real, sin invocar todavía: se usa tanto para construir la
// instancia (una sola vez, ver construirAuth) como para que TypeScript infiera
// el tipo exacto de `Auth` a partir de ESTA MISMA llamada a `betterAuth`
// (roles, plugins, etc. tipados en detalle) — así `auth.api.setRole`,
// `auth.api.banUser`, `auth.api.createUser`, etc. siguen tipando igual que
// antes. `ReturnType<typeof betterAuth>` a secas perdería esa especificidad
// (caería al genérico `BetterAuthOptions`).
function crearInstanciaAuth() {
  // Pide la conexión al construir, como antes; el adaptador usa `dbDelegada`, no este valor.
  void getDb()
  return betterAuth({
    baseURL: process.env.BETTER_AUTH_URL,
    database: drizzleAdapter(dbDelegada, {
      provider: 'pg',
      schema,
    }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: 8,
    },
    plugins: [
      adminPlugin({
        ac,
        roles: {
          admin,
          editor,
          consulta,
          director_nivel: directorNivel,
          admin_ge: adminGe,
          operador_establecimiento: operadorEstablecimiento,
        },
        defaultRole: 'consulta',
        adminRoles: ['admin'],
      }),
      // SSO desde GE (T6): canje de ticket -> sesión. Ver lib/ge-sso/.
      geSsoPlugin(),
      nextCookies(),
    ],
  })
}

type Auth = ReturnType<typeof crearInstanciaAuth>

// Lazy: `getDb()` resuelve DATA_DIR (lib/data-dir.ts) en el primer uso y
// memoiza la conexión. Si `betterAuth(...)` corriera acá arriba, a nivel de
// módulo, cualquier `import { auth } from '@/lib/auth'` -aunque sea
// transitivo- congelaría la conexión a lo que DATA_DIR resuelva en ese
// instante (típicamente `.data/pg` de un checkout de dev), sin
// importar qué DATA_DIR se setee después en un `beforeAll` de test. Se
// construye una sola vez, en el primer acceso real (auth.api.*, auth.$context,
// etc.), nunca en el import.
let instancia: Auth | undefined

function construirAuth(): Auth {
  if (instancia === undefined) instancia = crearInstanciaAuth()
  return instancia
}

// Proxy en vez de exportar `construirAuth()` directamente: mantiene la forma
// del export (`auth` es un objeto, no una función) para no tocar ningún
// import existente (`auth.api.getSession`, `auth.$context`,
// `toNextJsHandler(auth)`), mientras sigue difiriendo la construcción real
// hasta la primera propiedad leída. Cada acceso resuelve contra la instancia
// real (memoizada) y bindea los métodos a ella, no al proxy, para que su
// `this` interno siga siendo el objeto que better-auth espera.
export const auth: Auth = new Proxy({} as Auth, {
  get(_target, prop, _receiver) {
    const real = construirAuth()
    const valor = Reflect.get(real as object, prop, real as object)
    return typeof valor === 'function' ? valor.bind(real) : valor
  },
  has(_target, prop) {
    return Reflect.has(construirAuth() as object, prop)
  },
})
