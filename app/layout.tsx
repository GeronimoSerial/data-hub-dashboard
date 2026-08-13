import type { Metadata, Viewport } from 'next'
import './globals.css'
import { Providers } from './providers'
import { HubDataProvider } from '@/components/hub-data'
import { AppShell } from '@/components/app-shell'

export const metadata: Metadata = {
  title: 'Hub de Datos · Análisis Educativo',
  description:
    'Hub de Datos del sistema educativo de Corrientes: reportes, tableros y mapas para decidir con evidencia.',
}

export const viewport: Viewport = {
  themeColor: '#0f6cbd',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es">
      <body>
        <Providers>
          <HubDataProvider>
            <AppShell>{children}</AppShell>
          </HubDataProvider>
        </Providers>
      </body>
    </html>
  )
}
