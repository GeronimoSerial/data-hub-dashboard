# Batch 08 — Integración, QA y hardening final

## Misión

No agregar features nuevas.

Tomar toda la transformación integrada y llevarla a estado de release:

- coherencia;
- accesibilidad;
- responsive;
- seguridad;
- performance;
- eliminación de legado innecesario;
- regresión de rutas;
- regresión ACL;
- calidad visual.

Este batch debe ser especialmente agresivo con inconsistencias introducidas por distintos subagentes.

---

## Estrategia de delegación

Separar QA por dominios.

No delegar “revisá todo”.

Sugerencia:

1. navegación/routing;
2. explore/search/filter state;
3. resource/access;
4. explain-resource security;
5. share-state;
6. admin/roles;
7. accessibility/keyboard;
8. responsive/visual;
9. performance/server-client boundaries;
10. DRY/dead code.

Cada auditor produce findings concretos.

Las correcciones se vuelven a delegar como tareas atómicas nuevas.

---

## Task 1 — Routing regression

Verificar:

```text
/
/explorar
/reportes
/tableros
/mapas
/mapas/matricula
/recursos/[id]
/login
/forbidden
/admin
```

Incluyendo:

- navegación directa;
- refresh;
- deep link;
- back;
- forward;
- 404;
- callbackUrl.

---

## Task 2 — ACL matrix

Crear matriz real de escenarios:

| Usuario | Público | Restringido permitido | Restringido no permitido | Draft | Admin |
|---|---:|---:|---:|---:|---:|
| Sin sesión | | | | | |
| Consulta | | | | | |
| Editor | | | | | |
| Admin | | | | | |
| Baneado | | | | | |

Validar server behavior y UI behavior por separado.

La UI nunca puede ser la única protección.

---

## Task 3 — Explain security audit

Verificar específicamente:

- input builder;
- server auth;
- cache key;
- cache scope;
- prompts;
- logs;
- error messages;
- restricted content.

Buscar cualquier leak indirecto.

---

## Task 4 — Share-state hardening

Probar:

- parámetros arbitrarios;
- valores enormes;
- valores faltantes;
- strings malformados;
- entidades eliminadas;
- vista guardada antigua.

No permitir crashes ni loops.

---

## Task 5 — Accessibility

Keyboard-only:

- header;
- mobile navigation;
- search;
- filters;
- dialogs;
- dropdowns;
- admin.

Revisar:

- focus visible;
- landmarks;
- labels;
- headings;
- aria-live donde realmente haga falta;
- orden de tab;
- contrastes;
- reduced motion si aplica.

No parchear accesibilidad que el primitive shadcn/Base UI ya resuelve con hacks manuales.

---

## Task 6 — Responsive

Anchos mínimos:

- 320 px
- mobile común
- tablet
- desktop
- desktop ancho

Buscar:

- overflow;
- cards rotas;
- filtros imposibles;
- breadcrumbs interminables;
- botones demasiado pequeños;
- viewers cortados;
- admin unusable.

---

## Task 7 — Performance

Auditar:

- client components demasiado altos;
- imports innecesarios;
- providers globales;
- render loops;
- query duplication;
- URL updates excesivos;
- AI bundle en cliente;
- data fetch duplicada.

La IA debe vivir server-side salvo la UI necesaria.

---

## Task 8 — shadcn/Base UI compliance

Buscar manualmente en el repo:

- dialogs custom;
- dropdowns custom;
- focus traps;
- selects custom;
- popovers custom;
- accordions custom;
- nav menu custom;
- sidebars custom;
- keyboard roving manual.

Si hay equivalentes shadcn/Base UI disponibles, reemplazarlos.

No confundir componentes de dominio con primitives.

---

## Task 9 — DRY / dead code

Después de consolidar `/explorar`:

- eliminar queries duplicadas;
- eliminar cards viejas sin consumidores;
- eliminar filtros antiguos;
- eliminar wrappers redundantes;
- consolidar types/helpers.

No borrar rutas históricas si todavía son parte de compatibilidad.

---

## Task 10 — Final visual consistency

Un agente visual revisa:

- spacing;
- heading hierarchy;
- labels;
- badges;
- CTA language;
- empty states;
- error language;
- loading states;
- locked states;
- admin vs public distinction.

No debe rediseñar arquitectura.

---

## Final acceptance criteria

### Navigation
- [ ] navegación primaria es simple.
- [ ] no está centrada en tres formatos.
- [ ] mobile/desktop equivalentes.

### Explore
- [ ] filtros son shareable.
- [ ] back/forward funciona.
- [ ] legacy routes funcionan.

### Resource
- [ ] el recurso se entiende sin jerga.
- [ ] acceso se comunica correctamente.
- [ ] related es determinístico.

### Explain
- [ ] conciso.
- [ ] no chat.
- [ ] no leak.
- [ ] cache segura.
- [ ] falla con elegancia.

### Share
- [ ] URL canónica.
- [ ] vista restaurable.
- [ ] permisos no se comparten.

### Admin
- [ ] navegación separada.
- [ ] capacidades según rol.
- [ ] server enforcement intacto.

### UI
- [ ] primitives shadcn/Base UI.
- [ ] no primitives manuales.
- [ ] responsive.
- [ ] keyboard.
- [ ] accesible.

### Engineering
- [ ] lint.
- [ ] typecheck.
- [ ] tests.
- [ ] build.
- [ ] sin TODOs temporales.
- [ ] sin duplicación evidente.
- [ ] sin deuda conocida del migration path.

---

## Cierre

El Team Leader no declara finalizado el proyecto hasta revisar personalmente el diff completo acumulado y comprobar los flujos end-to-end.

Si una corrección final toca una responsabilidad compleja, delegarla como tarea fresca. No reutilizar un contexto viejo solo porque “ya conoce el proyecto”.
