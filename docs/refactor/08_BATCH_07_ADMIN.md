# Batch 07 — Administración y experiencia editorial

## Misión

Separar claramente la experiencia pública de la experiencia de administración sin alterar el modelo de permisos.

El admin debe sentirse como una herramienta interna para:

- contenido;
- organización/taxonomías;
- accesos/usuarios.

---

## Navegación objetivo

```text
Administración

Contenido
  Recursos

Organización
  Categorías
  Tags
  Niveles
  Tipos

Accesos
  Usuarios

────────────
Volver al Hub
```

Respetar capabilities reales:

- editor: contenido permitido;
- admin: taxonomías + usuarios según reglas actuales.

No mostrar acciones que el rol no puede ejecutar.

El backend mantiene enforcement.

---

## Componentes shadcn/Base UI esperables

- Sidebar
- Button
- Table/Data Table composition
- Tabs solo si aporta
- Dialog
- Alert Dialog
- Select
- Input
- Checkbox/Switch
- Badge
- Dropdown Menu
- Form primitives existentes
- Tooltip
- Separator

No construir sidebar/dialog/confirmaciones manuales.

---

## Tareas atómicas sugeridas

### Task 1 — Admin information architecture audit

Mapear UI actual contra capacidades reales de APIs/roles.

Detectar:

- acciones que aparecen pero fallan por permisos;
- taxonomías mezcladas;
- responsabilidades ambiguas;
- duplicación de forms.

---

### Task 2 — Admin shell/sidebar

Crear shell separado del Hub público.

Debe conservar:

- sesión;
- role;
- logout;
- volver al Hub;
- responsive.

---

### Task 3 — Resource management view

Mejorar listado:

- nombre;
- formato;
- estado publicado/borrador;
- acceso/audiencia resumida;
- actualización;
- acciones.

No exponer ids internos como columna principal salvo necesidad administrativa real.

---

### Task 4 — Resource editor UX

Agrupar campos por intención:

```text
Información
Clasificación
Acceso
Contenido
Publicación
```

No cambiar modelo de datos si no es necesario.

Reutilizar schemas y validation existentes.

---

### Task 5 — Explain-resource editorial visibility

Si Batch 05 guarda cache o metadata persistente:

- mostrar estado de explicación;
- permitir invalidar/regenerar solamente si aporta valor;
- no obligar al editor a mantener texto AI manualmente.

Si la cache no es persistente/editorial, omitir esta tarea.

No agregar controles por “tener IA”.

---

### Task 6 — Taxonomies

Admin-only según ACL existente.

Mejorar:

- estado vacío;
- confirmación de delete;
- mensaje “en uso”;
- naming coherente.

No cambiar reglas `taxonomyInUse` ni last-admin guard.

---

### Task 7 — Users/access

UI debe reflejar capacidades reales.

No duplicar reglas de `wouldRemoveLastAdmin` en frontend como enforcement; puede anticipar UX, pero backend decide.

---

## Acceptance criteria

- [ ] admin tiene navegación propia.
- [ ] usuarios normales nunca ven acceso admin.
- [ ] editor/admin ven solamente acciones relevantes.
- [ ] backend sigue siendo fuente de verdad.
- [ ] formularios usan primitives shadcn/Base UI.
- [ ] no hay confirm dialogs manuales.
- [ ] recursos/taxonomías/usuarios están claramente separados.
- [ ] volver al Hub es evidente.
- [ ] mobile es usable.
- [ ] guards existentes siguen funcionando.
- [ ] no se rompe last-admin protection.
- [ ] checks pasan.

---

## Out of scope

- nueva jerarquía de roles;
- workflows de aprobación complejos;
- auditoría histórica completa;
- CMS externo.
