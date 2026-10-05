import type { MotivoRow } from '@/lib/infraestructura/motivos'

export const turnos = [
  {
    turno: 'Mañana',
    niveles: [
      {
        nivel: 'Primario',
        secciones: [
          {
            geSectionId: 10,
            curso: '1°',
            division: 'A',
            nivel: 'Primario',
            turno: 'Mañana',
            matricula: 28,
            alumnos: [
              { gePersonId: 1001, apellido: 'García', nombre: 'Ana' },
              { gePersonId: 1002, apellido: 'López', nombre: 'Bruno' },
            ],
          },
          { geSectionId: 11, curso: '1°', division: 'B', nivel: 'Primario', turno: 'Mañana', matricula: 25, alumnos: [] },
        ],
      },
    ],
  },
  {
    turno: 'Tarde',
    niveles: [
      {
        nivel: 'Secundario',
        secciones: [
          { geSectionId: 20, curso: '4°', division: 'A', nivel: 'Secundario', turno: 'Tarde', matricula: 30, alumnos: [] },
        ],
      },
    ],
  },
]

export const TURNOS_FIXTURE = turnos

export const motivos: MotivoRow[] = [
  { id: 'inundacion', nombre: 'Inundación', categoria: 'establecimiento', orden: 10 },
  { id: 'tormenta-severa', nombre: 'Tormenta severa', categoria: 'establecimiento', orden: 20 },
  { id: 'sin-energia-agua', nombre: 'Sin energía o agua', categoria: 'establecimiento', orden: 30, severidadSugerida: 'Media' },
  { id: 'anegamiento', nombre: 'Anegamiento', categoria: 'alumnos', orden: 10 },
]
