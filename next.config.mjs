/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  allowedDevOrigins: process.env.ALLOWED_DEV_ORIGINS?.split(',') ?? [],
  serverExternalPackages: ['@libsql/client', 'libsql', '@electric-sql/pglite'],
  async rewrites() {
    const html = [
      '/tablero',
      '/mapa_interactivo',
      '/mapa_sobreedad',
      '/mapa_notas',
    ]
    return html.flatMap((path) => [
      { source: path, destination: `${path}/index.html` },
      { source: `${path}/`, destination: `${path}/index.html` },
    ])
  },
  async headers() {
    return [
      {
        source: '/problematicas/verificaciones/:path*',
        headers: [{ key: 'Referrer-Policy', value: 'no-referrer' }],
      },
    ]
  },
}

export default nextConfig
