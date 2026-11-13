import type { DeepStringify } from '../tipos'
import type { parteComunControlesEs } from './parteComunControles.es'

// Brazilian Portuguese texts of the `parteComunControles` group; must mirror parteComunControles.es.ts key for key.
export const parteComunControlesPt: DeepStringify<typeof parteComunControlesEs> = {
  cerrar: 'Fechar',
  seleccionar: 'Selecionar…',
  seleccionadas: (cantidad) => `${cantidad} selecionadas`,
}
