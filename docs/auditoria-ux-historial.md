# Auditoría UX — "Historial del parte" (batch 7, spec §15)

**Auditor:** revisión de nivel 2, contrato `docs/trayectoria-contrato-implementacion.md` § "UX contract"
**Pantalla:** `components/infraestructura/historial-parte.tsx` + `historial-movimiento.tsx` + `historial-formato.ts` + `app/problematicas/parte/historial/page.tsx` y `layout.tsx`
**Usuario:** director de escuela, no técnico, en el teléfono, a veces durante una inundación real.
**Marco:** Nielsen (10 heurísticas) + Krug ("Don't Make Me Think") — framework `ux-heuristics` regenerado por `npx skills use`, tabla vinculante de `docs/trayectoria-contrato-implementacion.md`.
**Escala de severidad:** 1 cosmético · 2 menor (molesta, no bloquea) · 3 grave (falla significativa de tarea) · 4 crítico (bloquea, con salida indirecta) · 5 catastrófico (sin salida). Se arregla todo lo de severidad 3 o más.

## Hallazgos

| # | Heurística | Qué está mal | Severidad | Corrección propuesta |
|---|---|---|---|---|
| 1 | Recognize, diagnose, recover from errors (Nielsen #9) / Error prevention (Nielsen #5) | `HistorialParte` no distingue un 401 (acceso vencido) de cualquier otro fallo de red: siempre cae en el estado `error` genérico, que muestra "No pudimos mostrar el historial. Revise su conexión y vuelva a intentar." con un botón "Reintentar". Para un acceso vencido, reintentar nunca funciona — el director queda en un bucle de toques inútiles justo cuando su ancho de banda cognitivo es más bajo. La ruta `GET /api/problematicas/parte/historial` sí devuelve 401 (verificado en `app/api/problematicas/parte/historial/route.ts`). | 3 | Distinguir `respuesta.status === 401` del resto de los fallos; mostrar el mismo mensaje de acceso vencido que usa "Estado actual del parte" (`MENSAJE_ACCESO_VENCIDO`) con un enlace accionable a la misma URL, en vez del botón "Reintentar". |
| 2 | Consistency and standards (Nielsen #4) / corrección funcional | `historial-formato.ts` calcula día, mes y hora con los getters nativos de `Date` (`getHours`, `getDate`, `getMonth`), que usan el huso horario del entorno de ejecución (el teléfono o navegador del director). El resto de la aplicación fija explícitamente `America/Argentina/Buenos_Aires` para este mismo propósito (ver `estado-actual-textos.ts`, comentario: "La provincia entera trabaja en un solo huso; fijarlo evita que el parte se lea con la hora del dispositivo"). Un teléfono con la hora del sistema mal configurada, o abierto por soporte remoto desde otro huso, muestra cargas y vigencias corridas de hora o de día. | 3 | Formatear `creadaEn`/`rigeDesde` con `Intl.DateTimeFormat` fijado a `America/Argentina/Buenos_Aires` (como el resto de la app), conservando los nombres de mes en español fijos que ya usa el archivo. |
| 3 | Recognition rather than recall (Nielsen #6) | El enlace "Volver al parte" (`app/problematicas/parte/historial/page.tsx`) es un link de texto plano sin fondo de botón, visualmente más débil que el resto de las acciones de la pantalla. Un director que escanea rápido podría no registrarlo como una acción disponible. | 2 | Documentado, sin arreglo: ya cumple el tap target de 44px (`min-height: 44px` en `.historial-volver`) y es una salida secundaria intencional (comentario Nielsen #3 en el código), no la acción principal de la pantalla. |
| 4 | Consistency and standards (Nielsen #4) | `HistorialParte` repite el string "No hay una situación hidrometeorológica en seguimiento para este establecimiento." como literal propio en vez de importar `MENSAJE_SIN_SITUACION` de `estado-actual-textos.ts`. Hoy el texto coincide palabra por palabra, pero nada impide que un cambio futuro en un archivo actualice sólo uno de los dos y las dos pantallas del mismo recorrido queden con redacciones distintas. | 2 | Documentado, sin arreglo: es un riesgo de mantenimiento a futuro, no una falla de UX presente en la pantalla actual. |
| 5 | Match between system and the real world (Nielsen #2) | El formato de fecha del historial nunca muestra el año ("18 sep · 10:35"). Si un director revisa el historial cerca de un cambio de año (situación abierta a fines de diciembre, revisada en enero), dos movimientos de años distintos se leen igual. | 2 | Documentado, sin arreglo: dentro de una misma situación hidrometeorológica en seguimiento el cambio de año calendario es un caso de borde infrecuente; no justifica alargar cada línea del historial con un dato que casi nunca aporta. |

## Resumen por severidad

| Severidad | Cantidad |
|---|---|
| 3 | 2 |
| 2 | 3 |

## Verificación de ejes vinculantes del contrato

- **Reconocer antes que recordar:** cumple — es una pantalla de sólo lectura, no hay formulario que abrir sobre datos existentes.
- **Lenguaje del mundo real:** cumple. `grep` sobre los archivos de la pantalla no encuentra "versión", "entidad", "registro histórico" ni "persistencia" en copy de UI (ver comando y salida al final de este documento).
- **Visibilidad del estado:** cumple para cargando, vacío y error genérico; el estado de acceso vencido no existía como tal antes del hallazgo #1. Los estados "sin cambios guardables" y "guardado exitoso" no aplican: la pantalla no guarda nada, sólo lista movimientos ya guardados por otras pantallas.
- **Recuperación de errores:** cumple después del hallazgo #1.
- **Minimalismo:** cumple. Un solo botón/enlace primario visible por estado: "Iniciar un reporte" en el vacío, "Reintentar" (o, tras el arreglo, el enlace de acceso vencido) en el error, ninguno en la lista con movimientos salvo la salida secundaria "Volver al parte".
- **Krug, la mitad de las palabras:** cumple. `cambios` llega ya redactado por el dominio (`movimiento-descripcion.ts`, fuera de este alcance) y el componente lo muestra tal cual, sin re-listar lo que no cambió.
- **Tap targets 44×44px:** cumple. `.historial-volver` y los botones de `.historial-estado` heredan `min-height: 44px`.
- **Nada crítico detrás de hover:** cumple. No hay ningún elemento con información dependiente de `:hover` en esta pantalla.
- **Contraste WCAG AA 4.5:1:** cumple, mismos tokens de color (`--ink`, `--ink-soft`) que "Estado actual del parte".
- **creadaEn vs rigeDesde:** cumple conceptualmente — `HistorialMovimiento` siempre separa la carga (`formatearCargaCorta(creadaEn)`, encabezado) de la vigencia (`formatearRigeDesde(rigeDesde)`, mostrada aparte y sólo cuando difiere de la carga) — pero el hallazgo #2 muestra que el *cálculo* de esos valores no respeta el mismo huso horario fijo que el resto de la app.

## Comando de verificación de vocabulario prohibido

```
rg -ni "versi[oó]n|entidad|registro hist[oó]rico|persistencia" \
  components/infraestructura/historial-parte.tsx \
  components/infraestructura/historial-movimiento.tsx \
  components/infraestructura/historial-formato.ts \
  app/problematicas/parte/historial/page.tsx \
  app/problematicas/parte/historial/layout.tsx
```

Salida: sin coincidencias en copy de UI.

## Puntaje

- **Antes de las correcciones:** 6/10 — dos hallazgos de severidad 3 con impacto real: un bucle de reintento inútil y un cálculo de hora que puede mostrar datos incorrectos.
- **Después de las correcciones de severidad 3+:** **8/10**. Quedan documentados, sin arreglar, tres hallazgos de severidad 2 que no bloquean ninguna tarea.
