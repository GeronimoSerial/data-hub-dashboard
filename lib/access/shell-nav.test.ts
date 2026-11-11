import { describe, expect, it } from 'vitest'
import type { Role } from '@/lib/acl'
import { shellNavAllowed, shellUserFor } from './shell-nav'

const visible = (role: Role, hubPolicy?: Parameters<typeof shellUserFor>[1]) =>
  ['/', '/explorar'].filter((href) => shellNavAllowed(shellUserFor(role, hubPolicy), href))

describe('shellNavAllowed', () => {
  it('shows Inicio and Explorar to admin and editor', () => {
    expect(visible('admin')).toEqual(['/', '/explorar'])
    expect(visible('editor')).toEqual(['/', '/explorar'])
  })

  it('hides both to confined roles', () => {
    expect(visible('director_nivel')).toEqual([])
    expect(visible('operador_establecimiento')).toEqual([])
  })

  it('hides both to admin_ge, que no ve el hub', () => {
    expect(visible('admin_ge')).toEqual([])
  })

  it('follows the consulta policy for each destination', () => {
    expect(visible('consulta')).toEqual(['/', '/explorar'])
    expect(visible('consulta', { enabledSections: ['explore'], landing: false })).toEqual(['/explorar'])
    expect(visible('consulta', { enabledSections: ['maps'], landing: true })).toEqual(['/'])
  })

  it('denies destinations outside the shell primary navigation and a missing user', () => {
    expect(shellNavAllowed(shellUserFor('admin', undefined), '/reportes')).toBe(false)
    expect(shellNavAllowed(null, '/')).toBe(false)
  })
})
