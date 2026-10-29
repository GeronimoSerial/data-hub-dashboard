import { ArrowUpRight } from 'lucide-react'
import { MarcaHorizontal, MarcaHorizontalInversa } from '@/components/marca'
import type { Enlace, LinksConfig } from '@/miniapps/links/lib/config'
import styles from './links.module.css'
import { Cinta } from './cinta'
import { IconoInstagram } from './icono-instagram'
import { TemaBoton } from './tema-boton'

const INSTAGRAM = 'https://www.instagram.com/centroadministrativomec'

function dominioDe(url: string) {
  try {
    return new URL(url).hostname
  } catch {
    return null
  }
}

function Fila({ enlace }: { enlace: Enlace }) {
  const dominio = dominioDe(enlace.url)
  return (
    <li className={styles.item}>
      <a className={styles.enlace} href={enlace.url} target="_blank" rel="noopener noreferrer">
        <span className={styles.texto}>
          <span className={styles.nombre}>{enlace.titulo}</span>
          {enlace.descripcion ? <span className={styles.descripcion}>{enlace.descripcion}</span> : null}
          {dominio ? <span className={styles.dominio}>{dominio}</span> : null}
        </span>
        <ArrowUpRight className={styles.flecha} size={18} aria-hidden />
        <span className="sr-only"> (se abre en una pestaña nueva)</span>
      </a>
    </li>
  )
}

export function LinksPagina({ config }: { config: LinksConfig }) {
  return (
    <div className={styles.pagina}>
      <Cinta />
      <main className={styles.principal}>
        <header className={styles.cabecera}>
          <div className={styles.barra}>
            <TemaBoton />
            <div className={styles.marca}>
              <MarcaHorizontal />
              <MarcaHorizontalInversa />
            </div>
          </div>
          <h1 className={styles.titulo}>{config.titulo}</h1>
          {config.subtitulo ? <p className={styles.subtitulo}>{config.subtitulo}</p> : null}
        </header>

        {config.enlaces.length === 0 ? (
          <div className={styles.vacio} role="status">
            <p className={styles.vacioTitulo}>Todavía no hay accesos publicados.</p>
          </div>
        ) : (
          <ul className={styles.lista}>
            {config.enlaces.map((enlace) => (
              <Fila key={enlace.id} enlace={enlace} />
            ))}
          </ul>
        )}
      </main>

      <footer className={styles.pie}>
        <div className={styles.area}>
          <span>Centro Administrativo</span>
          <a className={styles.red} href={INSTAGRAM} target="_blank" rel="noopener noreferrer" aria-label="Instagram de Centro Administrativo (se abre en una pestaña nueva)">
            <IconoInstagram />
          </a>
        </div>
        <a className={styles.admin} href="/links/admin">Admin</a>
      </footer>
    </div>
  )
}
