/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  allowedDevOrigins: process.env.BETTER_AUTH_URL
    ? [new URL(process.env.BETTER_AUTH_URL).hostname]
    : [],
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
