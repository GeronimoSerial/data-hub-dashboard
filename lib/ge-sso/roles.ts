import { z } from 'zod'

// Sin imports de better-auth ni de la base: lo usan lib/auth.ts (vía el plugin)
// y los route handlers, así que no puede arrastrar un ciclo de módulos.

export const ROLES_GE = [
  'administrador',
  'director_nivel',
  'operador_establecimiento',
] as const

export type RolGe = (typeof ROLES_GE)[number]

/** Rol GE -> rol de la app (ver ROLES en lib/auth-permissions.ts). */
export const ROL_HUB_POR_GE: Record<RolGe, string> = {
  administrador: 'admin',
  director_nivel: 'director_nivel',
  operador_establecimiento: 'operador_establecimiento',
}

export function rolGeDesdeHub(rolHub: string | null | undefined): RolGe | null {
  return ROLES_GE.find((rol) => ROL_HUB_POR_GE[rol] === rolHub) ?? null
}

/** Destino tras canjear el ticket. El operador no recibe el CUE en la URL: lo
 *  toma de la sesión (T7). */
export function destinoPostLogin(rolHub: string | null | undefined): string {
  if (rolHub === 'operador_establecimiento') return '/problematicas/parte/nuevo'
  if (rolHub === 'admin' || rolHub === 'director_nivel') return '/mapas/infraestructura'
  return '/'
}

export const geLoginSchema = z
  .object({
    email: z.string().trim().toLowerCase().max(254).pipe(z.email()),
    nombre: z.string().trim().min(1).max(100),
    apellido: z.string().trim().min(1).max(100),
    rol: z.enum(ROLES_GE),
    cue: z.string().trim().min(1).max(20).optional(),
    nivelJurisdiccionalId: z.number().int().positive().optional(),
    api_key: z.string().min(1).max(512),
  })
  .superRefine((body, ctx) => {
    if (body.rol === 'operador_establecimiento' && !body.cue) {
      ctx.addIssue({ code: 'custom', path: ['cue'], message: 'cue es obligatorio para operador_establecimiento' })
    }
    if (body.rol === 'director_nivel' && body.nivelJurisdiccionalId === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['nivelJurisdiccionalId'],
        message: 'nivelJurisdiccionalId es obligatorio para director_nivel',
      })
    }
  })

export type GeLoginBody = z.infer<typeof geLoginSchema>
