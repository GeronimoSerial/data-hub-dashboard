import { MarcaCompacta, MarcaHorizontal, MarcaHorizontalInversa } from '@/components/marca'
import { marcaPublica, regionActiva } from '@/lib/infraestructura/region'
import { idiomaEfectivo } from '@/lib/i18n/idioma'
import { IdiomaProvider } from '@/lib/i18n/idioma-provider'
import { textos } from '@/lib/i18n'

export default function PublicoLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const region = regionActiva()
  const marca = marcaPublica(region)
  // Sin usuario: el idioma es el de la región (la preferencia la pone la sesión).
  const idioma = idiomaEfectivo({ preferencia: undefined, region })
  const t = textos(idioma).shellHub.shell
  return (
    <IdiomaProvider idioma={idioma}>
    <div className="publico-layout">
      {/* The public flow is where a school first meets this service, so it
          carries the full institutional signature, not a text stand-in. */}
      <header className="publico-header">
        <div className="app-ribbon" aria-hidden>
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>
        <div className="publico-header__inner">
          {marca.logo ? (
            <>
              <MarcaHorizontal className="publico-header__mark" />
              <MarcaHorizontalInversa />
              <MarcaCompacta />
            </>
          ) : null}
          <span className="publico-header__title">{t.producto}</span>
        </div>
      </header>

      {/* Footer sits inside the scroller (`.publico-main`, T12) so it scrolls
          with the form instead of staying pinned once the document itself
          stopped scrolling. */}
      <main className="publico-main">
        <div className="publico-main__body">{children}</div>
        <footer className="publico-footer">
          {marca.pieLineas.join(' · ')}
        </footer>
      </main>
    </div>
    </IdiomaProvider>
  )
}
