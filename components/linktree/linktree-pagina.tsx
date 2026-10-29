import { ArrowRight, ArrowUpRight } from 'lucide-react'
import { MarcaHorizontal, MarcaHorizontalInversa } from '@/components/marca'
import type { LinktreeConfig, LinktreeEnlace } from '@/lib/linktree/config'
import { ICONOS_UI } from './iconos'
import styles from './linktree-pagina.module.css'
import { TemaBoton } from './tema-boton'

function esExterno(url: string) {
  return !url.startsWith('/')
}

function dominioDe(url: string) {
  try {
    return new URL(url).hostname
  } catch {
    return null
  }
}

function Fila({
  enlace,
  mostrarDominio,
  reservarIcono,
}: {
  enlace: LinktreeEnlace
  mostrarDominio: boolean
  reservarIcono: boolean
}) {
  const externo = esExterno(enlace.url)
  const dominio = mostrarDominio && externo ? dominioDe(enlace.url) : null
  const Icono = enlace.icono ? ICONOS_UI[enlace.icono].Componente : null
  const Flecha = externo ? ArrowUpRight : ArrowRight
  return (
    <li className={styles.item}>
      <a
        className={styles.enlace}
        href={enlace.url}
        {...(externo ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
        data-con-icono={reservarIcono ? '' : undefined}
      >
        {Icono ? <Icono className={styles.icono} size={20} aria-hidden /> : reservarIcono ? <span className={styles.huecoIcono} aria-hidden /> : null}
        <span className={styles.texto}>
          <span className={styles.nombre}>{enlace.titulo}</span>
          {enlace.descripcion ? <span className={styles.descripcion}>{enlace.descripcion}</span> : null}
          {dominio ? <span className={styles.dominio}>{dominio}</span> : null}
        </span>
        <Flecha className={styles.flecha} size={18} aria-hidden />
        {externo ? <span className="sr-only"> (se abre en una pestaña nueva)</span> : null}
      </a>
    </li>
  )
}

export function LinktreePagina({ config }: { config: LinktreeConfig }) {
  const grupos = config.grupos
    .map((grupo) => ({ ...grupo, enlaces: grupo.enlaces.filter((enlace) => enlace.visible) }))
    .filter((grupo) => grupo.enlaces.length > 0)

  return (
    <div className={styles.pagina} data-acento={config.acento}>
      <div className="app-ribbon" aria-hidden>
        <span />
        <span />
        <span />
        <span />
        <span />
      </div>

      <main className={styles.principal}>
        <header className={styles.cabecera}>
          <div className={styles.barra}>
            {config.mostrarLogo ? (
              <div className={styles.marca}>
                <MarcaHorizontal />
                <MarcaHorizontalInversa />
              </div>
            ) : (
              <span />
            )}
            <TemaBoton />
          </div>
          <h1 className={styles.titulo}>{config.titulo}</h1>
          {config.subtitulo ? <p className={styles.subtitulo}>{config.subtitulo}</p> : null}
        </header>

        {grupos.length === 0 ? (
          <div className={styles.vacio} role="status">
            <p className={styles.vacioTitulo}>Todavía no hay accesos publicados.</p>
            <p>Los enlaces aparecerán acá cuando el equipo del Ministerio los cargue.</p>
          </div>
        ) : (
          grupos.map((grupo) => (
            <section className={styles.grupo} key={grupo.id} aria-labelledby={`grupo-${grupo.id}`}>
              <h2 className={styles.grupoTitulo} id={`grupo-${grupo.id}`}>
                {grupo.titulo}
              </h2>
              <ul className={styles.lista}>
                {grupo.enlaces.map((enlace) => (
                  <Fila
                    key={enlace.id}
                    enlace={enlace}
                    mostrarDominio={config.mostrarDominio}
                    reservarIcono={grupo.enlaces.some((e) => e.icono)}
                  />
                ))}
              </ul>
            </section>
          ))
        )}
      </main>

      <footer className={styles.pie}>
        {config.pie ? <span>{config.pie}</span> : null}
        <a className={styles.admin} href="/links/admin">Admin</a>
      </footer>
    </div>
  )
}
