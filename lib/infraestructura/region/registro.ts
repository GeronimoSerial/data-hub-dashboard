import corrientes from '../../../config/regiones/corrientes.json' with { type: 'json' }
import { RegionConfigSchema, type RegionConfig } from './esquema'

const REGISTRO = { corrientes } as const

export const REGIONES_CONOCIDAS: readonly string[] = Object.keys(REGISTRO)

// Throws a ZodError when the registered JSON does not match the schema.
export function cargarRegion(id: string): RegionConfig {
  if (!Object.hasOwn(REGISTRO, id)) {
    throw new Error(
      `REGION desconocida: "${id}". Regiones disponibles: ${REGIONES_CONOCIDAS.join(', ')}`,
    )
  }
  return RegionConfigSchema.parse(REGISTRO[id as keyof typeof REGISTRO])
}
