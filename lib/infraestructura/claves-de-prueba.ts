import { randomBytes } from 'node:crypto'

// Claves aleatorias por corrida, para los tests del acceso público.
//
// Existe por dos razones, en este orden. La primera es de diseño: un test que
// depende de una cadena mágica ata la prueba a un valor concreto sin ninguna
// necesidad, porque lo que se verifica es que la clave configurada coincida o
// no, nunca cuál es. La segunda es operativa: el escaneo de secretos del repo
// (GitGuardian) marca cualquier literal asignado a una variable que se llame
// *_PASSWORD como contraseña filtrada, y bloquea el merge. Eran falsos
// positivos —no hay ninguna credencial real en los tests— pero la forma
// correcta de resolverlos no es silenciar el escáner, es no escribir el
// literal.
//
// No la importa nada fuera de los tests.
export function claveDePrueba(): string {
  return randomBytes(16).toString('hex')
}
