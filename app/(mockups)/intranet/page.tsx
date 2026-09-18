/**
 * MOCKUP — Intranet del Ministerio de Educación (propuesta de landing).
 *
 * Static proposal: no data source, no client state, no navigation contract.
 * It exists to be looked at and argued about, so everything it needs lives in
 * this one file — including its own styles, which are prefixed `intra-` and
 * added here rather than in `globals.css` so the mockup can be deleted or
 * rewritten without touching the production visual system.
 *
 * It reuses the system's own classes (`app-ribbon`, `app-signature`,
 * `page-stack`, `section`, `browse-card`, `badge`, `chip`, `app-footer`) and
 * only its tokens for anything new: same palette, same flat surfaces, same
 * Barlow scale, same monoline illustrations as `components/marcas-tematicas`.
 */

import type { Metadata } from 'next'
import { MarcaCompacta, MarcaHorizontal, MarcaHorizontalInversa } from '@/components/marca'

export const metadata: Metadata = {
  title: 'Intranet · Propuesta',
  description:
    'Propuesta de landing para la intranet del Ministerio de Educación de Corrientes: acceso único a los sistemas de gestión.',
}

/* ── Ilustraciones ──────────────────────────────────────────────────────────
   Same construction as the browse illustrations: 48px frame, one monoline
   weight, rounded caps, geometric shapes, one solid palette colour per piece
   and `currentColor` for the rest so each drawing takes the card's ink. */

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <svg
      className="marca-tematica"
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
    >
      {children}
    </svg>
  )
}

/** POF — an organisational chart: one post at the top, the posts it opens below. */
function MarcaPof() {
  return (
    <Frame>
      <rect x="17" y="6.5" width="14" height="10" rx="1.5" fill="var(--sky-dark)" stroke="none" />
      <path d="M24 16.5v6.5" />
      <path d="M10 31v-4.5h28V31" />
      <path d="M24 23v8" />
      <rect x="4" y="31" width="12" height="10" rx="1.5" />
      <rect x="18" y="31" width="12" height="10" rx="1.5" />
      <rect x="32" y="31" width="12" height="10" rx="1.5" />
    </Frame>
  )
}

/** Gestión Educativa — a filed proceeding: ruled entries, the settled one ticked. */
function MarcaGestion() {
  return (
    <Frame>
      <path d="M13 9.5h-4a2 2 0 0 0-2 2V39a2 2 0 0 0 2 2h30a2 2 0 0 0 2-2V11.5a2 2 0 0 0-2-2h-4" />
      <rect x="15" y="6" width="18" height="7" rx="1.5" />
      <path d="M14 22.5h20M14 29h20M14 35.5h12" />
      <path
        d="M31 33.5l3.5 3.5 6.5-7"
        stroke="var(--green-dark)"
        fill="none"
      />
    </Frame>
  )
}

/** Expedientes — a foliated file: the cover, its tab, and the sheets inside. */
function MarcaExpedientes() {
  return (
    <Frame>
      <path d="M5 38V12a2 2 0 0 1 2-2h11l4 5h19a2 2 0 0 1 2 2v21a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z" />
      {/* The tab is the one solid mass: where the file number is written. */}
      <path d="M5 12a2 2 0 0 1 2-2h11l4 5H5z" fill="var(--red)" stroke="none" />
      <path d="M14 24.5h20M14 31h13" />
    </Frame>
  )
}

/** Hub de Datos — a panel and the series it tracks; the line draws itself once. */
function MarcaHub() {
  return (
    <Frame>
      <rect x="6" y="8" width="36" height="32" rx="2.5" />
      <path d="M6 15h36" />
      <path
        className="marca-tematica__trazo"
        d="M12 33l8-7 7 4.5 9-11.5"
        pathLength={100}
      />
      <circle cx="36" cy="19" r="2.6" fill="var(--yellow)" stroke="none" />
    </Frame>
  )
}

/** Placeholder for a service not yet incorporated. */
function MarcaProximo() {
  return (
    <Frame>
      <rect x="7" y="7" width="34" height="34" rx="2.5" strokeDasharray="5 4" />
      <path d="M24 17v14M17 24h14" />
    </Frame>
  )
}

/* ── Contenido ──────────────────────────────────────────────────────────── */

type Servicio = {
  nombre: string
  descripcion: string
  dominio: string
  href: string
  estado: 'disponible' | 'mantenimiento' | 'proximamente'
  responsable: string
  marca: () => React.JSX.Element
}

const SERVICIOS: Servicio[] = [
  {
    nombre: 'POF',
    descripcion:
      'Planta Orgánica Funcional: cargos, horas cátedra, coberturas y situación de revista de cada establecimiento.',
    dominio: 'pof.mec.gob.ar',
    href: '#',
    estado: 'disponible',
    responsable: 'Dirección de Gestión Escolar',
    marca: MarcaPof,
  },
  {
    nombre: 'Gestión Educativa',
    descripcion:
      'Legajo del establecimiento, matrícula, movimientos de personal y trámites de la gestión escolar.',
    dominio: 'gestion.mec.gob.ar',
    href: '#',
    estado: 'disponible',
    responsable: 'Dirección de Gestión Escolar',
    marca: MarcaGestion,
  },
  {
    nombre: 'Sistema de Expedientes Provinciales',
    descripcion:
      'Inicio, caratulación y seguimiento de expedientes en el sistema de la Provincia de Corrientes.',
    dominio: 'expedientes.corrientes.gob.ar',
    href: '#',
    estado: 'disponible',
    responsable: 'Provincia de Corrientes',
    marca: MarcaExpedientes,
  },
  {
    nombre: 'Hub de Datos',
    descripcion:
      'Reportes, tableros y mapas del sistema educativo provincial para el análisis y la toma de decisiones.',
    dominio: 'analisis.sistemas.mec.gob.ar',
    href: 'https://analisis.sistemas.mec.gob.ar',
    estado: 'disponible',
    responsable: 'Dirección de Sistemas del Ministerio de Educación',
    marca: MarcaHub,
  },
]

const ESTADO_BADGE: Record<Servicio['estado'], { clase: string; texto: string }> = {
  disponible: { clase: 'badge badge--success', texto: 'En servicio' },
  mantenimiento: { clase: 'badge badge--warning', texto: 'En mantenimiento' },
  proximamente: { clase: 'badge badge--neutral', texto: 'En incorporación' },
}

const ACCESOS = [
  'Mesa de ayuda',
  'Recuperar contraseña',
  'Solicitar un usuario',
  'Manuales de uso',
  'Estado de los servicios',
  'Contacto de la Dirección de Sistemas',
]

const NOVEDADES = [
  {
    fecha: '15 de septiembre',
    titulo: 'Acceso único para POF y Gestión Educativa',
    detalle:
      'Una sola cuenta institucional habilita los dos sistemas. Las contraseñas anteriores dejan de usarse.',
  },
  {
    fecha: '2 de septiembre',
    titulo: 'Hub de Datos: mapas de infraestructura escolar',
    detalle:
      'Se publicaron los mapas de establecimientos con su estado edilicio y las problemáticas informadas.',
  },
  {
    fecha: '21 de agosto',
    titulo: 'Expedientes: nueva guía de caratulación',
    detalle:
      'Actualización de la guía para iniciar expedientes de infraestructura y de personal docente.',
  },
]

function ServicioCard({ servicio }: { servicio: Servicio }) {
  const { marca: Marca, estado } = servicio
  const badge = ESTADO_BADGE[estado]
  return (
    <a className="browse-card intra-card" href={servicio.href}>
      <span className="browse-card__marca">
        <Marca />
      </span>
      <span className="intra-card__head">
        <span className="browse-card__name">{servicio.nombre}</span>
        <span className={badge.clase}>{badge.texto}</span>
      </span>
      <span className="browse-card__note">{servicio.descripcion}</span>
      <span className="browse-card__count intra-card__foot">
        <span className="intra-card__dominio">{servicio.dominio}</span>
        <span className="intra-card__responsable">{servicio.responsable}</span>
      </span>
    </a>
  )
}

export default function IntranetMockupPage() {
  return (
    <div className="intra-page">
      <style>{CSS}</style>

      <a href="#contenido" className="skip-link">
        Ir al contenido
      </a>

      <header className="app-header">
        <div className="app-ribbon" aria-hidden>
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>

        <div className="app-signature">
          <div className="app-signature__inner">
            <MarcaHorizontal />
            <MarcaHorizontalInversa />
            <MarcaCompacta />
            <span className="app-signature__aside">
              Provincia de Corrientes
              <br />
              República Argentina
            </span>
          </div>
        </div>

        <div className="app-header__band">
          <div className="app-header__inner">
            <span className="app-brand">
              <span className="app-brand__text">Intranet</span>
            </span>
            <nav className="app-nav" aria-label="Navegación principal">
              <a href="#contenido" aria-current="page">
                Inicio
              </a>
              <a href="#sistemas">Sistemas</a>
              <a href="#novedades">Novedades</a>
              <a href="#ayuda">Ayuda</a>
            </nav>
            <div className="app-actions">
              <span className="intra-cuenta">Cuenta institucional</span>
            </div>
          </div>
        </div>
      </header>

      <main id="contenido" className="app-content">
        <div className="page-stack">
          <header className="hero intra-hero">
            <div className="hero__lead">
              <h1 className="page-title">Dirección de Sistemas del Ministerio de Educación</h1>
              <p className="page-intro">
                Punto de acceso único a los sistemas de gestión del Ministerio. Una sola
                cuenta institucional, un solo lugar donde encontrarlos y saber si están
                en servicio.
              </p>
              <form className="hero-search" role="search" action="#sistemas">
                <label className="hero-search__label" htmlFor="intra-search">
                  Buscar un sistema o un trámite
                </label>
                <div className="hero-search__line">
                  <input
                    id="intra-search"
                    className="intra-input"
                    type="search"
                    placeholder="POF, expedientes, matrícula…"
                  />
                  <span className="ui-button ui-button--default">Buscar</span>
                </div>
              </form>
            </div>

          </header>

          <section className="section" id="sistemas">
            <div className="section-head">
              <h2>Sistemas</h2>
              <span className="section-head__count">4 en servicio</span>
            </div>
            <div className="card-grid card-grid--wide">
              {SERVICIOS.map((servicio) => (
                <ServicioCard key={servicio.nombre} servicio={servicio} />
              ))}

              {/* The list is open by design: the placeholder says so on the page
                  instead of leaving the grid to end without explanation. */}
              <div className="browse-card intra-card intra-card--proximo">
                <span className="browse-card__marca">
                  <MarcaProximo />
                </span>
                <span className="intra-card__head">
                  <span className="browse-card__name">Próximas incorporaciones</span>
                </span>
                <span className="browse-card__note">
                  Los sistemas que se vayan integrando aparecen acá, con su estado y la
                  repartición responsable.
                </span>
                <span className="browse-card__count intra-card__foot">
                  <span className="intra-card__dominio">Dirección de Sistemas del Ministerio de Educación</span>
                </span>
              </div>
            </div>
          </section>

          <section className="section" id="novedades">
            <div className="section-head">
              <h2>Novedades</h2>
              <span className="section-link">Ver todas</span>
            </div>
            <ol className="intra-novedades">
              {NOVEDADES.map((item) => (
                <li className="intra-novedad" key={item.titulo}>
                  <span className="intra-novedad__fecha">{item.fecha}</span>
                  <span className="intra-novedad__cuerpo">
                    <span className="intra-novedad__titulo">{item.titulo}</span>
                    <span className="intra-novedad__detalle">{item.detalle}</span>
                  </span>
                </li>
              ))}
            </ol>
          </section>

          <section className="section" id="ayuda">
            <div className="section-head">
              <h2>Accesos rápidos</h2>
            </div>
            <div className="chip-grid">
              {ACCESOS.map((item) => (
                <span className="chip" key={item}>
                  {item}
                </span>
              ))}
            </div>
          </section>
        </div>
      </main>

      <footer className="app-footer">
        <span>
          Ministerio de Educación
          <br />
          Provincia de Corrientes
        </span>
        <span className="app-footer__links">
          <span>Mesa de ayuda</span>
          <span>Estado de los servicios</span>
          <span>Dirección de Sistemas del Ministerio de Educación</span>
        </span>
      </footer>
    </div>
  )
}

/* ── Estilos del mockup ─────────────────────────────────────────────────────
   Only what the system does not already provide. Everything is expressed in
   existing tokens, so the mockup follows the theme switch like any other page. */
const CSS = `
.intra-page { display: flex; flex-direction: column; min-height: 100vh; }

/* No counters beside the title: the hero is one column and the title runs the
   full measure. It is a long denomination, so it is set below the display
   scale of a short page title — the width comes from the line, not the size. */
.intra-hero { grid-template-columns: minmax(0, 1fr); }
.intra-hero .page-title { font-size: clamp(2.25rem, 5vw, 4.25rem); }

/* Standing in for the account menu of the real shell. */
.intra-cuenta {
  font-size: var(--t-small);
  font-weight: 600;
  color: rgb(255 255 255 / 0.82);
}

/* The search field of the hero, without the client component behind it. */
.intra-input {
  flex: 1;
  min-height: 40px;
  padding: 0 var(--s-3);
  border: 0;
  background: none;
  font-size: 1.0625rem;
  color: var(--ink);
}
.intra-input::placeholder { color: var(--ink-faint); }
.intra-input:focus-visible { outline: none; }

/* A service card is a browse card that also carries state and provenance:
   the name and its pastilla share a line, the footer names the host and the
   repartición that answers for it. */
.intra-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-3);
  flex-wrap: wrap;
}
.intra-card__foot {
  display: grid;
  gap: 2px;
}
.intra-card__dominio {
  font-family: var(--font-body);
  font-weight: 600;
  color: var(--ink);
  word-break: break-word;
}
.intra-card__responsable { color: var(--ink-soft); font-weight: 400; }

/* Nothing to enter yet, so the placeholder is drawn, not filled: a dashed
   frame, no hover promise. */
.intra-card--proximo {
  border-style: dashed;
  background: transparent;
  color: var(--ink-soft);
}
.intra-card--proximo:hover { border-color: var(--line); background: transparent; }

/* Novedades read as a ruled register, like the rest of the system's lists. */
.intra-novedades {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
}
.intra-novedad {
  display: grid;
  grid-template-columns: 11rem minmax(0, 1fr);
  gap: var(--s-5);
  padding: var(--s-4) 0;
  border-bottom: 1px solid var(--line);
}
.intra-novedad:last-child { border-bottom: 0; }
.intra-novedad__fecha {
  font-size: var(--t-small);
  font-weight: 600;
  color: var(--ink-soft);
  font-variant-numeric: tabular-nums;
}
.intra-novedad__cuerpo { display: grid; gap: var(--s-1); }
.intra-novedad__titulo { font-weight: 600; font-size: 1.0625rem; line-height: 1.3; }
.intra-novedad__detalle {
  color: var(--ink-soft);
  font-size: var(--t-small);
  line-height: 1.5;
  max-width: 66ch;
  text-wrap: pretty;
}

@media (max-width: 760px) {
  .intra-novedad { grid-template-columns: 1fr; gap: var(--s-2); }
}
`
