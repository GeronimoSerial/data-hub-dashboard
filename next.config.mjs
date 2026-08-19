/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
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
}

export default nextConfig
