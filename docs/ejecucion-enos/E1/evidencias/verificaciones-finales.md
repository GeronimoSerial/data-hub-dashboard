# Evidencia — verificaciones globales finales (E1)

Corridas al cierre del batch, con todas las olas integradas (incluidas las dos correcciones de la revisión adversarial).

## pnpm test

```
Test Files  119 passed (119)
     Tests  959 passed (959)
```

Nota: se observó una falla intermitente ajena a E1 en `components/mapas/map-infraestructura-page.test.tsx` ("filtra por departamento al hacer click y permite quitar el filtro") bajo carga del suite completo; aislado (`pnpm exec vitest run components/mapas/map-infraestructura-page.test.tsx`) pasa siempre (5/5). No toca ningún archivo de E1.

## pnpm lint

```
$ eslint .
```
Sin salida — 0 errores, 0 warnings.

## pnpm exec tsc --noEmit

Sin salida — 0 errores.

## pnpm build

```
exit=0
```
Rutas nuevas confirmadas en el build:
```
ƒ /admin/episodios
ƒ /admin/episodios/[id]
ƒ /api/infraestructura/episodios
ƒ /api/infraestructura/episodios/[id]
ƒ /api/infraestructura/verificaciones
ƒ /api/infraestructura/verificaciones/[id]/cancelar
ƒ /api/infraestructura/verificaciones/[id]/responder-asistida
ƒ /api/problematicas/verificaciones/[id]/canjear-sesion
ƒ /api/problematicas/verificaciones/[id]/responder
ƒ /api/problematicas/verificaciones/[id]/validar-token
ƒ /api/problematicas/verificaciones/[id]/vincular-movimiento
ƒ /problematicas/verificaciones/[id]
```

## Subconjuntos de tests de E1 (para trazabilidad rápida)

| Comando | Resultado |
|---|---|
| `pnpm exec vitest run lib/db/seed.test.ts` | 15/15 |
| `pnpm exec vitest run lib/infraestructura/verificacion-token.test.ts` | 8/8 |
| `pnpm exec vitest run lib/infraestructura/episodios.test.ts lib/infraestructura/verificaciones.test.ts` | 31/31 |
| `pnpm exec vitest run app/api/infraestructura/episodios app/api/infraestructura/verificaciones app/api/problematicas/verificaciones` | 45/45 |
| `pnpm exec vitest run lib/infraestructura/verificacion-sesion.test.ts` | 8/8 |
| `pnpm exec vitest run components/infraestructura/episodio-crear-form.test.tsx components/infraestructura/verificaciones-cola.test.tsx components/infraestructura/verificacion-responder.test.tsx` | 29/29 |
| `pnpm exec vitest run app/api/problematicas/parte/route.test.ts app/api/problematicas/parte/route.sin-corte.test.ts` | 31/31 (incluye vínculo en los 3 caminos + fix de carrera + fix cross-CUE) |
