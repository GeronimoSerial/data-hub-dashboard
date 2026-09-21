# Auditoría UX — "Estado actual del parte" (batch 4, spec §6 y §17)

**Auditor:** revisión de nivel 2, contrato `docs/trayectoria-contrato-implementacion.md` § "UX contract"
**Pantalla:** `components/infraestructura/estado-actual-parte.tsx` + `estado-actual-afectacion.tsx` + `estado-actual-severidad.tsx` + `app/problematicas/parte/page.tsx`
**Usuario:** director de escuela, no técnico, en el teléfono, a veces durante una inundación real.
**Marco:** Nielsen (10 heurísticas) + Krug ("Don't Make Me Think") — framework `ux-heuristics` regenerado por `npx skills use`, tabla vinculante de `docs/trayectoria-contrato-implementacion.md`.
**Escala de severidad:** 1 cosmético · 2 menor (molesta, no bloquea) · 3 grave (falla significativa de tarea) · 4 crítico (bloquea, con salida indirecta) · 5 catastrófico (sin salida). Se arregla todo lo de severidad 3 o más.

## Hallazgos

| # | Heurística | Qué está mal | Severidad | Corrección propuesta |
|---|---|---|---|---|
| 1 | Recognize, diagnose, recover from errors (Nielsen #9) | Cuando el acceso vence (401), el mensaje le ordena al director "Vuelva a ingresar la contraseña para ver el estado actual", pero la pantalla no ofrece ningún enlace ni botón para hacerlo — sólo texto. El director queda leyendo una instrucción que no puede ejecutar desde ahí. | 3 | Agregar un enlace de acción "Volver a ingresar la contraseña" que apunte a la misma URL del parte (`/problematicas/parte?cue=...`); la recarga fuerza al servidor a revalidar la cookie y mostrar `AccesoForm`. |
| 2 | Aesthetic and minimalist design (Nielsen #8) / Recognition (Nielsen #6) | Los dos bloques "Estado del servicio educativo" y "Situación del establecimiento" repiten el botón secundario con el mismo texto visible, "Informar un cambio", diferenciado sólo por `aria-label` (no visible) y por la posición bajo cada título. Un director que escanea rápido sin leer los encabezados podría confundir a cuál corresponde. | 2 | Documentado, sin arreglo: cada botón vive pegado a su propio título y valor (`estado-actual-bloque__titulo` + `__valor`), que ya da el contexto necesario sin agregar una tercera etiqueta a la pantalla. |
| 3 | Error prevention (Nielsen #5) | Tras un error de lectura genérico (`reintentable: true`), tocar "Reintentar" no da ninguna señal distinta de la carga inicial (mismo texto "Buscando el estado actual…"). Con mala conexión, el director puede no percibir que el toque se registró y volver a tocar varias veces. | 1 | Documentado, sin arreglo: es una lectura (GET) idempotente, sin riesgo de duplicar una acción; el costo de un toque de más es bajo frente al de agregar un estado de carga diferenciado. |

## Resumen por severidad

| Severidad | Cantidad |
|---|---|
| 3 | 1 |
| 2 | 1 |
| 1 | 1 |

## Verificación de ejes vinculantes del contrato

- **Reconocer antes que recordar:** cumple. La página resuelve la identificación del establecimiento server-side (spec §6.1) y el componente muestra estado del servicio, del establecimiento y de la situación en seguimiento antes de cualquier formulario; nunca abre un formulario en blanco sobre datos existentes.
- **Lenguaje del mundo real:** cumple. `grep` sobre los archivos de la pantalla no encuentra "versión", "entidad", "registro histórico" ni "persistencia" en copy de UI (ver comando y salida al final de este documento).
- **Visibilidad del estado:** cumple para los cuatro estados de lectura (cargando, error, acceso vencido, listo). Los estados "sin cambios guardables" y "guardado exitoso" no aplican a esta pantalla: es de sólo lectura, no tiene ninguna acción de guardado propia (el guardado vive en el formulario de actualización, fuera de este alcance).
- **Recuperación de errores:** cumple después del hallazgo #1 — antes del arreglo, el caso de acceso vencido no tenía salida accionable.
- **Minimalismo:** cumple. Nunca coexisten dos botones `ui-button--default` (primario) al mismo tiempo: la rama "sin situación" muestra sólo "Iniciar un reporte"; la rama "con situación" muestra sólo "Actualizar el parte" como primario junto a "Ver historial" como secundario.
- **Tap targets 44×44px:** cumple. `.ui-button` fija `min-height: 44px` y el resumen "Ver alumnos alcanzados" fija `min-height: 44px` explícito en `.estado-actual-afectacion__alumnos-resumen`.
- **Nada crítico detrás de hover:** cumple. Los alumnos alcanzados están detrás de `<details>/<summary>` (activable por tap y teclado), nunca de `:hover`.
- **Contraste WCAG AA 4.5:1:** cumple. `--ink-soft: #5f5e5c` sobre `--card: #ffffff` da ~6.5:1. La severidad nunca depende sólo del color: viaja con texto ("Severidad Alta") y una forma propia por nivel (círculo/cuadrado/triángulo/rombo) antes que el color.
- **creadaEn vs rigeDesde:** cumple. El pie muestra "Última actualización: X" (creadaEn/actualizadaEn) separado de "Rige desde el Y" por bloque (rigeDesde), nunca fusionados en una sola frase.

## Comando de verificación de vocabulario prohibido

```
rg -ni "versi[oó]n|entidad|registro hist[oó]rico|persistencia" \
  components/infraestructura/estado-actual-parte.tsx \
  components/infraestructura/estado-actual-afectacion.tsx \
  components/infraestructura/estado-actual-severidad.tsx \
  components/infraestructura/estado-actual-textos.ts \
  app/problematicas/parte/page.tsx
```

Salida: sin coincidencias en copy de UI (sólo aparece "identidad" dentro de un comentario de código, que no es texto de pantalla).

## Puntaje

- **Antes de las correcciones:** 6/10 — el bloqueo de recuperación en el hallazgo #1 es real, aunque acotado (el director puede volver a abrir el enlace original que recibió).
- **Después de las correcciones de severidad 3+:** **8/10**. Quedan documentados, sin arreglar, dos hallazgos de severidad 1-2 que no bloquean ninguna tarea.
