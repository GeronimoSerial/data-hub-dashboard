# Batch 01 — Foundation, Base UI y navegación global

## Misión

Crear la base visual y de navegación sobre la cual se apoyará toda la transformación.

Este batch no debe todavía implementar `/explorar` completo ni IA.

Debe cerrar:

- configuración de shadcn sobre Base UI;
- primitives estándar;
- header desktop/mobile;
- navegación global;
- cuenta/login/admin según sesión y rol;
- shell responsive;
- patrón reutilizable para breadcrumbs y acciones globales.

---

## Resultado funcional

Navegación visible objetivo:

```text
Inicio
Explorar
Buscar
Cuenta
```

`Administración` aparece únicamente para staff, preferentemente dentro del menú de cuenta o como acceso contextual no dominante.

Los formatos `Reportes`, `Tableros` y `Mapas` dejan de ser los tres pilares del header.

---

## Invariantes

- No cambiar enforcement de auth/ACL.
- No exponer `/admin` a usuarios sin staff aunque el servidor ya lo bloquee.
- No convertir todo el layout en client component.
- No crear menus/dropdowns/sheets manuales.
- No agregar navegación que dependa de datos inexistentes.
- Mantener rutas actuales funcionando durante la transformación.

---

## Componentes shadcn/Base UI esperables

Evaluar e instalar solo los necesarios:

- Button
- Navigation Menu
- Sheet o Drawer para mobile
- Dropdown Menu
- Avatar
- Command (shell de búsqueda global si corresponde)
- Breadcrumb
- Separator
- Tooltip
- Badge

No crear reemplazos manuales.

---

## Tareas atómicas sugeridas

### Task 1 — Audit UI foundation

Delegar a un agente fresco.

Objetivo:

- inspeccionar `components.json`;
- detectar primitive library actual;
- inventariar componentes shadcn existentes;
- detectar primitives manuales equivalentes;
- detectar mezcla Radix/Base UI;
- proponer el cambio mínimo necesario para cumplir Base UI.

Entrega: auditoría concreta, sin rediseñar.

El Team Leader decide la estrategia antes de seguir.

---

### Task 2 — Normalize shadcn/Base UI

Solo si el audit lo requiere.

Objetivo:

- dejar la configuración coherente con Base UI;
- instalar primitives canónicos necesarios;
- migrar únicamente los componentes afectados por este batch;
- no hacer una migración masiva sin justificación.

Validar imports y comportamiento.

---

### Task 3 — Global navigation information architecture

Implementar el modelo de navegación:

- Inicio
- Explorar
- búsqueda
- cuenta
- administración condicional

Debe usar la sesión/rol ya disponibles, sin replicar lógica de roles.

---

### Task 4 — Desktop header

Implementar header desktop:

- jerarquía simple;
- estado activo;
- acceso claro a búsqueda;
- menú de cuenta;
- accesibilidad por teclado;
- foco visible.

No agregar mega-menu salvo que haya una necesidad real demostrada.

---

### Task 5 — Mobile navigation

Implementar navegación mobile con primitive shadcn/Base UI adecuada.

Criterios:

- touch targets cómodos;
- no overflow horizontal;
- estado activo;
- cierre correcto al navegar;
- foco controlado por el primitive;
- sin reimplementar focus trap.

---

### Task 6 — Breadcrumb primitive/composition

Crear una composición reutilizable para breadcrumbs semánticos.

No debe inferir breadcrumbs a partir del pathname técnico.

Debe aceptar datos semánticos:

```ts
[
  { label: "Explorar", href: "/explorar" },
  { label: "Matrícula", href: "..." },
  { label: "Matrícula provincial" }
]
```

---

## Acceptance criteria

- [ ] shadcn está configurado y usado con Base UI para los primitives de este batch.
- [ ] no hay un Dialog/Menu/Sheet/Tooltip/etc. reinventado manualmente.
- [ ] header desktop funciona.
- [ ] navegación mobile funciona.
- [ ] Inicio y Explorar son las opciones principales.
- [ ] Reportes/Tableros/Mapas ya no dominan el header.
- [ ] administración solo aparece para staff.
- [ ] la navegación no sustituye enforcement de servidor.
- [ ] teclado y foco son utilizables.
- [ ] no se introdujo un `"use client"` innecesario en el layout completo.
- [ ] lint/typecheck/build relevante pasa.
- [ ] rutas existentes siguen accesibles.

---

## Out of scope

- filtros completos;
- cards de recursos definitivas;
- IA;
- sharing;
- rediseño de admin;
- cambio de modelo de datos;
- cambio de ACL.
