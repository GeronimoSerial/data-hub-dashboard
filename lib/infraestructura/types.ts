export type EstadoCorte = 'importando' | 'vigente' | 'historico'

export interface GeCorte {
  id: number
  cicloLectivo: number
  fetchedAt: string
  estado: EstadoCorte
}

export interface GeSeccion {
  corteId: number
  geSectionId: number
  cueAnexo: string
  curso: string
  division: string
  nivel: string
  turno: string
}

export interface GeAlumnoSeccion {
  corteId: number
  geSectionId: number
  gePersonId: number
}

export interface GeLocalizacion {
  cueAnexo: string
  // Pendiente: ninguna fuente actual (index.html, establishments.geojson) trae CUI.
  // Queda NULL hasta que B8 conecte la fuente real de Gestión Educativa.
  cui: string | null
  nombre: string
  departamento: string
  localidad: string
  lat: number | null
  lon: number | null
  geoCalidad: string | null
}
