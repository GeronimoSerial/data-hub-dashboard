export default function PublicoLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="publico-layout">
      <header className="publico-header">
        <div className="publico-header__inner">
          <span className="publico-header__title">
            Hub de Datos · Sistema Educativo de Corrientes
          </span>
        </div>
      </header>
      <main className="publico-main">{children}</main>
    </div>
  )
}
