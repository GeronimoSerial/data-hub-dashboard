import { MarcaCompacta, MarcaHorizontal, MarcaHorizontalInversa } from '@/components/marca'

export default function PublicoLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
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
          <MarcaHorizontal className="publico-header__mark" />
          <MarcaHorizontalInversa />
          <MarcaCompacta />
          <span className="publico-header__title">Hub de Datos</span>
        </div>
      </header>

      {/* Footer sits inside the scroller (`.publico-main`, T12) so it scrolls
          with the form instead of staying pinned once the document itself
          stopped scrolling. */}
      <main className="publico-main">
        <div className="publico-main__body">{children}</div>
        <footer className="publico-footer">
          Ministerio de Educación · Provincia de Corrientes
        </footer>
      </main>
    </div>
  )
}
