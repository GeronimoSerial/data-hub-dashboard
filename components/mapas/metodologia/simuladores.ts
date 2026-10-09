// Interactive charts and simulators of the methodology tab. Plain DOM on top
// of the static markup rendered by MetodologiaMapa: every control already
// exists in the markup, this module only listens and redraws.
//
// The thresholds, weights and rules below mirror the production code (risk
// engine, access rule, isolation job, flood classifier, IMERG verification).
// Change them together.

type Nivel = 'bajo' | 'moderado' | 'alto' | 'muy_alto'

const NS = 'http://www.w3.org/2000/svg'
const COLOR_NIVEL: Record<Nivel, string> = {
  bajo: '--nivel-peligro-verde',
  moderado: '--nivel-peligro-amarillo',
  alto: '--nivel-peligro-naranja',
  muy_alto: '--nivel-peligro-rojo',
}
const NOMBRE_NIVEL: Record<Nivel, string> = { bajo: 'Bajo', moderado: 'Moderado', alto: 'Alto', muy_alto: 'Muy alto' }
const COLORES_NIVEL_ORDEN = ['--nivel-peligro-verde', '--nivel-peligro-amarillo', '--nivel-peligro-naranja', '--nivel-peligro-rojo']
// Yellow and green fills need dark text to stay readable.
const FONDOS_CLAROS = new Set(['--nivel-peligro-amarillo', '--nivel-peligro-verde', '--nivel-peligro-sin-dato'])

const nivelRiesgo = (s: number): Nivel => (s < 25 ? 'bajo' : s < 50 ? 'moderado' : s < 75 ? 'alto' : 'muy_alto')
const nivelAcceso = (s: number): Nivel => (s < 25 ? 'bajo' : s < 50 ? 'moderado' : 'alto')
const fmt = (x: number, d = 0) => x.toLocaleString('es-AR', { minimumFractionDigits: d, maximumFractionDigits: d })

export function iniciarSimuladores(raiz: HTMLElement): () => void {
  const limpiezas: Array<() => void> = []
  const $ = <T extends Element = HTMLElement>(id: string) => raiz.querySelector<T>(`#${id}`)
  const entrada = (id: string) => $<HTMLInputElement>(id)
  const num = (id: string) => Number(entrada(id)?.value ?? 0)
  const valor = (id: string) => $<HTMLSelectElement | HTMLInputElement>(id)?.value ?? ''
  const marcado = (id: string) => Boolean(entrada(id)?.checked)
  const texto = (id: string, t: string) => {
    const nodo = $(id)
    if (nodo) nodo.textContent = t
  }
  const color = (token: string) => getComputedStyle(raiz).getPropertyValue(token).trim()
  const svg = (id: string) => {
    const nodo = $<SVGSVGElement>(id)
    if (nodo) nodo.replaceChildren()
    return nodo
  }
  const el = (tag: string, attrs: Record<string, string | number>, padre?: Element | null) => {
    const nodo = document.createElementNS(NS, tag)
    for (const [k, v] of Object.entries(attrs)) nodo.setAttribute(k, String(v))
    padre?.appendChild(nodo)
    return nodo
  }
  const rotulo = (padre: Element | null, x: number, y: number, t: string, attrs: Record<string, string | number> = {}) => {
    const nodo = el('text', { x, y, 'font-size': 12, fill: color('--ink'), ...attrs }, padre)
    nodo.textContent = t
    return nodo
  }
  const pastilla = (id: string, t: string, token: string) => {
    const nodo = $(id)
    if (!nodo) return
    nodo.textContent = t
    nodo.style.background = `var(${token})`
    nodo.style.color = FONDOS_CLAROS.has(token) ? 'var(--black)' : 'var(--white)'
  }
  const escuchar = (ids: string[], fn: () => void) => {
    for (const id of ids) {
      const nodo = $(id)
      if (!nodo) continue
      nodo.addEventListener('input', fn)
      nodo.addEventListener('change', fn)
      limpiezas.push(() => {
        nodo.removeEventListener('input', fn)
        nodo.removeEventListener('change', fn)
      })
    }
    fn()
  }

  // Example school used by the service-state simulator.
  const SECCIONES = [
    { id: 1, n: '1° A', t: 'm', k: 28 },
    { id: 2, n: '2° A', t: 'm', k: 25 },
    { id: 3, n: '3° A', t: 'm', k: 30 },
    { id: 4, n: '1° B', t: 't', k: 22 },
    { id: 5, n: '2° B', t: 't', k: 27 },
    { id: 6, n: '3° B', t: 't', k: 24 },
  ]

  // Service state: section > shift > school > normal.
  const declaradoPorSeccion = new Map<number, string>()
  function servicio() {
    const escuelaDeclarada = valor('sv-esc')
    const turnos: Record<string, string> = { m: valor('sv-tm'), t: valor('sv-tt') }
    const resueltas = SECCIONES.map((q) => {
      const propia = declaradoPorSeccion.get(q.id)
      const [fuente, estado] = propia
        ? ['sección', propia]
        : turnos[q.t]
          ? ['turno', turnos[q.t]]
          : escuelaDeclarada
            ? ['escuela', escuelaDeclarada]
            : ['sin declaración', 'normal']
      return { ...q, fuente, estado }
    })
    const suspendidas = resueltas.filter((r) => r.estado === 'suspendido')
    const general =
      suspendidas.length === 0 ? ['normal', '--nivel-peligro-verde'] : suspendidas.length === resueltas.length ? ['suspendido', '--nivel-peligro-rojo'] : ['parcial', '--nivel-peligro-naranja']
    pastilla('sv-b', `Servicio ${general[0]}`, general[1])
    texto('sv-s', `${suspendidas.length} de ${resueltas.length}`)
    texto('sv-a', String(suspendidas.reduce((a, r) => a + r.k, 0)))
    texto('sv-why', 'Cada sección muestra de dónde sale su estado.')
    const s = svg('sv-svg')
    if (!s) return
    resueltas.forEach((r, i) => {
      const x = 10 + i * 125
      const y = 20
      const sinClase = r.estado === 'suspendido'
      const g = el('g', { tabindex: 0, role: 'button', 'aria-label': `Cambiar estado de ${r.n}`, style: 'cursor:pointer' }, s)
      g.addEventListener('click', () => {
        const actual = declaradoPorSeccion.get(r.id)
        if (actual === undefined) declaradoPorSeccion.set(r.id, 'suspendido')
        else if (actual === 'suspendido') declaradoPorSeccion.set(r.id, 'normal')
        else declaradoPorSeccion.delete(r.id)
        servicio()
      })
      el('rect', { x, y, width: 115, height: 170, rx: 8, fill: color(sinClase ? '--danger' : '--card'), stroke: color('--line') }, g)
      const tinta = sinClase ? color('--white') : color('--ink')
      const lineas: Array<[string, number, number, number]> = [
        [r.n, 30, 14, 700],
        [r.t === 'm' ? 'mañana' : 'tarde', 50, 11.5, 400],
        [sinClase ? 'sin clase' : 'con clase', 92, 14, 700],
        [`${r.k} alumnos`, 114, 12, 400],
        [`decide: ${r.fuente}`, 150, 11, 400],
      ]
      for (const [t, dy, tam, peso] of lineas) rotulo(g, x + 57, y + dy, t, { 'text-anchor': 'middle', 'font-size': tam, 'font-weight': peso, fill: tinta })
      if (declaradoPorSeccion.has(r.id)) el('circle', { cx: x + 104, cy: y + 12, r: 5, fill: color('--marker') }, g)
    })
  }

  function redSeguridad() {
    const matricula = num('rd-m')
    const campo = entrada('rd-k')
    if (campo) campo.max = String(matricula)
    const marcados = Math.min(num('rd-k'), matricula)
    texto('rd-m-o', String(matricula))
    texto('rd-k-o', `${marcados} (${fmt((marcados / matricula) * 100)} %)`)
    if (marcados / matricula > 0.5) {
      pastilla('rd-b', 'Aviso', '--nivel-peligro-naranja')
      texto('rd-why', '«Marcó a la mayoría de los alumnos. ¿No será un problema del establecimiento?» La carga no se bloquea: el directivo decide.')
    } else {
      pastilla('rd-b', 'Sin aviso', '--nivel-peligro-verde')
      texto('rd-why', 'La proporción es compatible con un problema de acceso de parte del alumnado.')
    }
  }

  function afectacion() {
    const an = num('a-n-r')
    const bn = num('b-n-r')
    const ka = entrada('a-k-r')
    const kb = entrada('b-k-r')
    if (ka) ka.max = String(an)
    if (kb) kb.max = String(bn)
    const ak = Math.min(num('a-k-r'), an)
    const bk = Math.min(num('b-k-r'), bn)
    texto('a-n', String(an))
    texto('a-k', String(ak))
    texto('b-n', String(bn))
    texto('b-k', String(bk))
    const correcto = Math.round(((ak + bk) / (an + bn)) * 1000) / 10
    const ingenuo = ((ak / an + bk / bn) / 2) * 100
    texto('af-ok', `${fmt(correcto, 1)} %`)
    texto('af-bad', `${fmt(ingenuo, 1)} %`)
    texto('af-why', `(${ak}+${bk}) / (${an}+${bn}) = ${fmt(correcto, 1)} %. El promedio de porcentajes sobrerrepresenta al departamento más chico.`)
  }

  // Provisional rain thresholds (mm): yellow, orange, red.
  const PROVISORIOS: Record<string, [number, number, number]> = { 24: [50, 80, 120], 72: [80, 120, 180], 240: [120, 180, 270] }
  function graficoUmbrales() {
    const s = svg('chart-umbrales')
    if (!s) return
    const W = 640
    const y0 = 220
    const sy = (v: number) => y0 - (v / 300) * 190
    for (const v of [0, 100, 200, 300]) {
      el('line', { x1: 70, x2: W - 10, y1: sy(v), y2: sy(v), stroke: color('--line') }, s)
      rotulo(s, 60, sy(v) + 4, `${v} mm`, { 'text-anchor': 'end', 'font-size': 11, fill: color('--ink-soft') })
    }
    const colores = COLORES_NIVEL_ORDEN.slice(1)
    Object.entries(PROVISORIOS).forEach(([h, umbrales], i) => {
      const cx = 110 + i * 180
      umbrales.forEach((v, j) => {
        el('rect', { x: cx + j * 42, y: sy(v), width: 34, height: y0 - sy(v), rx: 3, fill: color(colores[j]) }, s)
        rotulo(s, cx + j * 42 + 17, sy(v) - 6, String(v), { 'text-anchor': 'middle', 'font-size': 11 })
      })
      rotulo(s, cx + 59, y0 + 22, `${h} h`, { 'text-anchor': 'middle', 'font-size': 13, 'font-weight': 700 })
    })
    ;['amarillo', 'naranja', 'rojo'].forEach((n, j) => {
      el('rect', { x: W - 260 + j * 84, y: 8, width: 12, height: 12, rx: 2, fill: color(colores[j]) }, s)
      rotulo(s, W - 244 + j * 84, 18, n)
    })
    rotulo(s, 70, 16, '240 h = 72 h × 1,5', { 'font-size': 11, fill: color('--ink-soft') })
  }

  function lluvia() {
    const h = valor('ll-h')
    const mm = num('ll-mm')
    const provisorio = valor('ll-m') === 'prov'
    texto('ll-mm-o', `${mm} mm`)
    const u = provisorio ? PROVISORIOS[h] : [60, 90, 140]
    const [nombre, token] =
      mm > u[2] ? ['Rojo', '--nivel-peligro-rojo'] : mm > u[1] ? ['Naranja', '--nivel-peligro-naranja'] : mm > u[0] ? ['Amarillo', '--nivel-peligro-amarillo'] : ['Verde', '--nivel-peligro-verde']
    pastilla('ll-b', nombre, token)
    texto('ll-why', `Umbrales: ${u.join(' / ')} mm (amarillo / naranja / rojo).${provisorio ? ' Provisorio: la confianza baja un escalón.' : ''}`)
  }

  // Risk engine: missing components redistribute their weight.
  type Componente = { n: string; w: number; x: number; on: boolean }
  const cerrar = (items: Componente[]) => {
    const presentes = items.filter((i) => i.on)
    const suma = presentes.reduce((a, i) => a + i.w, 0)
    if (!suma) return { v: null, p: [] as Array<Componente & { wn: number }> }
    return { v: presentes.reduce((a, i) => a + (i.w / suma) * i.x, 0), p: presentes.map((i) => ({ ...i, wn: i.w / suma })) }
  }
  let ultimo: [number | null, number] = [null, 0]
  function riesgo() {
    const ll = num('r-ll')
    const n = num('r-n')
    const h = num('r-h')
    const c = num('r-c')
    const su = num('r-su')
    texto('r-ll-o', `${ll} mm`)
    texto('r-n-o', String(n))
    texto('r-h-o', `${h} h`)
    texto('r-c-o', String(c))
    texto('r-su-o', String(su))
    const A = cerrar([
      { n: 'Peligro en celda', w: 0.5, x: Number(valor('r-pc')), on: marcado('r-pc-on') },
      { n: 'Caudal', w: 0.3, x: Number(valor('r-cq')), on: marcado('r-cq-on') },
      { n: 'Lluvia ya caída', w: 0.2, x: Math.min(100, (ll / 150) * 100), on: marcado('r-ll-on') },
    ])
    const historial = (Math.min(100, (n / 5) * 100) + Math.min(100, (h / 720) * 100) + Math.min(100, (c / 3) * 100)) / 3
    const V = cerrar([
      { n: 'Historial', w: 0.7, x: historial, on: true },
      { n: 'Susceptibilidad', w: 0.3, x: su, on: marcado('r-su-on') },
    ])
    const vulnerabilidad = V.v ?? 0
    const faltantes = ['r-pc-on', 'r-cq-on', 'r-ll-on', 'r-su-on'].filter((i) => !marcado(i)).length
    texto('r-A', A.v === null ? '—' : fmt(A.v))
    texto('r-V', fmt(vulnerabilidad))
    if (A.v === null) {
      texto('r-R', '—')
      pastilla('r-b', 'Sin evidencia', '--nivel-peligro-sin-dato')
      texto('r-conf', 'Confianza baja: no hay ningún dato de amenaza.')
    } else {
      const R = Math.max(0, Math.min(100, Math.round((A.v * vulnerabilidad) / 100)))
      const l = nivelRiesgo(R)
      texto('r-R', String(R))
      pastilla('r-b', NOMBRE_NIVEL[l], COLOR_NIVEL[l])
      const confianza = faltantes === 0 ? 'alta' : faltantes <= 1 ? 'media' : 'baja'
      texto('r-conf', `Confianza ${confianza} (${faltantes} componente${faltantes === 1 ? '' : 's'} faltante${faltantes === 1 ? '' : 's'}).`)
    }
    ultimo = [A.v, vulnerabilidad]
    const pesos = $('r-weights')
    if (pesos) {
      pesos.replaceChildren()
      const titulo = document.createElement('div')
      titulo.className = 'why'
      titulo.textContent = 'Pesos efectivos después de redistribuir'
      pesos.appendChild(titulo)
      for (const p of [...A.p.map((p) => ({ ...p, d: 'A' })), ...V.p.map((p) => ({ ...p, d: 'V' }))]) {
        const fila = document.createElement('div')
        fila.className = 'row'
        const nombre = document.createElement('span')
        nombre.textContent = `${p.d} · ${p.n}`
        const barra = document.createElement('div')
        barra.className = 'bar'
        const relleno = document.createElement('i')
        relleno.style.width = `${p.wn * 100}%`
        barra.appendChild(relleno)
        const cifra = document.createElement('span')
        cifra.className = 'mono'
        cifra.textContent = `${fmt(p.wn * 100)}%`
        fila.append(nombre, barra, cifra)
        pesos.appendChild(fila)
      }
    }
    superficie()
  }

  function superficie() {
    const lienzo = $<HTMLCanvasElement>('heat')
    const x = lienzo?.getContext('2d')
    if (!lienzo || !x) return
    const W = lienzo.width
    const H = lienzo.height
    const p = 44
    const w = W - p - 10
    const h = H - p - 10
    x.clearRect(0, 0, W, H)
    const colores = COLORES_NIVEL_ORDEN.map(color)
    for (let i = 0; i < 100; i++) {
      for (let j = 0; j < 100; j++) {
        const r = Math.round((i * j) / 100)
        x.fillStyle = colores[r < 25 ? 0 : r < 50 ? 1 : r < 75 ? 2 : 3]
        x.globalAlpha = 0.25 + (0.6 * r) / 100
        x.fillRect(p + (i * w) / 100, 10 + h - ((j + 1) * h) / 100, w / 100 + 1, h / 100 + 1)
      }
    }
    x.globalAlpha = 1
    x.strokeStyle = color('--ink')
    x.lineWidth = 1.2
    for (const k of [25, 50, 75]) {
      x.beginPath()
      for (let a = k; a <= 100; a += 0.5) {
        const v = (k * 100) / a
        if (v > 100) continue
        const px = p + (a / 100) * w
        const py = 10 + h - (v / 100) * h
        if (a === k) x.moveTo(px, py)
        else x.lineTo(px, py)
      }
      x.stroke()
    }
    x.fillStyle = color('--ink')
    x.font = `12px ${getComputedStyle(raiz).fontFamily}`
    x.fillText('Amenaza →', p + w - 70, H - 12)
    x.save()
    x.translate(14, 80)
    x.rotate(-Math.PI / 2)
    x.fillText('Vulnerabilidad →', -60, 0)
    x.restore()
    for (const k of [25, 50, 75]) x.fillText(`R=${k}`, p + w - 46, 10 + h - (k / 100) * h - 4)
    const [a, v] = ultimo
    if (a !== null) {
      x.beginPath()
      x.arc(p + (a / 100) * w, 10 + h - (v / 100) * h, 8, 0, 7)
      x.fillStyle = color('--card')
      x.fill()
      x.lineWidth = 3
      x.strokeStyle = color('--ink')
      x.stroke()
    }
  }

  function exposicion() {
    const s = svg('expo-svg')
    if (!s) return
    const escuelas: Array<[string, number, number]> = [['Rural A', 62, 15], ['Urbana B', 38, 600], ['Rural C', 81, 40], ['Periurbana D', 47, 320], ['Urbana E', 22, 450], ['Rural F', 55, 90]]
    const sx = (v: number) => 60 + (v / 100) * 660
    ;[[0, 25], [25, 50], [50, 75], [75, 100]].forEach(([a, b], i) => el('rect', { x: sx(a), y: 20, width: sx(b) - sx(a), height: 180, fill: color(COLORES_NIVEL_ORDEN[i]), opacity: 0.14 }, s))
    for (const v of [0, 25, 50, 75, 100]) rotulo(s, sx(v), 222, String(v), { 'text-anchor': 'middle', 'font-size': 11, fill: color('--ink-soft') })
    rotulo(s, 390, 238, 'Riesgo estimado', { 'text-anchor': 'middle', 'font-size': 11.5 })
    escuelas.forEach(([n, r, m], i) => {
      const y = 60 + (i % 3) * 55
      el('circle', { cx: sx(r), cy: y, r: 4 + Math.sqrt(m) * 1.6, fill: color('--info'), opacity: 0.3, stroke: color('--info') }, s)
      rotulo(s, sx(r), y + 4, `${n} · ${m}`, { 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 700 })
    })
  }

  function graficoFactores() {
    const s = svg('chart-factor')
    if (!s) return
    const datos: Array<[string, number]> = [['autopista / troncal / primaria', 1], ['secundaria', 1.2], ['terciaria', 1.5], ['vecinal / residencial', 2], ['huella / servicio', 3], ['tierra (×1,5) sobre vecinal', 3]]
    datos.forEach(([n, v], i) => {
      const y = 14 + i * 38
      rotulo(s, 0, y + 15, n, { 'font-size': 12.5 })
      el('rect', { x: 230, y, width: (v / 3) * 370, height: 22, rx: 3, fill: color(i === 5 ? '--ochre' : '--accent'), opacity: i === 5 ? 0.8 : 0.25 + v / 4 }, s)
      rotulo(s, 236 + (v / 3) * 370, y + 16, `× ${fmt(v, 1)}`)
    })
  }

  // Isolation decision tree, evaluated in order: first rule that applies wins.
  function aislamiento() {
    const vados = num('i-v')
    const alternativaSinCruce = marcado('i-alt')
    const alternativaPavimentada = marcado('i-altp')
    const dp = num('i-dp')
    const dl = num('i-dl')
    const km = num('i-km')
    texto('i-v-o', String(vados))
    texto('i-dp-o', `${fmt(dp / 1000, 1)} km`)
    texto('i-dl-o', `${fmt(dl / 1000, 1)} km`)
    texto('i-km-o', `${fmt(km, 1)} km`)
    const reglas: Array<[string, () => number | null]> = [
      ['Hay vados en la ruta → nivel 2 con alternativa sin cruce, nivel 3 sin ella', () => (vados > 0 ? (alternativaSinCruce ? 2 : 3) : null)],
      ['La localidad está a más de 30 km → nivel 3', () => (dl > 30000 ? 3 : null)],
      ['15 km o más sin pavimentar y sin alternativa pavimentada → nivel 2', () => (km >= 15 && !alternativaPavimentada ? 2 : null)],
      ['Pavimento a 2 km o menos, localidad a 10 km o menos y 2 km o menos sin pavimentar → nivel 0', () => (dp <= 2000 && dl <= 10000 && km <= 2 ? 0 : null)],
      ['En cualquier otro caso → nivel 1', () => 1],
    ]
    let resultado = 1
    let indice = reglas.length - 1
    for (let i = 0; i < reglas.length; i++) {
      const r = reglas[i][1]()
      if (r !== null) {
        resultado = r
        indice = i
        break
      }
    }
    const lista = $('i-rules')
    if (lista) {
      lista.replaceChildren(
        ...reglas.map(([t], i) => {
          const li = document.createElement('li')
          li.textContent = t
          li.className = i === indice ? 'regla--decide' : i < indice ? 'regla--descartada' : 'regla--pendiente'
          return li
        }),
      )
    }
    pastilla('i-b', `Nivel ${resultado}`, COLORES_NIVEL_ORDEN[resultado])
    texto('i-why', ['Bien conectada.', 'Conexión con dificultades moderadas.', 'Acceso difícil o dependiente de un cruce.', 'Muy aislada.'][resultado])
    const selector = $<HTMLSelectElement>('c-n')
    if (selector) selector.value = String(resultado)
    acceso()
  }

  // Access rule v1: base by isolation level plus additive aggravating factors.
  function acceso() {
    const nivel = Number(valor('c-n'))
    const alternativa = valor('c-al') as 'si' | 'no' | 'nd'
    const items: Array<[string, number, string]> = [
      [`Base (nivel ${nivel})`, [0, 20, 45, 70][nivel], '--accent'],
      ['Cruce sin puente confirmado', marcado('c-cr') ? 25 : 0, '--info'],
      ['Peligro naranja o rojo', marcado('c-pa') ? 25 : 0, '--nivel-peligro-naranja'],
      [`Alternativa ${{ si: 'existe', no: 'no existe', nd: 'desconocida' }[alternativa]}`, { si: 0, no: 15, nd: 20 }[alternativa], '--nivel-peligro-amarillo'],
      ['Acceso interrumpido antes', marcado('c-hi') ? 15 : 0, '--nivel-peligro-rojo'],
    ]
    const bruto = items.reduce((a, i) => a + i[1], 0)
    const puntaje = Math.min(100, bruto)
    const cascada = $('c-wf')
    if (cascada) {
      cascada.replaceChildren()
      let acumulado = 0
      for (const [t, v, token] of items) {
        const izquierda = Math.min(acumulado, 100)
        acumulado += v
        const fila = document.createElement('div')
        fila.className = 'row'
        const nombre = document.createElement('span')
        nombre.textContent = t
        const pista = document.createElement('div')
        pista.className = 'pista'
        const segmento = document.createElement('div')
        segmento.className = 'seg'
        segmento.style.left = `${izquierda}%`
        segmento.style.width = `${Math.max(0, Math.min(v, 100 - izquierda))}%`
        segmento.style.background = `var(${token})`
        pista.appendChild(segmento)
        const cifra = document.createElement('span')
        cifra.className = 'mono'
        cifra.textContent = `+${v}`
        fila.append(nombre, pista, cifra)
        cascada.appendChild(fila)
      }
      if (bruto > 100) {
        const nota = document.createElement('div')
        nota.className = 'why'
        nota.textContent = `Suma ${bruto}, se recorta a 100.`
        cascada.appendChild(nota)
      }
    }
    texto('c-s', String(puntaje))
    const l = nivelAcceso(puntaje)
    pastilla('c-b', NOMBRE_NIVEL[l], COLOR_NIVEL[l])
  }

  function periodoRetorno() {
    const T = Number(valor('t-T'))
    const n = num('t-n')
    texto('t-n-o', String(n))
    texto('t-p', `${fmt((1 - Math.pow(1 - 1 / T, n)) * 100, 1)} %`)
    texto('t-why', `Probabilidad de al menos una crecida de ${T} años en ${n} años.`)
  }

  // Flood class: depth >= 0.15 m and negative ground margin; shortest return period wins.
  const CRECIDA_RIO: Record<number, number> = { 10: 1.5, 100: 2.8, 500: 3.6 }
  function inundacion() {
    const z = num('u-z')
    const d: Record<number, number> = { 10: num('u-d10'), 100: num('u-d100'), 500: num('u-d500') }
    texto('u-z-o', `${fmt(z, 1)} m`)
    for (const t of [10, 100, 500]) texto(`u-d${t}-o`, `${fmt(d[t], 2)} m`)
    const margen = (t: number) => z - CRECIDA_RIO[t]
    const alcanza = (t: number) => d[t] >= 0.15 && margen(t) < 0
    const permanente = d[10] > 0 && d[10] === d[100] && d[100] === d[500]
    const [clase, token] = permanente
      ? ['Sin riesgo (agua permanente)', '--nivel-peligro-verde']
      : alcanza(10)
        ? ['Alto', '--nivel-peligro-rojo']
        : alcanza(100)
          ? ['Medio', '--nivel-peligro-naranja']
          : alcanza(500)
            ? ['Bajo', '--nivel-peligro-amarillo']
            : ['Sin riesgo', '--nivel-peligro-verde']
    pastilla('u-b', clase, token)
    texto('u-why', [10, 100, 500].map((t) => `${t} años: profundidad ${fmt(d[t], 2)} m, margen ${fmt(margen(t), 1)} m → ${alcanza(t) ? 'alcanza' : 'no alcanza'}`).join(' · '))
    const s = svg('u-svg')
    if (!s) return
    const sy = (v: number) => 220 - v * 24
    el('rect', { x: 0, y: 0, width: 760, height: 260, fill: color('--fill'), rx: 8 }, s)
    for (const [t, o] of [[500, 0.18], [100, 0.28], [10, 0.4]] as const) {
      el('rect', { x: 0, y: sy(CRECIDA_RIO[t]), width: 760, height: 220 - sy(CRECIDA_RIO[t]), fill: color('--info'), opacity: o }, s)
      rotulo(s, 8, sy(CRECIDA_RIO[t]) - 4, `nivel crecida ${t} años (+${fmt(CRECIDA_RIO[t], 1)} m)`, { 'font-size': 11, fill: color('--info') })
    }
    el('path', { d: `M0 260 L0 ${sy(z + 1)} L120 ${sy(z)} L400 ${sy(z)} L470 ${sy(0.6)} L520 ${sy(-0.4)} L600 ${sy(-0.4)} L650 ${sy(0.6)} L760 ${sy(1.5)} L760 260 Z`, fill: color('--warn-tint'), stroke: color('--ochre'), 'stroke-width': 2 }, s)
    el('rect', { x: 520, y: sy(0), width: 80, height: sy(-0.4) - sy(0), fill: color('--info') }, s)
    rotulo(s, 530, sy(-0.4) + 16, 'río', { 'font-size': 11 })
    el('rect', { x: 230, y: sy(z) - 34, width: 46, height: 34, fill: color('--accent'), rx: 2 }, s)
    el('path', { d: `M224 ${sy(z) - 34} L253 ${sy(z) - 54} L282 ${sy(z) - 34}Z`, fill: color('--accent') }, s)
    rotulo(s, 226, sy(z) + 18, 'escuela', { 'font-weight': 700 })
    el('line', { x1: 300, x2: 300, y1: sy(0), y2: sy(z), stroke: color('--ink'), 'stroke-dasharray': '3 3' }, s)
    rotulo(s, 306, (sy(0) + sy(z)) / 2, `+${fmt(z, 1)} m`, { 'font-size': 11 })
  }

  // One illustrative day of IMERG half-hour granules; coverage below 80 % means no data.
  const REGISTROS = Array.from({ length: 48 }, (_, i) => {
    const t = i / 47
    return Math.max(0, Number((6 * Math.exp(-((t - 0.55) ** 2) / 0.012) + 1.2 * Math.exp(-((t - 0.2) ** 2) / 0.004)).toFixed(1)))
  })
  const faltantes = new Set<number>()
  function cobertura() {
    const s = svg('cob-svg')
    if (!s) return
    const bw = 760 / 48
    REGISTROS.forEach((v, i) => {
      const falta = faltantes.has(i)
      const h = Math.max(2, (v / 6.5) * 120)
      const r = el('rect', { x: i * bw + 1, y: falta ? 20 : 140 - h, width: bw - 2, height: falta ? 120 : h, rx: 1, fill: color(falta ? '--line' : '--info'), opacity: falta ? 0.6 : 0.85 }, s)
      r.addEventListener('click', () => {
        if (faltantes.has(i)) faltantes.delete(i)
        else faltantes.add(i)
        cobertura()
      })
    })
    for (const i of [0, 12, 24, 36, 47]) rotulo(s, i * bw + bw / 2, 160, `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`, { 'text-anchor': 'middle', 'font-size': 11, fill: color('--ink-soft') })
    const n = 48 - faltantes.size
    const mm = REGISTROS.reduce((a, v, i) => a + (faltantes.has(i) ? 0 : v), 0)
    texto('cob-p', `${fmt((n / 48) * 100)} %`)
    if (n / 48 >= 0.8) {
      texto('cob-mm', `${fmt(mm, 1)} mm`)
      texto('cob-why', `${n} de 48 registros: suficiente para publicar el acumulado.`)
    } else {
      texto('cob-mm', 'sin dato')
      texto('cob-why', `Solo ${n} de 48 registros: la cifra (${fmt(mm, 1)} mm) subestimaría la lluvia, así que no se publica.`)
    }
  }

  function verificacion() {
    const h = num('v-h')
    const m = num('v-m')
    const f = num('v-f')
    texto('v-h-o', String(h))
    texto('v-m-o', String(m))
    texto('v-f-o', String(f))
    const eventos = h + m
    if (eventos < 5) {
      texto('v-pod', '—')
      texto('v-far', '—')
      texto('v-why', `Solo ${eventos} eventos de lluvia (se necesitan 5): muestra insuficiente, no se publican métricas.`)
      return
    }
    texto('v-pod', `${fmt((h / eventos) * 100)} %`)
    texto('v-far', `${fmt(h + f ? (f / (h + f)) * 100 : 0)} %`)
    texto('v-why', `De ${eventos} días con 10 mm o más, el pronóstico anticipó ${h}. De ${h + f} avisos, ${f} no se cumplieron.`)
  }

  function linaje() {
    const g = raiz.querySelector('#lin-src')
    if (!g) return
    g.replaceChildren()
    const fuentes: Array<[string, number]> = [['Parte de la escuela', 60], ['Padrón (Gestión Educativa)', 105], ['Open-Meteo pronóstico', 150], ['ERA5 climatología', 195], ['NASA GPM IMERG', 240], ['OpenStreetMap', 285], ['JRC crecidas de río', 330], ['JRC Surface Water', 370], ['Copernicus DEM', 410]]
    const procesos: Array<[string, number]> = [['Partes vigentes', 70], ['Nivel por percentil', 170], ['Motor de riesgo', 225], ['Ruteo y árbol de decisión', 285], ['Clase y margen', 360]]
    const salidas: Array<[string, number]> = [['Continuidad pedagógica', 70], ['Peligro por lluvia', 140], ['Riesgo estimado', 200], ['Aislamiento vial', 260], ['Riesgo de acceso', 300], ['Inundación', 360]]
    const enlaces = [[0, 0], [1, 0], [2, 1], [3, 1], [4, 2], [4, 1], [5, 3], [6, 4], [7, 4], [8, 4], [8, 3]]
    const enlaces2 = [[0, 0], [1, 1], [1, 2], [2, 2], [3, 3], [3, 4], [2, 4], [4, 5]]
    for (const [a, b] of enlaces) el('path', { d: `M230 ${fuentes[a][1]} C 290 ${fuentes[a][1]}, 290 ${procesos[b][1]}, 345 ${procesos[b][1]}`, stroke: color('--line'), 'stroke-width': 2, fill: 'none', 'marker-end': 'url(#ar)' }, g)
    for (const [a, b] of enlaces2) el('path', { d: `M560 ${procesos[a][1]} C 620 ${procesos[a][1]}, 620 ${salidas[b][1]}, 675 ${salidas[b][1]}`, stroke: color('--accent'), 'stroke-width': 2, fill: 'none', opacity: 0.6, 'marker-end': 'url(#ar)' }, g)
    const caja = (x: number, y: number, w: number, t: string, fill: string, stroke: string) => {
      el('rect', { x, y: y - 15, width: w, height: 30, rx: 6, fill, stroke, 'stroke-width': 1 }, g)
      rotulo(g, x + 10, y + 5, t, { 'font-size': 12.5 })
    }
    for (const [t, y] of fuentes) caja(20, y, 210, t, color('--fill'), color('--line'))
    for (const [t, y] of procesos) caja(345, y, 215, t, color('--card'), color('--line'))
    for (const [t, y] of salidas) caja(675, y, 190, t, color('--accent-tint'), color('--accent'))
  }

  // In-page navigation keeps the tab hash: `#metodologia/<id>`.
  function irA(id: string, comportamiento: ScrollBehavior) {
    const destino = raiz.querySelector<HTMLElement>(`#${CSS.escape(id)}`)
    if (!destino) return
    destino.scrollIntoView({ block: 'start', behavior: comportamiento })
    destino.classList.add('metodologia-seccion--destacada')
  }
  const alClic = (evento: MouseEvent) => {
    const enlace = (evento.target as Element | null)?.closest<HTMLAnchorElement>('a[href^="#metodologia/"]')
    if (!enlace) return
    evento.preventDefault()
    const id = enlace.getAttribute('href')!.split('/')[1]
    history.replaceState(null, '', `#metodologia/${id}`)
    irA(id, 'smooth')
  }
  raiz.addEventListener('click', alClic)
  limpiezas.push(() => raiz.removeEventListener('click', alClic))
  const seguirHash = (comportamiento: ScrollBehavior) => {
    const [pestana, id] = window.location.hash.slice(1).split('/')
    if (pestana === 'metodologia' && id) irA(id, comportamiento)
  }
  const alCambiarHash = () => seguirHash('smooth')
  window.addEventListener('hashchange', alCambiarHash)
  limpiezas.push(() => window.removeEventListener('hashchange', alCambiarHash))
  seguirHash('auto')

  // Table of contents follows the reading position inside the tab's scroll panel.
  const enlacesIndice = [...raiz.querySelectorAll<HTMLAnchorElement>('.toc a')]
  const contenedor = raiz.closest<HTMLElement>('.mapa-pestana-panel--scroll')
  if ('IntersectionObserver' in window) {
    const observador = new IntersectionObserver(
      (entradas) => {
        for (const e of entradas) {
          if (!e.isIntersecting) continue
          for (const l of enlacesIndice) l.classList.toggle('on', l.getAttribute('href') === `#metodologia/${e.target.id}`)
        }
      },
      { root: contenedor, rootMargin: '-30% 0px -60% 0px' },
    )
    raiz.querySelectorAll('.metodologia__portada, section').forEach((s) => observador.observe(s))
    limpiezas.push(() => observador.disconnect())
  }

  const redibujar = () => {
    linaje()
    graficoUmbrales()
    graficoFactores()
    servicio()
    exposicion()
    cobertura()
    superficie()
    inundacion()
  }
  escuchar(['sv-esc', 'sv-tm', 'sv-tt'], servicio)
  escuchar(['rd-m', 'rd-k'], redSeguridad)
  escuchar(['v-h', 'v-m', 'v-f'], verificacion)
  escuchar(['a-n-r', 'a-k-r', 'b-n-r', 'b-k-r'], afectacion)
  escuchar(['ll-h', 'll-mm', 'll-m'], lluvia)
  escuchar(['r-pc', 'r-pc-on', 'r-cq', 'r-cq-on', 'r-ll', 'r-ll-on', 'r-n', 'r-h', 'r-c', 'r-su', 'r-su-on'], riesgo)
  escuchar(['c-n', 'c-cr', 'c-pa', 'c-hi', 'c-al'], acceso)
  escuchar(['i-v', 'i-alt', 'i-altp', 'i-dp', 'i-dl', 'i-km'], aislamiento)
  escuchar(['t-T', 't-n'], periodoRetorno)
  escuchar(['u-z', 'u-d10', 'u-d100', 'u-d500'], inundacion)
  redibujar()

  // Redraw SVG/canvas colours when the site theme flips.
  const tema = new MutationObserver(redibujar)
  tema.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  limpiezas.push(() => tema.disconnect())

  return () => {
    for (const limpiar of limpiezas) limpiar()
  }
}
