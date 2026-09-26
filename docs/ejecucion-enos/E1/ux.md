# E1 — UX: episodios y verificación explícita

## 1. Flujo principal

**Operador (staff admin/editor):**
1. `/admin/episodios` → crea un episodio (nombre + descripción opcional) o abre uno existente.
2. `/admin/episodios/:id` → cola de verificaciones del episodio. Crea una solicitud para un CUE (con o sin parte previo) → recibe el enlace con el token, lo copia con "Copiar enlace" y lo distribuye por su canal habitual (E1 no envía mensajes externos).
3. Ve el estado de cada solicitud en texto explícito (Pendiente / Vencida / Sin afectación / Con afectación / No disponible / Cancelada), con nota de discrepancia cuando corresponde.
4. Puede cancelar una pendiente o registrar una respuesta asistida (canal telefónico/whatsapp/presencial/otro) para las dos respuestas autocontenidas (sin_afectacion/no_disponible); "con afectación" se resuelve desde la ficha de la escuela con el formulario de parte existente, fuera del alcance de esta cola.
5. Puede cerrar el episodio cuando ya no corresponde emitir más pedidos.

**Escuela (director, sin sesión, sólo con el enlace):**
1. Abre `/problematicas/verificaciones/:id?token=...` desde el enlace que le compartió el operador.
2. Ve una pregunta única: *"¿Su escuela tiene actualmente alguna afectación por la situación hidrometeorológica?"*, identificada por el **nombre de la escuela** (resuelto del lado del servidor sólo para el CUE de esa verificación puntual, con fallback explícito al CUE si no se puede resolver — fix1), con dos botones: **Sin afectación** / **Hay afectación**.
3. **Sin afectación**: una confirmación de un paso ("¿Confirma que la escuela NO tiene afectación en este momento?") → comprobante inmediato.
4. **Hay afectación**: sin paso intermedio (el formulario que sigue ES la confirmación) → se abre el formulario de parte existente para su escuela (sin contraseña compartida, sesión acotada a ese CUE por 30 min) → al guardar, el movimiento queda enlazado automáticamente a la verificación. Esta sesión abre las 4 pantallas del recorrido de parte (estado actual, iniciar reporte, actualizar, historial) sólo para su CUE, re-chequeada contra la fila real de la verificación en cada uso (fix1).
5. Un token vencido, revocado, inválido o **ya consumido** (verificación ya respondida) muestra un aviso claro con salida — para el caso de consumido, el comprobante de la respuesta ya registrada, sin reabrir el formulario (fix1) —, nunca un callejón sin salida ni un error técnico. La URL nunca conserva el token tras validarlo (se reemplaza con `history.replaceState`) y la página envía `Referrer-Policy: no-referrer`.

## 2. Antes / después

| Antes de E1 | Después de E1 |
|---|---|
| No existía forma de pedir confirmación explícita a una escuela sin afectación reportada; el único rastro era la ausencia de un parte. | Episodio agrupa pedidos; cada pedido tiene una credencial propia, estado visible y auditoría append-only, incluso para escuelas sin parte previo. |
| Responder por el formulario público exigía la contraseña compartida (o sesión admin), sin distinguir quién respondió. | El enlace de verificación distingue "respuesta por enlace de solicitud" (canal=enlace) de "respuesta asistida" (actor=operador autenticado, canal explícito); la contraseña compartida nunca habilita responder una solicitud. |
| "Sin afectación" no tenía ningún mecanismo — no había pregunta que responder. | Fast path de dos clics máximo, sin recorrer el formulario de cuatro pasos existente. |

## 3. Contenido visible vs. a demanda

- **Visible de entrada** (escuela): CUE-anexo, la pregunta, dos botones. Nada de score, motivo interno, ni historial.
- **A demanda** (escuela, sólo tras responder): comprobante con resultado, fecha, y nota de discrepancia si aplica.
- **Visible de entrada** (operador, cola): CUE, estado en texto, fecha de solicitud/respuesta, discrepancia si aplica.
- **A demanda** (operador): formulario de respuesta asistida se despliega sólo al abrirlo por fila; el enlace copiable se muestra sólo tras crear la solicitud, nunca se vuelve a mostrar después (el token no se persiste en claro).

## 4. Componentes reutilizados

- `Button`, `Label` de `components/ui/*` (sin componentes nuevos de UI genéricos).
- `.publico-content`, `.estado-actual-aviso`, `.estado-actual-bloque` (ya existentes, reusados tal cual en la pantalla de la escuela).
- `formatearCargaCorta` (`components/infraestructura/historial-formato.ts`) para la fecha del comprobante, en vez de reimplementar formato de zona horaria.
- Patrón de gate `adminPageGate` + estilos inline con `var(--ink)`/`var(--line)`/`var(--fill)` de `app/(hub)/admin/operacion/page.tsx`, reusado para `/admin/episodios` sin tocar `app/globals.css` (single-owner de esa ola quedó reservado a la UI escolar).
- Clases nuevas, mínimas y aditivas en `app/globals.css`: `.verificacion-pantalla`, `.verificacion-pregunta`, `.verificacion-acciones`, `.verificacion-boton`, `.verificacion-comprobante` — todas sobre los tokens existentes, sin gradientes/sombras nuevas.

## 5. Matriz de estados (tres estados visibles y distintos, texto + forma)

| Estado persistido | Vencimiento | Texto mostrado | Color adicional (nunca único) |
|---|---|---|---|
| `pendiente` | no vencido | "Pendiente" | neutro |
| `pendiente` | vencido (derivado, no persistido) | "Vencida" | advertencia |
| `respondida` / `sin_afectacion` | — | "Sin afectación" (+ nota de discrepancia si `discrepancia=1`) | positivo |
| `respondida` / `con_afectacion` | — | "Con afectación" | alerta |
| `respondida` / `no_disponible` | — | "No disponible" | neutro/advertencia (no cuenta como normalidad confirmada) |
| `cancelada` | — | "Cancelada" (+ motivo si se cargó) | neutro apagado |

## 6. Recorridos probados

- **Recorrido guiado reproducible para el gate UX con participantes** (§7 del plan, PENDIENTE por falta de participantes en esta sesión): desde un enlace válido recién generado, cronometrar hasta el comprobante de "Sin afectación": abrir el enlace → leer la pregunta → tocar "Sin afectación" → tocar "Confirmar" → ver comprobante. Objetivo: 4/5 participantes ≤30 s sin asistencia. Casos a intercalar: token ya vencido (debe mostrar salida clara, no medir tiempo de tarea en ese caso) y reintento tras confirmar dos veces seguidas (debe mostrar el mismo comprobante, no un error).
- **Verificado sin participantes humanos** (no sustituye el gate, ver `report.md` §7): recorrido completo ejercitado con tests de integración de API + componente (episodio → solicitud → validar-token → responder → comprobante; y episodio → solicitud → canjear-sesión → parte → vínculo automático), 959/959 tests en verde.
- **Estados de carga/error/vacío cubiertos en el componente de la escuela**: cargando, error con salida, pendiente, confirmación, enviando, comprobante — sin pantallas en blanco ni bloqueos.

## 7. Pendientes

- Capturas baseline 390×844 / 1366×768 con datos sintéticos: no se pudo levantar navegador en esta sesión (ver `report.md` §7.1 para el comando exacto).
- ~~Nombre de escuela no resuelto en el enlace público~~ — resuelto en fix1 (ver `report.md` §9.1, punto 4).
- Gate UX con 5 participantes reales: pendiente, sin fecha.
