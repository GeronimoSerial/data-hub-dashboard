import type { Metadata, Viewport } from 'next'
import { Barlow, Barlow_Semi_Condensed, Inter, Montserrat } from 'next/font/google'
import 'lightgallery/css/lightgallery.css'
import 'lightgallery/css/lg-thumbnail.css'
import 'lightgallery/css/lg-zoom.css'
import './globals.css'
import { Providers } from './providers'
import { marcaPublica, regionActiva, regionPublica } from '@/lib/infraestructura/region'
import { RegionProvider } from '@/lib/infraestructura/region/region-provider'
import { textosActuales } from '@/lib/i18n'

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

// Body text across the app; Barlow stays for titles and subheads.
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

// Title and product name follow the active region; Corrientes keeps the
// shipped Spanish values byte for byte.
export async function generateMetadata(): Promise<Metadata> {
  const t = textosActuales().shellHub
  const producto = t.shell.producto
  const titulo = `${producto} · ${t.meta.organismo(regionActiva().nombre)}`
  const region = regionActiva()
  const esCorrientes = region.id === 'corrientes'
  const descripcion = esCorrientes
    ? t.meta.descripcionCorrientes
    : t.meta.descripcionRegion(region.nombre)
  const descripcionSocial = esCorrientes
    ? t.meta.descripcionSocialCorrientes
    : t.meta.descripcionSocialRegion(region.nombre)
  return {
    title: {
      default: titulo,
      template: `%s · ${producto}`,
    },
    description: descripcion,
    applicationName: producto,
    icons: {
      icon: '/marca/escudo.svg',
      apple: '/marca/escudo.png',
    },
    openGraph: {
      title: titulo,
      description: descripcionSocial,
      locale: region.locale.replace('-', '_'),
      type: 'website',
      siteName: producto,
    },
  }
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
      lang={regionActiva().locale}
      className={`${barlow.variable} ${barlowSemiCondensed.variable} ${montserrat.variable} ${inter.variable}`}
    >
      <body>
        <Providers>
          <RegionProvider region={regionPublica(regionActiva())} marca={marcaPublica(regionActiva())}>{children}</RegionProvider>
        </Providers>
      </body>
    </html>
  )
}
