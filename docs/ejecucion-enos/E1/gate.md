# Gate E1 — Episodios y verificación explícita de punta a punta

| Campo | Valor |
|---|---|
| Decisión N1 | **Aceptado técnicamente para merge** en la rama de integración checkouteada. Pendiente de revisión del usuario antes de habilitar E2. |
| Estado | Implementado · validado técnicamente · **no** habilitado operativamente (gate UX con participantes pendiente) |
| Responsable | N1 (coordinador raíz) |
| Base | `feat/renovación` en `9af3f2e` → rama `feat/enos-e1` |
| Fecha | 2026-09-26 |
| Run Orca | `run_3ae1abf38965` |

## Decisiones de N1 aplicadas

- Atribución: «respuesta por enlace de solicitud» (canal=enlace), nunca identidad personal del director; respuesta asistida con actor autenticado y canal. La contraseña compartida no responde verificaciones.
- Convivencia con partes: «sin afectación» nunca cierra ni modifica un parte vigente; registra discrepancia para operador. «Con afectación» reutiliza el formulario de parte y enlaza el movimiento real; si el vínculo falla, queda visible (`verificacionVinculada=false` + evento `vinculo_fallido`).
- Estados: pendiente → respondida | cancelada; «vencida» derivada del reloj; respuesta tardía conserva demora; `no_disponible` no cuenta como normalidad; reintento idéntico idempotente, contradictorio 409.
- Acceso del director al parte (opción A, consulta `msg_0f04b28bee25`): la sesión canjeada del token abre el formulario sólo para su CUE.
- Regla de diseño del gate: **la sesión nunca es más fuerte que el token**; se re-chequea contra la fila de la verificación en cada uso.

## Rondas de gate

| Ronda | Dispatch | Resultado | Motivo |
|---|---|---|---|
| 1 | `ctx_a3fddf9c9c19` (E1) | Devuelto | Verificaciones en verde (959/959). **Bloqueante:** un token consumido seguía canjeando sesiones que reabrían el formulario de parte. **Mayores:** la sesión no se re-chequeaba contra la fila (revocar/cancelar no la cortaba); la página del token no enviaba `Referrer-Policy` ni quitaba el token de la URL; la página pública no mostraba el nombre de la escuela. Dos menores. |
| 2 | `ctx_25fd2ea56107` → `ctx_deaf1ffb40d1` → `ctx_0eb8a4ca1bc1` (E1-fix1) | **Aceptado** | Dos N2 murieron por reinicios de Orca/máquina; el tercero cerró. Durante el cierre, la revisión N3 detectó que las 4 páginas de `app/problematicas/parte/**` no aceptaban la sesión (N1 amplió el alcance, consulta `msg_8b086b3532a3`) y una segunda revisión cerró el endpoint de historial. |

## Verificación ejecutada por N1 (ronda 2)

| Comando | Exit | Resultado |
|---|---|---|
| `pnpm test` | 0 | 124 archivos, 1018/1018 tests |
| `pnpm lint` | 0 | sin errores |
| `pnpm exec tsc --noEmit` | 0 | sin errores |
| `pnpm build` | 0 | build de producción completo |

## Revisiones independientes de N1

- **Ronda 1** (revisor sonnet, sólo lectura): aislación entre CUEs, máquina de estados con transiciones condicionales, auditoría sin secretos ni datos nominales, permisos staff en gestión, respuestas privadas y migración aditiva: OK. Hallazgos de sesión/token → devuelto.
- **Ronda 2** (revisor sonnet nuevo, sólo lectura): las 7 entradas que otorgan acceso al parte (API GET/POST, historial y las 4 páginas) re-validan estado `pendiente`, token no consumido, no revocado y no vencido contra la base en cada uso; `canjear-sesion` rechaza tokens muertos y la UI muestra comprobante «ya respondida»; el CUE de la sesión es la autoridad frente al de la request; contraseña/admin sin cambios; `Referrer-Policy: no-referrer` y `history.replaceState` presentes. 119 tests focalizados en verde. Sin hallazgos.

## Autoría (para la revisión del usuario)

Los N3 (opencode `deepseek-v4.1-flash`) implementaron esquema, dominio, API, UI y todas las correcciones. El N2 escribió directamente, fuera de protocolo y registrado en `dispatches.json`: el vínculo en `respuestaExito` de `app/api/problematicas/parte/route.ts` (replay/carrera), un ajuste de tipos en `verificacion-responder.test.tsx`, un import sin uso en `episodios.test.ts` y un test en `parte/route.test.ts`. Tras la indicación de N1 volvió a delegar.

## Pendientes con dueño

| Pendiente | Dueño | Bloquea |
|---|---|---|
| Gate UX con 5 participantes (4/5 responden en ≤30 s sin asistencia); recorrido en `ux.md` | Usuario | Habilitación operativa, no E2 |
| Capturas baseline 390×844 / 1366×768 (sin navegador en las sesiones de N2) | N2 de E2 o sesión con navegador | Gate UX |
| Envío del enlace: E1 no integra canales externos (por diseño) | Operación | No |
| Revalidar el formato de error de `drizzle-orm` si cambia de versión (detección de carrera de idempotencia) | Quien actualice la dependencia | No |

## Siguiente paso

Merge de `feat/enos-e1` en la rama checkouteada del repositorio principal (sin push). **E2 no se abre hasta que el usuario revise E1 y lo apruebe.** La preparación de E2 está en `feat/enos-e2-prep` (`ea242f0`), sin mergear.
