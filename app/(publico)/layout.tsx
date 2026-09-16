export default function PublicoLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b px-6 py-4">
        <span className="text-lg font-semibold">
          Hub de Datos · Sistema Educativo de Corrientes
        </span>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  )
}
