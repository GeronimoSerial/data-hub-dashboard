import type { Metadata } from 'next'
import { BookOpen, Download, FileText, ArrowDown, ExternalLink } from 'lucide-react'
import { MarcaHorizontal } from '@/components/marca'
import { cargarMateriales } from '@/lib/materiales'
import styles from './page.module.css'

export const metadata: Metadata = {
  title: 'Materiales y recursos',
  description: 'Manuales del flujo de reportes, cuadernillos de asistencia pedagógica y solicitud de aula virtual del Ministerio de Educación de Corrientes.',
}
export const dynamic = 'force-static'

export default async function MaterialesPage() {
  const colecciones = await cargarMateriales()
  return (
    <div className={styles.page}>
      <a className={styles.skip} href="#contenido">Ir a los materiales</a>
      <header className={styles.header}>
        <MarcaHorizontal className={styles.brand} />
        <span className={styles.headerLabel}>Recursos para la comunidad educativa</span>
      </header>
      <main id="contenido">
        <section className={styles.hero} aria-labelledby="titulo">
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>Ministerio de Educación · Corrientes</p>
            <h1 id="titulo">Materiales<br />a mano.</h1>
            <p className={styles.intro}>Manuales para tus reportes y cuadernillos para acompañar la enseñanza. Encontrá el material que necesitás y guardalo para consultarlo después.</p>
            <a className={styles.primary} href="#colecciones">Ver los materiales <ArrowDown size={20} aria-hidden="true" /></a>
          </div>
          <nav className={styles.index} aria-label="Colecciones de materiales">
            <p>¿Qué necesitás consultar?</p>
            {colecciones.map((coleccion, index) => (
              <a key={coleccion.id} href={`#${coleccion.id}`}>
                <span className={styles.number}>0{index + 1}</span>
                <span>{index === 0 ? 'Flujo de reportes' : 'Asistencia pedagógica'}<small>{index === 0 ? 'Manuales de uso' : 'Cuadernillos de trabajo'}</small></span>
                <ArrowDown size={20} aria-hidden="true" />
              </a>
            ))}
            <a href="#aula-virtual">
              <span className={styles.number}>03</span>
              <span>Aulas virtuales<small>Solicitud y acceso a Educaplay</small></span>
              <ArrowDown size={20} aria-hidden="true" />
            </a>
          </nav>
        </section>
        <div id="colecciones" className={styles.collections}>
          {colecciones.map((coleccion, index) => {
            const Icon = index === 0 ? FileText : BookOpen
            return (
              <section className={styles.collection} id={coleccion.id} key={coleccion.id} aria-labelledby={`${coleccion.id}-titulo`}>
                <div className={styles.collectionHeading}>
                  <span className={styles.collectionIcon}><Icon size={26} strokeWidth={1.7} aria-hidden="true" /></span>
                  <span className={styles.eyebrow}>Colección 0{index + 1}</span>
                  <h2 id={`${coleccion.id}-titulo`}>{coleccion.titulo}</h2>
                  <p>{coleccion.descripcion}</p>
                </div>
                <div className={styles.files}>
                  {coleccion.materiales.length ? coleccion.materiales.map(material => (
                    material.tipo === 'video' ? (
                      <article className={`${styles.file} ${styles.video}`} key={material.href}>
                        <div><h3>{material.titulo}</h3><p>Video · {material.duracion}</p></div>
                        <video controls preload="metadata" playsInline poster={material.poster} src={material.href} aria-label={material.titulo}>
                          Tu navegador no puede reproducir este video.
                        </video>
                      </article>
                    ) : (
                      <article className={styles.file} key={material.href}>
                        <div><h3>{material.titulo}</h3><p>PDF · {material.paginas} páginas · {material.peso}</p></div>
                        <a className={styles.download} href={material.href} download aria-label={`Descargar ${material.titulo}, PDF, ${material.peso}`}><Download size={19} aria-hidden="true" /> Descargar PDF</a>
                      </article>
                    )
                  )) : (
                    <div className={styles.empty}>
                      <p className={styles.emptyTitle}>Estamos preparando estos materiales</p>
                      <p>Los archivos de esta colección todavía no están publicados. Volvé a esta página para consultar su disponibilidad.</p>
                    </div>
                  )}
                </div>
              </section>
            )
          })}
          <section className={styles.collection} id="aula-virtual" aria-labelledby="aula-virtual-titulo">
            <div className={styles.collectionHeading}>
              <h2 id="aula-virtual-titulo">Aulas virtuales</h2>
              <p>Solicitá un aula virtual o accedé a Educaplay.</p>
            </div>
            <div className={styles.files}>
              <a className={styles.download} href="https://forms.gle/vrFAisMjeMWEa9TKA">
                Solicitar aula virtual <ExternalLink size={19} aria-hidden="true" />
              </a>
              <a className={styles.download} href="https://corrientesplay.ar/educaplay/">
                Acceder a Educaplay <ExternalLink size={19} aria-hidden="true" />
              </a>
            </div>
          </section>
        </div>
        <aside className={styles.note}>
          <Download size={24} strokeWidth={1.7} aria-hidden="true" />
          <div><h2>Guardalos y consultalos sin conexión</h2><p>Tocá «Descargar PDF». Encontrarás el archivo en las descargas de tu celular. Si se abre en el navegador, usá su opción de descargar o guardar.</p></div>
        </aside>
      </main>
      <footer className={styles.footer}><span>Ministerio de Educación<br />Provincia de Corrientes</span><a href="#titulo">Volver al inicio ↑</a></footer>
    </div>
  )
}
