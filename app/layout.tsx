import type { Metadata, Viewport } from 'next'
import { Barlow, Barlow_Semi_Condensed, Montserrat } from 'next/font/google'
import './globals.css'
import { Providers } from './providers'

// Manual de Marca §4: Barlow is the system family. Regular and SemiBold for
// reading and subheads, Bold for pastillas.
const barlow = Barlow({
  subsets: ['latin'],
  variable: '--font-barlow',
  display: 'swap',
  weight: ['400', '500', '600', '700'],
})

// §4.1: titles are Barlow Semi Condensed ExtraBold, uppercase, tracking 0.
const barlowSemiCondensed = Barlow_Semi_Condensed({
  subsets: ['latin'],
  variable: '--font-barlow-condensed',
  display: 'swap',
  weight: ['700', '800'],
})

// §4.4: Montserrat Bold carries a ministry denomination when it sits beside
// the Gobierno de Corrientes mark — used only in the compact signature.
const montserrat = Montserrat({
  subsets: ['latin'],
  variable: '--font-montserrat',
  display: 'swap',
  weight: ['700'],
})

export const metadata: Metadata = {
  title: {
    default: 'Hub de Datos · Ministerio de Educación de Corrientes',
    template: '%s · Hub de Datos',
  },
  description:
    'Reportes, tableros y mapas del sistema educativo de la Provincia de Corrientes, publicados por el Ministerio de Educación para el análisis y la toma de decisiones.',
  applicationName: 'Hub de Datos',
  icons: {
    icon: '/marca/escudo.svg',
    apple: '/marca/escudo.png',
  },
  openGraph: {
    title: 'Hub de Datos · Ministerio de Educación de Corrientes',
    description:
      'Reportes, tableros y mapas del sistema educativo de la Provincia de Corrientes.',
    locale: 'es_AR',
    type: 'website',
    siteName: 'Hub de Datos',
  },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#2e2d2c' },
  ],
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html
      lang="es"
      className={`${barlow.variable} ${barlowSemiCondensed.variable} ${montserrat.variable}`}
    >
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
