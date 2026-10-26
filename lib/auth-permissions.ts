import { createAccessControl } from 'better-auth/plugins/access'
import { defaultStatements, adminAc } from 'better-auth/plugins/admin/access'

export const ac = createAccessControl({ ...defaultStatements })

export const admin = ac.newRole({ ...adminAc.statements })
export const editor = ac.newRole({ user: [] })
export const consulta = ac.newRole({ user: [] })
// Mismos permisos que consulta: el alcance real lo aplican las rutas por nivel/CUE.
export const directorNivel = ac.newRole({ user: [] })
export const operadorEstablecimiento = ac.newRole({ user: [] })
// Administrador GE: sólo mapa de infraestructura y su carga; sin permisos de admin del hub.
export const adminGe = ac.newRole({ user: [] })
