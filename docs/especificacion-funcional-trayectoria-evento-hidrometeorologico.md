# Especificación funcional — Trayectoria de situaciones hidrometeorológicas

**Producto:** Hub de Datos — Reporte de establecimientos educativos  
**Marco:** Protocolo Provincial de Prevención, Preparación, Respuesta y Recuperación del Sistema Educativo ante posibles Eventos Hidrometeorológicos asociados al ENOS — El Niño-Oscilación del Sur — Período Escolar 2026/2027  
**Estado del documento:** Propuesta funcional acordada  
**Alcance:** Experiencia del director y preparación del seguimiento posterior por supervisores

---

## 1. Propósito

Mejorar la trayectoria del reporte para que el director pueda:

- Reconocer inmediatamente la situación hidrometeorológica vigente de su establecimiento.
- Consultar qué afectaciones, secciones y alumnos fueron informados anteriormente.
- Actualizar la situación sin crear involuntariamente un episodio duplicado.
- Incorporar nuevas afectaciones o modificar las existentes, conservando el historial de cambios.
- Informar cambios en la prestación del servicio educativo y en la situación del establecimiento.
- Mantener un recorrido breve, claro y apropiado para una persona no técnica, especialmente desde un teléfono móvil.

La especificación diferencia una situación hidrometeorológica de las afectaciones que produce. Por ejemplo, la inundación del establecimiento y la inaccesibilidad de alumnos pueden formar parte del mismo episodio y no deben tratarse necesariamente como problemáticas independientes.

## 2. Alcance funcional

Esta etapa comprende:

- Visualización del estado actual al regresar al formulario.
- Inicio de una situación hidrometeorológica.
- Actualización de una situación existente.
- Registro de varias afectaciones dentro de una misma situación.
- Severidad, secciones y alumnos propios para cada afectación.
- Cambios totales o parciales en el servicio educativo.
- Cambios en la situación o uso del establecimiento.
- Historial comprensible de los movimientos realizados.
- Prevención de nuevos episodios creados por error.
- Preparación funcional para una futura notificación automática a tutores.

Quedan fuera de esta etapa:

- Envío efectivo de notificaciones a tutores.
- Redacción libre de mensajes para las familias.
- Resolución o cierre de la situación por parte del director.
- Diseño del recorrido operativo de los supervisores.
- Cambios vinculados con nuevos ciclos lectivos o padrones posteriores.

## 3. Conceptos funcionales

### 3.1 Situación hidrometeorológica

Es el episodio general que atraviesa el establecimiento dentro del marco del protocolo. Una situación puede evolucionar, escalar, reducir su impacto y acumular diferentes afectaciones a lo largo del tiempo.

### 3.2 Afectación

Es una consecuencia concreta de la situación hidrometeorológica. Cada afectación posee:

- Categoría y motivo.
- Severidad propia.
- Secciones y/o alumnos afectados.
- Observación, cuando corresponda.

Una misma situación puede contener simultáneamente varias afectaciones. Por ejemplo:

- Inundación del establecimiento, severidad alta, con tres secciones alcanzadas.
- Inaccesibilidad de alumnos, severidad media, con doce alumnos de una sección.

### 3.3 Movimiento

Es una actuación registrada dentro de la trayectoria de la situación. Son movimientos:

- El reporte inicial.
- Una actualización del director.
- Un cambio en el servicio educativo.
- Un cambio en la situación del establecimiento.
- La futura resolución realizada por un supervisor.

La resolución no será una acción disponible para el director. Cuando se incorpore el recorrido de supervisores, se registrará como un movimiento más del historial.

### 3.4 Estado del servicio educativo

Describe la prestación de clases y se expresa mediante dos opciones de carga:

- Clases normales.
- Clases suspendidas.

La suspensión puede alcanzar a todo el establecimiento o solamente a determinados turnos o secciones.

Para facilitar la lectura, el sistema puede mostrar un estado general calculado:

- Clases normales.
- Clases parcialmente suspendidas.
- Clases suspendidas.

“Clases parcialmente suspendidas” es un resultado informativo. El director no necesita seleccionarlo como una opción adicional.

### 3.5 Situación del establecimiento

Describe la condición o uso del edificio, de manera independiente de la prestación de clases:

- Funcionamiento habitual.
- Establecimiento evacuado.
- Utilizado como centro de evacuados.

La separación permite representar, por ejemplo, un establecimiento utilizado como centro de evacuados y con las clases suspendidas, sin perder ninguna de las dos informaciones.

## 4. Roles

### Director

Puede:

- Iniciar una situación hidrometeorológica.
- Consultar la información previamente reportada para su establecimiento.
- Ver los nombres de los alumnos informados anteriormente.
- Actualizar afectaciones, severidades y alcances.
- Cambiar el estado del servicio educativo.
- Cambiar la situación del establecimiento.
- Consultar el historial.

No puede resolver ni cerrar definitivamente la situación.

### Supervisor

En una etapa futura podrá evaluar y registrar la resolución de la situación. La definición detallada de ese recorrido no forma parte de esta especificación.

### Tutor

En una etapa futura podrá recibir notificaciones predeterminadas cuando un cambio en el servicio educativo alcance al alumno a su cargo.

## 5. Principios de experiencia

### 5.1 Mostrar antes de pedir

Al ingresar, el director debe encontrar primero el estado actual de su establecimiento. No se debe abrir directamente un formulario nuevo que oculte lo ya informado.

### 5.2 Diferenciar actualización y nuevo episodio

Actualizar una situación y reportar otro episodio deben ser acciones diferentes y explícitas. Los alumnos y secciones anteriores solo se recuperan dentro de la actualización de una situación existente.

Un reporte nuevo debe comenzar sin secciones ni alumnos seleccionados.

### 5.3 Modificar solamente lo necesario

La información vigente debe presentarse resumida. El director despliega únicamente el apartado que necesita cambiar.

### 5.4 Usar lenguaje cotidiano

La interfaz debe utilizar expresiones como:

- “Situación en seguimiento”.
- “Actualizar el parte”.
- “¿Qué cambió?”.
- “Rige desde”.
- “Secciones y alumnos afectados”.

Se evitarán términos técnicos como “versión”, “entidad”, “registro histórico” o “persistencia”.

### 5.5 Conservar contexto sin generar arrastre accidental

Dentro de una actualización se muestra la situación actual completa. Dentro de un nuevo episodio no se heredan afectados de la situación anterior.

## 6. Pantalla inicial del director

Después de validar el acceso y reconocer el establecimiento, la pantalla debe mostrar:

1. Identificación del establecimiento.
2. Estado actual del servicio educativo.
3. Situación actual del establecimiento.
4. Situación hidrometeorológica en seguimiento, cuando exista.
5. Afectaciones vigentes, cada una con su severidad y alcance resumido.
6. Fecha y hora de la última actualización.
7. Acciones disponibles.

Ejemplo orientativo:

```text
ESTADO DEL SERVICIO EDUCATIVO

Clases parcialmente suspendidas
1 sección alcanzada · Desde el 18 de septiembre, 10:30
[Informar un cambio]

SITUACIÓN DEL ESTABLECIMIENTO

Funcionamiento habitual
[Informar un cambio]

SITUACIÓN HIDROMETEOROLÓGICA EN SEGUIMIENTO

• Inundación del establecimiento                    Alta
  3 secciones · 74 alumnos

• Inaccesibilidad de alumnos                        Media
  1 sección · 12 alumnos

Última actualización: 18 de septiembre, 10:35
[Actualizar el parte]  [Ver historial]
```

La pantalla no ofrecerá al director una acción para marcar la situación como resuelta.

## 7. Inicio de una situación

Cuando no exista una situación en seguimiento, la pantalla debe comunicarlo claramente y ofrecer la acción **Iniciar un reporte**.

El reporte inicial debe permitir:

- Agregar una o más afectaciones.
- Indicar la severidad de cada afectación.
- Asociar secciones o alumnos a cada afectación.
- Informar el estado del servicio educativo.
- Informar la situación del establecimiento.
- Indicar desde cuándo rigen los cambios.
- Agregar una observación opcional.

El formulario debe comenzar sin secciones ni alumnos seleccionados.

La fecha y hora de vigencia debe comenzar en **Ahora**. Si el director necesita indicar otro momento, podrá utilizar la acción **Cambiar** para completar fecha y hora.

## 8. Actualización de una situación

La acción principal ante una situación existente será **Actualizar el parte**.

Al ingresar a la actualización:

- Se conserva la fotografía actual de todas las afectaciones.
- Cada afectación aparece resumida y dispone de una acción **Editar**.
- Se puede agregar una afectación nueva.
- Se puede modificar o retirar una afectación existente.
- Se puede cambiar la severidad de una afectación sin modificar las demás.
- Se pueden agregar o retirar secciones y alumnos.
- Se puede cambiar el servicio educativo o la situación del establecimiento.
- Se puede guardar una actualización aunque solo haya cambiado uno de esos aspectos.

El formulario debe priorizar la pregunta **¿Qué cambió?** y evitar obligar al director a recorrer nuevamente todos los datos vigentes.

La acción final será **Guardar actualización**.

## 9. Gestión de afectaciones

Cada afectación debe mantener su propia información.

### Categoría y motivo

El director selecciona la categoría y el motivo correspondiente. Un motivo ya presente en la situación no debe agregarse nuevamente por accidente.

### Severidad

La severidad se define por afectación. Modificar la severidad de una no cambia automáticamente la de las demás.

### Alcance

Las secciones y los alumnos se asocian a la afectación correspondiente. Esto permite que dos consecuencias del mismo episodio tengan alcances diferentes.

El director puede:

- Seleccionar una sección completa.
- Seleccionar alumnos determinados dentro de una sección.
- Agregar afectados.
- Retirar afectados que ya no se encuentren alcanzados.

La interfaz debe mostrar permanentemente una síntesis de cantidad de alumnos y secciones alcanzados por cada afectación.

## 10. Servicio educativo

El director puede informar clases normales o suspendidas.

Cuando seleccione **Clases suspendidas**, deberá indicar el alcance:

- Todo el establecimiento.
- Uno o más turnos.
- Una o más secciones.

La suspensión de una sola sección no debe modificar como suspendidas a las demás.

Cuando se reanuden las clases, el director podrá informar **Clases normales** para el mismo alcance. Esto constituye un movimiento del servicio educativo y no la resolución de la situación hidrometeorológica.

El estado general mostrado se calcula a partir del alcance vigente:

- Todas las secciones con clases normales: **Clases normales**.
- Algunas secciones suspendidas: **Clases parcialmente suspendidas**.
- Todas las secciones suspendidas: **Clases suspendidas**.

## 11. Situación del establecimiento

El director puede cambiar entre:

- Funcionamiento habitual.
- Establecimiento evacuado.
- Utilizado como centro de evacuados.

Este dato se gestiona separadamente del servicio educativo.

Cuando una combinación merezca atención, el sistema puede sugerir una revisión sin modificar datos automáticamente. Ejemplo:

> El establecimiento será utilizado como centro de evacuados. ¿También se suspendieron las clases?

La sugerencia debe poder descartarse si la información ingresada es correcta.

## 12. Vigencia del cambio

Todo cambio en el servicio educativo o en la situación del establecimiento debe registrar desde cuándo rige.

Para mantener un recorrido breve:

- El valor inicial será **Ahora**.
- Fecha y hora permanecerán ocultas mientras no se pulse **Cambiar**.
- El director podrá indicar un momento anterior o posterior cuando corresponda.
- La hora de carga y la hora desde la cual rige el cambio podrán ser diferentes.

## 13. Confirmación de una actualización

Antes de guardar se debe mostrar un resumen breve de los cambios, sin repetir toda la información que permanece igual.

Ejemplo:

```text
Cambios que se registrarán

• Clases normales → Clases suspendidas en 2.º A.
• Rige desde el 18 de septiembre a las 10:30.
• Se agrega “Inaccesibilidad de alumnos”, severidad Media.
• Se incorporan 12 alumnos.

[Volver y corregir]  [Guardar actualización]
```

Cuando el único cambio no tenga consecuencias sensibles, el resumen puede mostrarse dentro de la misma pantalla, próximo al botón de guardado, para evitar un paso adicional.

## 14. Prevención de duplicados

Cuando exista una situación en seguimiento, la interfaz debe favorecer claramente su actualización.

Si el director intenta iniciar otro episodio y la categoría o el motivo coincide con una afectación ya informada, el sistema debe mostrar un recordatorio destacado:

> Ya existe una situación en seguimiento con una afectación similar. Lo informado parece una actualización del parte anterior.

Se ofrecerán dos acciones:

- **Actualizar la situación existente**, como acción principal.
- **Continuar como otro episodio**, como acción secundaria y sujeta a confirmación.

La coincidencia funciona como recomendación. La decisión final corresponde al director.

## 15. Historial

El historial debe presentar los movimientos en orden cronológico inverso y describir únicamente qué cambió.

Cada movimiento debe mostrar:

- Fecha y hora de carga.
- Fecha y hora desde la cual rige, cuando sea diferente.
- Rol que realizó el movimiento.
- Cambios en afectaciones y severidades.
- Alumnos, secciones o turnos incorporados o retirados.
- Cambios en el servicio educativo.
- Cambios en la situación del establecimiento.

Ejemplo:

```text
18 sep · 10:35 · Director
Clases normales → Clases suspendidas en 2.º A
Se agregó “Inaccesibilidad de alumnos” · Severidad Media
12 alumnos incorporados

17 sep · 16:20 · Director
Se inició el reporte por inundación
Severidad Alta · 3 secciones · 74 alumnos
```

El director podrá consultar los nombres de los alumnos previamente informados desde el detalle de cada afectación.

## 16. Notificaciones futuras a tutores

Esta etapa no enviará notificaciones, pero el recorrido debe quedar preparado para una funcionalidad futura.

El mensaje será predeterminado y se construirá con:

- Nombre del establecimiento.
- Nuevo estado del servicio educativo.
- Turnos o secciones alcanzados.
- Fecha y hora desde la cual rige.

Ejemplo:

> Se informa que las clases de 2.º A se encuentran suspendidas desde el 18/09 a las 10:30.

Los destinatarios serán los tutores de los alumnos comprendidos en el alcance informado.

Una futura notificación deberá depender de un cambio efectivo en el servicio educativo. Editar una observación o una afectación sin cambiar el servicio no debe generar una nueva comunicación.

## 17. Estados vacíos y mensajes principales

### Sin situación en seguimiento

> No hay una situación hidrometeorológica en seguimiento para este establecimiento.

Acción: **Iniciar un reporte**.

### Situación sin cambios guardables

> Todavía no realizó cambios en el parte actual.

La acción de guardar permanecerá deshabilitada.

### Guardado exitoso

> La actualización fue registrada. El estado actual y el historial ya reflejan los cambios informados.

### Error de conexión

> No pudimos guardar la actualización. La información ingresada se mantiene para que pueda volver a intentar.

## 18. Reglas funcionales consolidadas

1. Una situación puede contener varias afectaciones.
2. Cada afectación tiene severidad y alcance propios.
3. Los alumnos y secciones se asocian a una afectación concreta.
4. Una actualización modifica la fotografía actual y conserva el estado anterior en el historial.
5. Un reporte nuevo nunca hereda automáticamente alumnos o secciones anteriores.
6. El servicio educativo y la situación del establecimiento se informan por separado.
7. La suspensión de clases puede ser total o parcial.
8. La reanudación de clases no resuelve la situación hidrometeorológica.
9. El director no puede cerrar ni resolver la situación.
10. La resolución futura del supervisor se incorporará como un movimiento.
11. Los cambios rigen inicialmente desde **Ahora**, salvo que el director indique otro momento.
12. Los nombres de alumnos anteriores son visibles para el director dentro del acceso habilitado.
13. Los mensajes futuros para tutores serán predeterminados.
14. Una coincidencia de categoría o motivo genera una recomendación de actualización, no una decisión automática.

## 19. Criterios de aceptación

### Regreso al formulario

- Si existe una situación en seguimiento, el director ve su estado actual antes de cualquier formulario nuevo.
- Puede reconocer afectaciones, severidades, secciones, alumnos y última actualización.
- La acción principal es **Actualizar el parte**.

### Actualización segura

- Al actualizar, se recupera la información vigente.
- Al iniciar otro episodio, secciones y alumnos comienzan vacíos.
- Si el motivo o categoría coincide con una afectación existente, se recomienda actualizarla.

### Afectaciones independientes

- Una situación admite más de una afectación.
- Cada afectación puede tener una severidad diferente.
- Cada afectación puede alcanzar alumnos o secciones diferentes.
- Modificar una afectación no altera involuntariamente las demás.

### Servicio educativo

- Se puede suspender una sección particular sin suspender toda la escuela.
- Se puede suspender por turno o para todo el establecimiento.
- Se puede reanudar el mismo alcance.
- La vista general distingue clases normales, parcialmente suspendidas y suspendidas.

### Situación del establecimiento

- Se puede informar funcionamiento habitual, evacuación o uso como centro de evacuados.
- El cambio no modifica automáticamente el estado del servicio educativo.
- El sistema puede sugerir revisar combinaciones potencialmente inconsistentes.

### Vigencia

- Todo cambio comienza en **Ahora** de manera predeterminada.
- El director puede indicar otra fecha y hora sin atravesar ese control cuando no lo necesita.

### Historial

- Cada guardado agrega un movimiento y no elimina movimientos anteriores.
- El historial explica los cambios en lenguaje comprensible.
- La vista actual no suma versiones anteriores como si fueran nuevas afectaciones vigentes.

### Permisos funcionales

- El director puede actualizar, pero no resolver.
- La futura resolución queda reservada al supervisor.

### Preparación para notificaciones

- El alcance de una suspensión permite identificar a los tutores correspondientes.
- El texto futuro se genera de manera predeterminada.
- Un cambio ajeno al servicio educativo no genera una notificación de suspensión o reanudación.

