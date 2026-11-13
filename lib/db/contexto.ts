import { AsyncLocalStorage } from 'node:async_hooks'
import type { getDb } from './index'

type Db = ReturnType<typeof getDb>
const key = Symbol.for('enos.db.transaccion-contextual')
const globalContext = globalThis as typeof globalThis & { [key]?: AsyncLocalStorage<Db> }
export const transaccionContextual = globalContext[key] ??= new AsyncLocalStorage<Db>()
