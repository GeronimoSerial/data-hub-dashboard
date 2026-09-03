#!/usr/bin/env node
/**
 * Smoke de navegación documental — Batch 0.
 *
 * Verifica contra un servidor en marcha la matriz de rutas a nivel HTTP
 * (redirects de servidor, gate, 404, rutas públicas). No necesita Playwright:
 * usa solo fetch de Node. No cubre transiciones SPA (ver docs del batch).
 *
 * Uso: node scripts/smoke-nav.mjs [baseURL]
 *   baseURL por defecto: http://localhost:3000 (o env SMOKE_BASE_URL)
 */
const base = process.env.SMOKE_BASE_URL || process.argv[2] || 'http://localhost:3000'

const checks = [
  { name: 'Inicio', path: '/', status: 200 },
  { name: 'Explorar', path: '/explorar', status: 200 },
  { name: 'Explorar filtrado (destino alias)', path: '/explorar?formato=mapa', status: 200 },
  { name: 'Login', path: '/login', status: 200 },
  { name: 'Forbidden', path: '/forbidden', status: 200 },
  { name: 'Ruta inexistente', path: '/ruta-inexistente', status: 404 },
  { name: 'Alias /reportes -> Explorar reportes', path: '/reportes', status: 307, location: '/explorar?formato=reporte' },
  { name: 'Alias /tableros -> Explorar tableros', path: '/tableros', status: 307, location: '/explorar?formato=tablero' },
  { name: 'Alias /mapas -> Explorar mapas', path: '/mapas', status: 307, location: '/explorar?formato=mapa' },
  { name: 'Legacy /tablero anonimo', path: '/tablero', status: 307, loginCallback: '/tablero' },
  { name: 'Legacy /mapa_interactivo anonimo', path: '/mapa_interactivo', status: 307, loginCallback: '/mapa_interactivo' },
  { name: 'Legacy /mapa_sobreedad anonimo', path: '/mapa_sobreedad', status: 307, loginCallback: '/mapa_sobreedad' },
  { name: 'Legacy /mapa_notas anonimo', path: '/mapa_notas', status: 307, loginCallback: '/mapa_notas' },
  { name: 'Legacy anidado + query anonimo', path: '/tablero/sub?capa=1', status: 307, loginCallback: '/tablero/sub?capa=1' },
  { name: 'PDF gated anonimo', path: '/recursos/reporte-sobreedad-inicial.pdf', status: 307, loginCallback: '/recursos/reporte-sobreedad-inicial.pdf' },
  { name: 'Admin anonimo', path: '/admin', status: 307, loginCallback: '/admin' },
  { name: 'Mapa matricula anonimo', path: '/mapas/matricula', status: 307, loginCallback: '/mapas/matricula' },
  { name: 'Ficha recurso anonimo', path: '/recursos/r1', status: 307, loginCallback: '/recursos/r1' },
]

let failed = 0
for (const check of checks) {
  try {
    const res = await fetch(base + check.path, {
      redirect: 'manual',
      headers: { accept: 'text/html' },
    })
    const okStatus = res.status === check.status
    let okLocation = true
    let detail = ''
    if (check.location) {
      const loc = new URL(res.headers.get('location') || '', base)
      const expected = new URL(check.location, base)
      okLocation = loc.pathname === expected.pathname && loc.search === expected.search
      detail = ` -> ${loc.pathname}${loc.search}`
    } else if (check.loginCallback) {
      const loc = new URL(res.headers.get('location') || '', base)
      const callback = loc.searchParams.get('callbackUrl')
      okLocation = loc.pathname === '/login' && callback === check.loginCallback
      detail = ` -> ${loc.pathname}?callbackUrl=${encodeURIComponent(callback || '')}`
    }
    if (okStatus && okLocation) {
      console.log(`  ok  ${check.name}${detail}`)
    } else {
      failed++
      console.log(`FAIL  ${check.name} esperaba ${check.status}${check.location ? ' -> ' + check.location : check.loginCallback ? ' -> /login callback ' + check.loginCallback : ''}${detail}`)
    }
  } catch (err) {
    failed++
    console.log(`FAIL  ${check.name} error de red: ${err.message}`)
  }
}

console.log(`\nSmoke navegacion documental: ${checks.length - failed}/${checks.length} ok contra ${base}`)
process.exit(failed === 0 ? 0 : 1)