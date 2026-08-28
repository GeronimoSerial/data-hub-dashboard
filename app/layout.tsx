import type { Metadata, Viewport } from 'next'
import { Barlow, Inter } from 'next/font/google'
import './globals.css'
import { Providers } from './providers'
import { HubDataProvider } from '@/components/hub-data'
import { AppShell } from '@/components/app-shell'

const barlow = Barlow({
  subsets: ['latin'],
  variable: '--font-barlow',
  display: 'swap',
  weight: ['500', '600', '700'],
})

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Hub de Datos · Análisis Educativo',
  description:
    'Hub de Datos del sistema educativo de Corrientes: reportes, tableros y mapas para decidir con evidencia.',
}

export const viewport: Viewport = {
  themeColor: '#769fd3',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html
      lang="es"
      className={`${barlow.variable} ${inter.variable}`}
    >
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
