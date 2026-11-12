import type { DeepStringify } from '../tipos'
import type { residuosEs } from './residuos.es'

// Brazilian Portuguese texts of the `residuos` group; must mirror residuos.es.ts key for key.
export const residuosPt: DeepStringify<typeof residuosEs> = {
  vistaPrevia: {
    ariaTitulo: (nombre: string) => `Pré-visualização de ${nombre}`,
  },
  veredicto: {
    titulo: 'Veredicto diário',
    ariaDia: 'Veredicto do dia',
    calibracion: 'Em calibração',
    sinGenerar: 'O veredicto deste dia ainda não foi gerado.',
  },
  popup: {
    sinNombre: 'Estabelecimento',
  },
  instituto: {
    alcanza: 'Abrange',
    carrera: 'curso',
    carreras: 'cursos',
    alumno: 'aluno',
    alumnos: 'alunos',
  },
  vigencia: {
    desde: 'A partir de',
    ahora: (etiqueta: string) => `${etiqueta} agora`,
    hoy: (etiqueta: string, hora: string) => `${etiqueta} hoje às ${hora}`,
    fechaYHora: (etiqueta: string, dia: string, fecha: string, hora: string) => `${etiqueta} ${dia} ${fecha} às ${hora}`,
    elijaHora: 'Escolha a hora',
    elijaFechaYHora: 'Escolha a data e a hora',
    dias: ['dom.', 'seg.', 'ter.', 'qua.', 'qui.', 'sex.', 'sáb.'],
  },
}
