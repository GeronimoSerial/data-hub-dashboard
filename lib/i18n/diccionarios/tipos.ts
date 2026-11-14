import type { es } from './es'

// Maps every leaf of a dictionary to the widest type a translation may use:
// strings become `string`, tuples keep their length, functions keep their
// arity and return `string`. A key missing from a translation is then a
// compile error, and so is a tuple with the wrong number of entries.
export type DeepStringify<T> = T extends string
  ? string
  : T extends (...args: infer A) => unknown
    ? (...args: A) => string
    : T extends readonly unknown[]
      ? { [K in keyof T]: DeepStringify<T[K]> }
      : T extends object
        ? { [K in keyof T]: DeepStringify<T[K]> }
        : T

export type Diccionario = DeepStringify<typeof es>
