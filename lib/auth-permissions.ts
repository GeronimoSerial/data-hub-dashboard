import { createAccessControl } from 'better-auth/plugins/access'
import { defaultStatements, adminAc } from 'better-auth/plugins/admin/access'

export const ac = createAccessControl({ ...defaultStatements })

export const admin = ac.newRole({ ...adminAc.statements })
export const editor = ac.newRole({ user: [] })
export const consulta = ac.newRole({ user: [] })
