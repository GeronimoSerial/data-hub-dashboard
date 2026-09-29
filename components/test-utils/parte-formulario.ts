import type { MotivoRow } from '@/lib/infraestructura/motivos'

export const turnos = [
  {
    turno: 'Mañana',
    niveles: [
      {
        nivel: 'Primario',
        secciones: [
          { geSectionId: 10, curso: '1°', division: 'A', nivel: 'Primario', turno: 'Mañana', matricula: 28, alumnos: [] },
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

export const motivos: MotivoRow[] = [
  { id: 'inundacion', nombre: 'Inundación', categoria: 'establecimiento', orden: 10 },
  { id: 'tormenta-severa', nombre: 'Tormenta severa', categoria: 'establecimiento', orden: 20 },
  { id: 'anegamiento', nombre: 'Anegamiento', categoria: 'alumnos', orden: 10 },
]
