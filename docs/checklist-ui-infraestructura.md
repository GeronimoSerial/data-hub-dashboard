# Checklist UI de infraestructura

Seguimiento visual por componente. Actualizado: 17 de octubre de 2026.

Pantalla principal: `/mapas/infraestructura`.

## Hecho

- [x] **Cabecera del mapa:** navegación, modos y controles agrupados.
- [x] **Vista previa de escuela:** tarjeta compacta al seleccionar un marcador, sin doble contenedor ni altura estirada.
- [x] **Ficha completa de escuela:** página propia con situaciones, acceso, evidencia, historial y contexto territorial. Se abre desde «Abrir ficha completa».
- [x] **Regreso al mapa:** conserva el contexto y mantiene la instancia del mapa al volver desde la ficha.

## En curso

_(nada)_

## Falta

- [ ] **Sidebar izquierdo:** limpiar y simplificar el listado existente, junto al mapa. Sin buscador propio (alcanza el de la cabecera) ni `select`. Primer intento descartado por sobrecarga.
- [ ] **Panel de capas y herramientas:** ordenar los controles y recuperar espacio del mapa.
- [ ] **Resumen del mapa:** simplificar indicadores y su jerarquía.
- [ ] **Monitoreo de ríos:** listado de estaciones con lectura, estado y vigencia.
- [ ] **Detalle de estación:** consulta de una estación desde el monitoreo o el mapa.
- [ ] **Cinta de estaciones:** estado resumido con pausa y acceso al detalle.
- [ ] **Gráficos de alturas:** evolución histórica por estación.
- [ ] **Revisión visual final:** comprobar el conjunto en escritorio y laptops.

Las casillas indican avance de UI, no publicación en `dev`. La base técnica de Ríos no implica que su interfaz esté terminada.
