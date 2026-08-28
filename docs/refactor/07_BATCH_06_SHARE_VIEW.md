# Batch 06 — Compartir la vista actual

## Misión

Permitir que un usuario comparta:

1. un recurso;
2. una vista filtrada de `/explorar`;
3. cuando el viewer lo soporte, **el estado exacto relevante de la visualización**.

La URL debe ser el contrato compartible.

---

## Principios

- copiar un enlace debe ser suficiente;
- quien abre el enlace debe reconstruir la misma vista cuando sea posible;
- parámetros deben ser legibles/estables;
- no guardar información sensible en query params;
- auth/ACL se ejecuta normalmente al abrir el enlace;
- un enlace compartido no otorga permisos;
- no serializar estado irrelevante o efímero.

---

## Scope inicial

### `/explorar`

Ya debe conservar:

- búsqueda;
- tema;
- nivel;
- formato;
- filtros adicionales soportados.

### `/recursos/[id]`

Compartir URL canónica del recurso.

### Mapas/viewers con estado

Definir un contrato por viewer para los estados realmente útiles.

Ejemplo posible:

```text
?localidad=goya
&nivel=secundario
&layer=matricula
&zoom=10
&lat=...
&lng=...
```

No asumir que todos esos campos existen.

Serializar solamente el estado que el viewer real posee y que aporta valor.

---

## Tareas atómicas sugeridas

### Task 1 — Share state audit

Por cada viewer actual:

- identificar estado útil;
- identificar estado sensible;
- identificar estado derivable;
- definir qué vale la pena compartir.

No implementar todavía.

---

### Task 2 — Generic share contract

Crear una API interna pequeña, por ejemplo conceptualmente:

```ts
getShareUrl()
parseViewState()
serializeViewState()
```

No crear una abstracción gigantesca.

Cada viewer puede implementar un adapter pequeño.

---

### Task 3 — Explore sharing

Verificar que la URL producida por filtros ya sea canónica y compartible.

Agregar normalización si es necesario.

---

### Task 4 — Resource sharing UI

Crear `ShareView` usando primitives shadcn/Base UI.

Acciones mínimas:

- Copiar enlace
- Compartir con Web Share API cuando exista, como enhancement opcional

No depender de Web Share API para el flujo principal.

No implementar un Dropdown/Popover manual.

---

### Task 5 — Map state serialization

Implementar para el mapa prioritario.

Requisitos:

- parsear;
- validar;
- clamp;
- ignorar valores inválidos;
- restaurar estado después de cargar datos/layers;
- no generar loops de URL;
- no actualizar history en cada movimiento mínimo si eso degrada UX.

---

### Task 6 — Restore flow

Abrir URL compartida debe:

1. validar auth/ACL;
2. cargar viewer;
3. validar params;
4. restaurar estado;
5. degradar con elegancia si parte del estado dejó de existir.

---

### Task 7 — Tests

Casos:

- URL sin estado;
- URL válida;
- URL parcial;
- URL con valores inválidos;
- entidad/localidad inexistente;
- usuario no autorizado;
- back/forward;
- copiar enlace;
- mobile.

---

## Acceptance criteria

- [ ] `/explorar` puede compartirse conservando filtros.
- [ ] recurso puede compartirse con URL canónica.
- [ ] mapa prioritario restaura su estado útil.
- [ ] enlace no otorga permisos.
- [ ] parámetros sensibles nunca aparecen.
- [ ] parser tolera URLs antiguas o inválidas.
- [ ] no hay jitter/loops de history.
- [ ] feedback de copiar es claro.
- [ ] UI usa shadcn/Base UI.
- [ ] back/forward funciona.
- [ ] tests/checks pasan.

---

## Out of scope

- links firmados;
- permisos temporales;
- short URLs;
- QR;
- social previews personalizados;
- colaboración en tiempo real.
