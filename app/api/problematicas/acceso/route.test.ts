import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { NOMBRE_COOKIE, tokenSesionValido } from '@/lib/infraestructura/acceso-publico'
import { POST } from './route'
import { claveDePrueba } from '@/lib/infraestructura/claves-de-prueba'

const CLAVE = claveDePrueba()
const CLAVE_MALA = claveDePrueba()

let prevPassword: string | undefined

beforeEach(() => {
  prevPassword = process.env.PROBLEMATICAS_ACCESO_PASSWORD
  process.env.PROBLEMATICAS_ACCESO_PASSWORD = CLAVE
})

afterEach(() => {
  if (prevPassword === undefined) delete process.env.PROBLEMATICAS_ACCESO_PASSWORD
  else process.env.PROBLEMATICAS_ACCESO_PASSWORD = prevPassword
})

function req(body: unknown) {
  return new Request('http://localhost/api/problematicas/acceso', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function extraerToken(setCookie: string): string {
  const match = setCookie.match(new RegExp(`${NOMBRE_COOKIE}=([^;]+)`))
  if (!match) throw new Error('no se encontró la cookie en la respuesta')
  return decodeURIComponent(match[1])
}

describe('POST /api/problematicas/acceso', () => {
  it('con la contraseña correcta setea una cookie httpOnly con un token vigente', async () => {
    const res = await POST(req({ password: CLAVE }))
    expect(res.status).toBe(200)

    const setCookie = res.headers.get('set-cookie')
    expect(setCookie).toBeTruthy()
    expect(setCookie).toContain('HttpOnly')
    expect(setCookie).toMatch(/SameSite=Lax/i)

    const token = extraerToken(setCookie!)
    expect(tokenSesionValido(token)).toBe(true)
  })

  it('con una contraseña incorrecta responde 401 sin distinguir el motivo', async () => {
    const res = await POST(req({ password: CLAVE_MALA }))
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).not.toMatch(/no existe|no configurada/i)
  })

  it('sin contraseña en el cuerpo responde 400', async () => {
    const res = await POST(req({}))
    expect(res.status).toBe(400)
  })

  it('con un cuerpo inválido responde 400', async () => {
    const res = await POST(
      new Request('http://localhost/api/problematicas/acceso', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{invalido',
      }),
    )
    expect(res.status).toBe(400)
  })
})
