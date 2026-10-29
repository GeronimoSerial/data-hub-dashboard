import { headers } from 'next/headers'
import { basePathPublico } from './host'

export async function obtenerBasePath() {
  return basePathPublico((await headers()).get('host'))
}
