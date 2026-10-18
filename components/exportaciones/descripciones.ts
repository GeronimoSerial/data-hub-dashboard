import type { TipoExportacionEscuelas } from '@/lib/exportaciones/escuelas'

export const DESCRIPCION_EXPORTACION: Record<TipoExportacionEscuelas, string> = {
  afectadas: 'Escuelas con un parte de situación abierto, con su gravedad y categoría principal.',
  'sin-clases': 'Escuelas cuyas clases no funcionan con normalidad, con alumnos afectados y asistencia pedagógica.',
  'con-clases': 'Escuelas con clases normales y la fecha de su última novedad.',
  asistidas: 'Escuelas que reciben apoyo pedagógico: virtual, cuadernillo, ambos o brinda.',
  'en-riesgo': 'Escuelas que el radar de riesgo ubica en el horizonte elegido.',
}
