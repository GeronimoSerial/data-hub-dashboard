# Rediseño del flujo de partes (iniciar y actualizar) — diseño

- **Fecha:** 2026-10-04
- **Estado:** aprobado (2026-10-04)
- **Alcance:** wizard "Iniciar reporte" (`app/problematicas/parte/nuevo`), flujo "Actualizar" del director, catálogo de motivos (ABM admin) y envío resiliente.
- **Plataforma objetivo:** mobile-first. El director carga el parte mayoritariamente desde el celular, con conectividad intermitente y bajo estrés.

## 1. Problema

Feedback del dueño de producto sobre el flujo actual:

1. **Matriz tipo → motivo → gravedad incoherente.** La gravedad tiene un único eje ("dictado de clase de la escuela", `lib/infraestructura/severidad.ts`). Un problema de *alumnos* (acceso) puede marcarse "Crítica: impide el funcionamiento o hay riesgo para las personas", que no describe esa situación. Ningún motivo orienta qué gravedad corresponde.
2. **"¿Desde cuándo rige este cambio?"** usa lenguaje normativo, no se adapta a la categoría y el control (botón que despliega un panel de fecha/hora + "volver a Ahora") no se entiende.
3. **Selector de alcance confuso.**
   - En *alumnos* el título dice "Secciones afectadas" y una sección con 1 de 3 alumnos muestra un estado `indeterminate` que se confunde con una tilde.
   - En *establecimiento*, al marcar una sección el checkbox maestro "Todas las secciones" pasa a parcial y parece que se seleccionó todo.
4. **"¿Cómo sigue el servicio?" mezcla la palabra "funcionamiento"** en dos ejes distintos (servicio educativo y estado del edificio), y combinaciones válidas parecen absurdas. El aviso "El alcance declarado incluye solo algunas secciones, pero este estado implica la interrupción de toda la escuela" se muestra como texto + checkbox en lugar de pedir confirmación.
5. **Bug:** aparece "Pendiente de envío — se enviará al recuperar conexión" teniendo conexión.
6. **Actualizar:**
   - No hay línea de tiempo: no se entiende qué llegó primero.
   - No hay jerarquía: una evacuación total pesa igual que un corte de luz.
   - No hay continuidad: un problema nuevo no se relaciona con uno anterior (¿se solucionó el anterior? ¿el nuevo es consecuencia?).
   - El director no ve qué cargó por última vez ni a qué hora.

## 2. Objetivos y no-objetivos

**Objetivos**

- Que cada combinación categoría/motivo/gravedad que el director pueda producir tenga sentido y sea clasificable después (sin texto libre salvo en el caso crítico justificado).
- Que el director nunca dude dónde tocar: un camino único, un paso por pantalla, confirmaciones explícitas en bottom sheets.
- Trazabilidad temporal y causal de las situaciones de una escuela.
- Estado de envío veraz en todo momento, con recuperación del borrador.

**No-objetivos**

- No se cambia el modelo de verificaciones (`infra_verificacion`) ni el flujo de supervisor.
- No se recalcula retroactivamente la gravedad de partes ya cargados (ver §9).
- No se agrega texto libre en gravedad fuera de la justificación de Crítica.

## 3. Principios transversales

### 3.1 Mobile-first

- **Un paso por pantalla**, sin scroll largo. Barra de acción fija abajo ("Siguiente" / "Enviar"), al alcance del pulgar.
- **Áreas táctiles ≥ 44×44 px** en chips, radios, checkboxes y filas de lista.
- **Confirmaciones y preguntas intermedias en bottom sheet**, nunca en modal centrado. Base: `components/ui/sheet.tsx` (variante inferior). Si no soporta `side="bottom"` con drag-to-dismiss y foco atrapado, se extiende ese componente; no se agrega una librería nueva sin evaluarlo.
- Controles nativos para fecha y hora (`<input type="date">`, `<input type="time">`) para obtener el teclado/picker del sistema.
- Textos cortos. La explicación larga va en el bottom sheet de confirmación, no fija en pantalla.

### 3.2 Red de seguridad (patrón reutilizable)

Cuando una elección es **posible pero sospechosa**, se muestra un aviso **no bloqueante** que propone la alternativa probable. Se implementa como una pieza reutilizable (por ejemplo `AvisoRedSeguridad` + función pura `evaluarRedesSeguridad(borrador) → Aviso[]`) para aplicarla en otras partes del flujo.

Primera regla (Fase 2):

| Condición | Aviso |
|---|---|
| Categoría *alumnos* y alumnos marcados > 50 % de la matrícula disponible | "Marcaste a la mayoría de los alumnos. ¿No será un problema del establecimiento?" con acción "Cambiar a Establecimiento" |

Candidatas a evaluar después (no comprometidas): gravedad Baja con edificio Evacuado; "Sigue igual" repetido muchos días sobre una situación Crítica.

### 3.3 Relevancia de situaciones

Orden total, de mayor a menor relevancia:

1. **Gravedad:** Crítica > Alta > Media > Baja.
2. **Estado del edificio** del parte: Evacuado > Usado como centro de evacuados > Uso parcial > Sin daños.
3. **Recencia:** `rigeDesde` más reciente primero (desempate final por `creadaEn`).

La relevancia define:

- el **orden** de las situaciones activas en "Actualizar";
- la **situación principal** de la escuela (encabezado del parte, mapa, listados).

Se implementa como una función pura única (`compararRelevancia`) en `lib/infraestructura/`, consumida por UI y por las consultas del mapa. No se redefine por componente.

## 4. Modelo de datos (Fase 1)

Glosario: una **situación** es una fila de `infra_afectacion` (N por parte; un parte por escuela y período, `infra_parte_cue_periodo_uidx`).

### 4.1 Gravedad sugerida por motivo

- `infra_motivo.severidad_sugerida` — `text`, **nullable**. Valores: `Baja | Media | Alta | Crítica`. `NULL` = sin sugerido.
- Editable desde el ABM de motivos del admin (campo select con opción "Sin sugerido").
- Semilla (`MOTIVOS_SEED` en `lib/infraestructura/motivos.ts` + migración que actualiza filas existentes solo si la columna está en `NULL`):

| Categoría | Motivo (`id`) | Sugerido |
|---|---|---|
| establecimiento | `inundacion` | Crítica |
| establecimiento | `tormenta-severa` | Alta |
| establecimiento | `sin-energia-o-agua` | Media |
| establecimiento | `evacuacion-preventiva` | Crítica |
| establecimiento | `inaccesibilidad-docentes` | Alta |
| establecimiento | `otro-establecimiento` | — |
| alumnos | `anegamiento` | Alta |
| alumnos | `acceso-interrumpido` | Alta |
| alumnos | `otro-alumnos` | — |

### 4.2 Criterios de gravedad por categoría

`SEVERIDAD_CRITERIOS` pasa a ser `Record<CategoriaAfectacion, Record<Severidad, string>>`. `criterioSeveridad(severidad, categoria)`.

| Nivel | Establecimiento (sin cambios) | Alumnos (nuevo) |
|---|---|---|
| Baja | Molesta, pero se dicta clase normalmente. | Llegan con demora o dificultad, pero asisten. |
| Media | Condiciona el dictado: algunas secciones o turnos funcionan a medias. | Algunos alumnos faltan algunos días por el acceso. |
| Alta | Impide dictar clase en parte del establecimiento. | Los alumnos afectados no pueden llegar de forma sostenida. |
| Crítica | Impide el funcionamiento o hay riesgo para las personas. | Llegar implica riesgo para los alumnos (cruzar un arroyo crecido, un camino anegado). |

La escala de color (`SEVERIDAD_COLORES`) no cambia: una sola escala para todo el mapa.

### 4.3 Justificación de Crítica

Se exige **solo** cuando la gravedad elegida es `Crítica` **y** el motivo tiene sugerido distinto de Crítica **o no tiene sugerido**. En cualquier otro caso no se pide nada.

Columnas nuevas en `infra_afectacion`:

- `justificacion_critica` — `text`, nullable. Uno de:
  - `mas_personas` — "Afecta a más personas o secciones de lo habitual"
  - `riesgo_fisico` — "Hay riesgo eléctrico, estructural o sanitario"
  - `se_prolonga` — "Se prolonga en el tiempo o no tiene fecha de solución"
  - `combinado` — "Se combina con otro problema activo"
  - `otro` — "Otro"
- `justificacion_critica_detalle` — `text`, nullable, máx. 300 caracteres. **Obligatorio** si `justificacion_critica = 'otro'`, prohibido en los demás casos.

Validación en Zod (cliente) **y** en el endpoint (servidor): la regla de exigencia se evalúa contra el sugerido vigente del motivo en el servidor, no contra lo que mande el cliente.

### 4.4 Vínculo causal

- `infra_afectacion.causada_por_id` — `text`, nullable, FK lógica a `infra_afectacion.id` (misma escuela). Sin `ON DELETE` destructivo: las afectaciones nunca se borran (soft delete).
- Restricciones de servidor:
  - la causa pertenece al mismo `cue_anexo`;
  - la causa está activa **o** fue cerrada hace ≤ 15 días respecto del `rigeDesde` de la nueva (puede estar en un período anterior);
  - sin ciclos (una situación no puede ser causa de sí misma ni de un ancestro);
  - un solo nivel de causa por situación (la causa puede a su vez tener causa: se forma una cadena, no un grafo).

### 4.5 Cierre de situaciones

Hoy `retirada_en` mezcla "dejó de regir". Se distingue el **motivo de cierre**:

- `infra_afectacion.cierre` — `text`, nullable: `solucionada` (el director indicó "Se solucionó") | `retirada` (comportamiento legado / error de carga).
- `retirada_en` se mantiene como instante de cierre (cuándo dejó de regir), elegido con los mismos chips de vigencia (§5.3).
- Filas existentes con `retirada_en` no nulo → `cierre = 'retirada'` en la migración.

### 4.6 Movimientos (historial)

`infra_movimiento` sigue siendo append-only. El `resumen` (JSON) se estandariza para que la línea de tiempo pueda mostrar diferencias:

```ts
type ResumenMovimiento = {
  situacionId: string
  accion: 'alta' | 'sigue_igual' | 'cambio' | 'solucionada' | 'cascada'
  cambios?: Array<{
    campo: 'severidad' | 'alcance' | 'clases' | 'edificio'
    antes: string   // ya formateado para mostrar, p. ej. "Alta"
    despues: string // p. ej. "Crítica"
  }>
  causadaPorId?: string
  justificacionCritica?: string
}
```

Se agregan los tipos de movimiento `confirmacion` (sigue igual) y `cierre` a los existentes. "Sigue igual" **sí genera movimiento**: es el dato de continuidad que hoy falta.

### 4.7 Migraciones

- Todas las columnas nuevas son nullable para poder agregarse por `ALTER` sobre bases pobladas (mismo criterio documentado en `lib/db/schema.ts` para `idempotency_key`).
- Una migración Drizzle por fase que toque esquema; la semilla de `severidad_sugerida` es idempotente (solo completa `NULL`).

## 5. Iniciar reporte (Fase 2)

### 5.1 Pasos

1. **Categoría** — "Problema del establecimiento" / "Alumnos que no pueden llegar". Al elegir, se abre un **bottom sheet de confirmación** con el texto explicativo:
   - Establecimiento: "Vas a marcar secciones que no pueden funcionar por un problema de la escuela. Si son alumnos puntuales que no pueden llegar, elegí 'Alumnos'."
   - Alumnos: "Vas a marcar solo los alumnos que no pueden llegar a la escuela. Si el problema es del edificio o afecta a la escuela, elegí 'Establecimiento'."
   - Acciones: "Continuar" / "Cambiar categoría".
2. **Motivo** — lista filtrada por categoría (como hoy).
3. **Gravedad** — §5.2.
4. **A quién afecta** — §5.4 / §5.5.
5. **Desde cuándo** — §5.3.
6. **Clases y edificio** — §5.6 (solo categoría establecimiento; en alumnos se omite el paso y el parte conserva su estado de edificio actual).
7. **Revisión y envío** — resumen legible de todo + "Enviar".

El orden exacto de pasos puede ajustarse en el plan si los tests de usabilidad lo piden, sin cambiar las reglas.

### 5.2 Gravedad

- Se muestran **siempre los 4 niveles**, cada uno con su criterio según la categoría (§4.2).
- El nivel igual a `severidad_sugerida` del motivo lleva el badge **"Sugerido"**, pero **no** aparece preseleccionado: el director elige explícitamente (evita aceptar por inercia).
- Si elige **Crítica** y aplica §4.3, se abre un **bottom sheet** "¿Por qué es crítica?" con las 5 opciones (radio) y, si elige "Otro", un textarea obligatorio (máx. 300). No se puede avanzar sin completar.

### 5.3 Desde cuándo (reemplaza `VigenciaField`)

- Etiqueta según categoría: establecimiento → **"¿Desde cuándo ocurre?"**; alumnos → **"¿Desde cuándo no pueden llegar?"**. En actualizaciones y cierres el texto lo provee el contexto ("¿Desde cuándo pasa esto?", "¿Cuándo se solucionó?").
- Tres chips de selección única:
  - **Ahora** (por defecto) → captura el instante del envío, no el de apertura del formulario.
  - **Hoy, más temprano** → muestra solo un `input type="time"`; valida hora ≤ ahora.
  - **Otro día** → muestra fecha + hora.
- Línea de resumen bajo los chips: "Desde hoy a las 08:30" / "Desde el jue 02/10 a las 08:30" (`aria-live="polite"`).
- Se conservan los límites de fecha existentes (sin futuro; antigüedad máxima vigente en `vigencia-field.tsx` / `validacion-trayectoria.ts`).
- Desaparecen el panel desplegable y el botón "Volver a Ahora".

### 5.4 Alcance — categoría alumnos

- Título: **"Alumnos afectados"**.
- Cada sección es un **acordeón agrupador sin checkbox**. No existe forma de seleccionar la sección entera.
- Cabecera de la sección: nombre, turno y, si hay ≥ 1 alumno marcado, badge **"X de Y seleccionados"**.
- Dentro: checkbox por alumno. Sin "Seleccionar todos".
- Resumen inferior: "4 alumnos afectados en 2 secciones".
- Aplica la red de seguridad de §3.2.
- Persistencia: `infra_afectacion_seccion` + `infra_afectacion_alumno` con al menos un alumno por sección guardada (en alumnos, una sección sin alumnos no es válida; hoy significa "sección completa").

### 5.5 Alcance — categoría establecimiento

- Primer control, selección única: **"Toda la escuela"** / **"Algunas secciones"**.
- "Algunas secciones" despliega las secciones agrupadas por turno, con checkbox simple por sección y "Todo el turno" por grupo. **No hay checkbox maestro de tres estados.**
- Al marcar una sección, se **despliega automáticamente** su listado de alumnos en **solo lectura, todos tildados**, para hacer evidente qué abarca. Se puede plegar.
- Si marca todas las secciones a mano, no cambia solo a "Toda la escuela": aviso discreto "Marcaste todas: ¿es toda la escuela?" con acción para cambiar.
- Persistencia: "Toda la escuela" = todas las secciones sin filas de alumno (semántica actual de sección completa).

### 5.6 Clases y edificio (reemplaza "¿Cómo sigue el servicio?")

Se elimina la palabra "funcionamiento" de ambas preguntas.

- **"¿Hay clases?"** → "Sí, con normalidad" (`normal`) / "No, se suspendieron" (`suspendido`). El estado `parcial` sigue siendo solo informativo y calculado.
- **"¿Cómo está el edificio?"** → "Sin daños / en uso normal" (`habitual`) / "Uso parcial" (`parcial`) / "Evacuado" (`evacuado`) / "Usado como centro de evacuados" (`centro_evacuados`). Los valores persistidos no cambian; solo las etiquetas (`ETIQUETA_SERVICIO`, `ETIQUETA_ESTABLECIMIENTO` en `components/infraestructura/estado-actual-textos.ts`, que también se muestran en lecturas).
- **Regla: Evacuado ⇒ sin clases.** Al elegir "Evacuado", "¿Hay clases?" pasa a "No, se suspendieron" y queda bloqueada con la nota "El edificio está evacuado". Validado también en servidor.
- **Interrupción total con alcance parcial:** si el alcance es "Algunas secciones" y se elige un estado que implica interrumpir toda la escuela, se abre un **bottom sheet**: "Esto interrumpe toda la escuela, pero marcaste solo algunas secciones. ¿Pasamos el alcance a toda la escuela?" → "Sí, toda la escuela" (cambia el alcance) / "Cancelar" (revierte la elección). Reemplaza el texto + checkbox actual (`confirmarInterrupcionTotal` en `reporte-inicial-form.tsx`).
- "¿Se brinda asistencia pedagógica?" se mantiene.

### 5.7 Borrador y retoma

- El borrador del wizard se guarda localmente **en cada cambio de paso** (mismo almacén que `envio-offline.ts`, clave por tipo + CUE), incluyendo el paso actual.
- Al volver a entrar, estado inequívoco:
  - **Borrador sin enviar:** banner "Tenés un parte sin enviar. Continuá donde lo dejaste." → "Continuar" (abre en el paso guardado) / "Descartar" (bottom sheet de confirmación).
  - **Enviado sin confirmar del servidor:** indicador "Pendiente de envío" + reintento (§7).
  - **Enviado:** sin banner; figura en el historial con su hora.
- Un borrador nunca se confunde con un parte enviado: textos, color e ícono distintos.

## 6. Actualizar (Fase 3)

### 6.1 Pantalla de entrada (layout A)

De arriba hacia abajo:

1. **"Tu última carga: hoy 10:42 · Evacuación preventiva"** — último movimiento del director con hora absoluta (y relativa si es de hoy).
2. **Situación principal** (§3.3): tarjeta destacada con motivo, badge de gravedad, estado de clases/edificio y "desde <fecha hora>".
3. **También activas:** lista compacta en orden de relevancia, cada una con gravedad, "desde" y cantidad de actualizaciones.
4. **Historial:** línea de tiempo vertical con las **2 últimas** entradas y "Ver N movimientos anteriores" plegado (§6.5).
5. Acción principal fija abajo: **"Actualizar situación"**, que inicia el recorrido guiado.

### 6.2 Recorrido guiado

**Paso 1 · Lo que ya reportaste.** Una pantalla por situación activa, en orden de relevancia: "¿Cómo sigue?"

- **Sigue igual** → registra movimiento `confirmacion`.
- **Cambió** → §6.3.
- **Se solucionó** → pide "¿Cuándo se solucionó?" (chips §5.3), cierra con `cierre = 'solucionada'` y ejecuta la cascada (§6.4).

Ninguna situación activa queda sin respuesta: es obligatorio responder todas antes de pasar al paso 2.

**Paso 2 · ¿Pasó algo nuevo?** → "No, nada nuevo" (termina y envía) / "Sí, hay un problema nuevo".

Si es nuevo, **siempre** (sin importar el motivo) antes del wizard:

- **"¿Es consecuencia de algo anterior?"** → lista de situaciones activas + cerradas hace ≤ 15 días ("Sí, de la Inundación (jue 02/10)") o "No, es independiente".
- Si coincide el **motivo** con una situación activa, se agrega la pregunta de continuidad: "Ya tenés activa 'Sin energía o agua' desde el mar 30/09. ¿Qué pasó con esa?" → "Sigue igual: es la misma, quiero actualizarla" (vuelve a esa situación en modo "Cambió") / "Se solucionó y esto es nuevo" (la cierra con su fecha) / "Son dos problemas distintos a la vez".

Luego se recorre el wizard de §5 para la situación nueva (con `causada_por_id` si corresponde).

Todo el recorrido se envía como **un único POST** idempotente (una `idempotencyKey`), que genera un movimiento por situación tocada.

### 6.3 "Cambió"

Bottom sheet de selección múltiple **"¿Qué cambió en <motivo>?"**:

- [ ] La gravedad
- [ ] A quién afecta (secciones / alumnos)
- [ ] Las clases o el edificio

Luego se muestran **solo** los bloques elegidos, prellenados con el último valor, con las mismas reglas de §5 (criterios, sugerido, justificación de Crítica, red de seguridad, Evacuado ⇒ sin clases) y su "¿Desde cuándo pasa esto?". El movimiento guarda `cambios[]` con `antes`/`despues`.

### 6.4 Cascada al solucionar

Al marcar "Se solucionó" una situación que es causa de situaciones activas, por cada consecuencia activa:

> "La Inundación se solucionó. El corte de luz (causado por la Inundación), ¿también?"
> "Sí, también se solucionó" / "No, sigue activo"

"Sí" la cierra con la misma fecha (editable). "No" la deja activa; conserva `causada_por_id`. La cascada es recursiva sobre la cadena.

### 6.5 Línea de tiempo

- Vertical, agrupada por día ("Hoy, sáb 04/10", "Jue 02/10"), entradas de más nueva a más vieja.
- Cada entrada: **hora**, punto de color por gravedad, texto del movimiento y diferencias (**"Gravedad: Alta → Crítica"**, "Alcance: 2 → 5 secciones", "Clases: suspendidas").
- Vínculos visibles: **"Sin energía o agua ← causado por Inundación"**; cierres: "Inundación — solucionada (jue 18:00)".
- En la pantalla de entrada se ven 2 entradas; el resto se despliega bajo demanda. Reutiliza/reemplaza `components/infraestructura/historial-movimiento.tsx`.

## 7. Envío resiliente

### 7.1 Fase 0 — bug "Pendiente de envío" con conexión

Hipótesis a confirmar con debugging sistemático (no asumida): en `lib/infraestructura/parte/envio-offline.ts`, `clasificarRespuesta` trata cualquier `5xx` como `reintentable` y `registrarPendiente` lo muestra con el texto `'Pendiente de envío — se enviará al recuperar conexión'`. Un error del servidor estando online queda presentado como falta de conexión. También revisar si un borrador `pendiente-envio` viejo del almacén local se muestra al montar el formulario.

Criterio de aceptación: el mensaje de "sin conexión" aparece **solo** cuando el pedido falló por red; un error del servidor se comunica como tal ("El servidor no respondió. Reintentamos en unos segundos.") y conserva el reintento con la misma `idempotencyKey`. Test de regresión que lo reproduzca primero.

### 7.2 Estados visibles

Indicador chico y persistente durante y después del envío:

| Estado | Texto | Cuándo |
|---|---|---|
| Enviando | "Enviando…" (con loader) | pedido en curso |
| Enviado | "Enviado ✓ 10:42" | 2xx con cuerpo válido (`validarExito`) |
| Sin conexión | "Sin conexión: se envía solo cuando vuelva" | falla de red (`fetch` rechazado) |
| Error del servidor | "El servidor no respondió. Reintentamos." | 5xx |
| Error | mensaje del servidor + "Reintentar" | 4xx no reintentable |
| Sesión vencida | mensaje existente | 401/403 |

El estado se deriva **del resultado real del pedido**, nunca de `navigator.onLine` solo.

### 7.3 Reintento

Reintento automático con el backoff existente (`calcularEsperaReintento`) al recibir `online` y `visibilitychange` → visible. Misma `idempotencyKey` entre reintentos (sin cambios en el contrato actual).

### 7.4 Fase 4 — envío en segundo plano (mobile)

Service worker con **Background Sync** para enviar la cola aunque el director cierre la pestaña. Con fallback al reintento en primer plano de §7.3 donde la API no exista (Safari/iOS). Se diseña en detalle al llegar a la fase.

## 8. Fases y entregas

Cada fase es una entrega independiente, revisable y probable por separado.

| Fase | Contenido | Depende de |
|---|---|---|
| 0 | Bug de estado de envío (§7.1) + indicador de estados (§7.2–7.3) | — |
| 1 | Modelo: §4 completo + ABM con gravedad sugerida + `compararRelevancia` + validaciones de servidor | — |
| 2 | Iniciar reporte: §5 completo, primitivas mobile (§3.1), red de seguridad (§3.2) | 1 |
| 3 | Actualizar: §6 completo | 1, 2 |
| 4 | Background Sync (§7.4) | 0 |

## 9. Datos existentes

- Partes cargados antes del cambio conservan su gravedad; no se recalcula ni se pide justificación retroactiva.
- Situaciones legadas sin `causada_por_id` se muestran sin vínculo.
- Situaciones con `retirada_en` previas → `cierre = 'retirada'`, se muestran como "cerrada" en la línea de tiempo.
- Movimientos con `resumen` en el formato viejo se renderizan con un adaptador de compatibilidad (texto genérico "Actualización") sin romper la línea de tiempo.

## 10. Pruebas

- **Unitarias (vitest):** `compararRelevancia`; regla de exigencia de justificación (sugerido Crítica / no Crítica / sin sugerido); validación de causa (misma escuela, ventana 15 días, sin ciclos); Evacuado ⇒ suspendido; red de seguridad > 50 %; clasificación de respuestas de envío (red vs 5xx vs 4xx); diff de movimientos.
- **Componentes (@testing-library/react):** chips de vigencia (Ahora / Hoy / Otro día y resumen); selector de alumnos sin selección de sección y badge "X de Y"; selector de establecimiento sin checkbox de tres estados y despliegue en solo lectura; bottom sheets (categoría, Crítica, interrupción total, cascada); recorrido guiado completo; retoma de borrador y sus tres estados.
- **API:** endpoint de parte rechaza Crítica sin justificación cuando corresponde, causa inválida, Evacuado con clases normales; idempotencia de un recorrido de actualización con múltiples situaciones.
- **Manual mobile:** viewport 360×740 y dispositivo real; modo avión a mitad del wizard y al enviar.

## 11. Archivos afectados (referencia, verificar al planificar)

- `lib/db/schema.ts`, `drizzle/` — columnas nuevas (§4).
- `lib/infraestructura/motivos.ts` — semilla y tipo `MotivoRow.severidadSugerida`; ABM admin de motivos.
- `lib/infraestructura/severidad.ts` — criterios por categoría.
- `lib/infraestructura/validacion-trayectoria.ts`, `lib/infraestructura/validacion*.ts` — reglas de §4.3–4.4, §5.6.
- `lib/infraestructura/parte/envio-offline.ts` — §7.
- `components/infraestructura/reporte-inicial-form.tsx`, `afectacion-campos.tsx`, `secciones-selector.tsx`, `vigencia-field.tsx`, `estado-actual-textos.ts` — §5.
- `components/infraestructura/actualizacion-form.tsx`, `historial-movimiento.tsx` — §6.
- `components/ui/sheet.tsx` — bottom sheet (§3.1).
- `app/api/problematicas/parte/route.ts` — validaciones de servidor y POST de recorrido.
