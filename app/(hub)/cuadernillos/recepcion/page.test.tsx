import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ requireServerHubPageAccess: vi.fn() }))
vi.mock('@/lib/hub-entry-server', () => ({ requireServerHubPageAccess: mocks.requireServerHubPageAccess }))

import RecepcionPage from './page'

describe('RecepcionPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireServerHubPageAccess.mockResolvedValue({ id: 'school-1' })
  })

  it('guards the exact receipt path with the cuadernillos hub section', async () => {
    await RecepcionPage()
    expect(mocks.requireServerHubPageAccess).toHaveBeenCalledWith('/cuadernillos/recepcion', 'cuadernillos')
  })
})
