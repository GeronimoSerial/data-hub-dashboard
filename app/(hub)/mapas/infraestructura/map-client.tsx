'use client'

import dynamic from 'next/dynamic'

const MapInfraestructuraPage = dynamic(
  () => import('@/components/mapas/map-infraestructura-page'),
  { ssr: false, loading: () => <p>Cargando mapa…</p> },
)

export function InfraestructuraMapClient(props: { mostrarEnlaceNominal: boolean }) {
  return <MapInfraestructuraPage mostrarEnlaceNominal={props.mostrarEnlaceNominal} />
}
