// Umbrales de dominio compartidos entre el servidor y el cliente.
//
// POR QUÉ ESTE ARCHIVO EXISTE Y NO VIVE EN parte-mapa.ts: aquel módulo importa
// `getDb`, que arrastra el cliente de libsql y con él `node:fs`. Un componente
// de cliente puede importar un TIPO de parte-mapa.ts sin consecuencias —
// `import type` se borra en compilación—, pero importar un VALOR mete el módulo
// entero en el bundle del navegador y el build de Turbopack falla con
// "the chunking context does not support external modules (request: node:fs)".
//
// Las constantes que el mapa necesita en runtime viven acá, en un módulo sin
// una sola importación de servidor, para que esa frontera no se pueda cruzar
// por accidente.

// Umbral (en horas) a partir del cual un parte se considera "sin reportar"
// (actualizadaEn más viejo que esto). HIPÓTESIS AJUSTABLE: 72 h ≈ 3 días,
// pensado para que un director que no vuelve a tocar el parte en un fin de
// semana largo no aparezca marcado en falso, pero sí lo haga si pasó una
// semana sin ninguna actualización durante una situación en curso. Si el
// producto define otro criterio, este es el único lugar que hay que tocar.
export const UMBRAL_SIN_ACTUALIZAR_HORAS = 72
