# Defensas costeras: comportamiento provisorio y cómo reemplazarlo

Reglas v0.4 (`reglas-v0.4-3`, T10d). Código: `lib/infraestructura/riesgo/motor/altura-critica.ts`
(`DEFENSAS_COSTERAS_V04`, `TRATAMIENTO_DEFENSA_V04`, `evaluarAlcanceAlturaCritica`).

## Qué hace hoy el motor

Tres ciudades tienen defensa costera urbana. El motor todavía no conoce su cota de
coronamiento:

| id | Localidades (aprox.) | Cota de coronamiento | Evidencia |
|---|---|---|---|
| `goya-anillo` | GOYA | desconocida | anillo urbano visible en Sentinel-2; 53 de 72 escuelas tendrían h_crit por debajo del récord de 7,2 m, lo que encaja con que dependan del anillo |
| `corrientes-costanera` | CORRIENTES | desconocida | defensa urbana excluida del muestreo de calibración |
| `esquina-defensa` | ESQUINA | desconocida | defensa urbana excluida del muestreo de calibración |

Con `cotaCoronamientoM: null`, el piso observado del río baja **un nivel**
(`TRATAMIENTO_DEFENSA_V04 = 'piso_reducido'`, confirmado por el usuario el 2026-10-18):

- completo → reducido (evacuación: piso de riesgo 25; alerta: sin piso);
- reducido → sin piso.

La explicación de cada escuela dice: "protegida por defensa costera; cota de coronamiento
desconocida: piso reducido un nivel (provisorio)". El diagnóstico persistido trae `defensa`
(id) y `defensaCoronamientoM` (null). Los pisos probabilísticos (P de superación del
terreno) no cambian.

Por qué: tratar a estas escuelas como si no hubiera defensa da sobrealertas; apagarles el
piso las oculta si la defensa desborda o falla. Bajar un nivel mantiene una señal hasta
que haya datos.

Alternativas (constante única): `'sin_piso'` las apaga y `'sin_efecto'` ignora la defensa.

Límite conocido: la defensa se asigna a toda la localidad, no al polígono protegido.
Las escuelas fuera del anillo también bajan un nivel.

## Datos que faltan

Por cada tramo de defensa:

1. **Cota de coronamiento** (m), idealmente un perfil por tramo, o al menos el punto más bajo.
2. **Datum** de esa cota (IGN histórico o SRVN16), para compararla con el offset de la escala.
3. **Fuente**: proyecto de obra municipal o provincial (Dirección de Hidráulica, APA
   Corrientes), INA, DPV o un relevamiento propio con GNSS.
4. **Fecha de relevamiento** y **estado** (operativa, en obra).
5. Opcional, para quitar la aproximación por localidad: el polígono protegido.

## Cómo reemplazar el comportamiento provisorio

1. Cargar los campos en el registro de `DEFENSAS_COSTERAS_V04` (`cotaCoronamientoM`,
   `datum`, `fuente`, `fechaRelevamiento`, `estado`) y subir `DEFENSAS_COSTERAS_VERSION`.
   Si hay varios tramos con cotas distintas, crear un registro por tramo.
2. Con la cota cargada, el motor calcula h_desborde = coronamiento − a, donde a es el
   offset de la escala (calibrado, o el equivalente de cero + km / DEM). La compuerta usa
   max(h_desborde, h_crit) como altura:
   - P(máx de la escala ≥ altura) ≥ 0,05, o tendencia/onda que la alcanza → piso completo (desborde);
   - lo mismo contra altura − banda (2 m) → piso reducido;
   - si no → sin piso.
   El tratamiento provisorio se usa sólo mientras la cota siga en null. Los dos caminos
   están cubiertos por tests (`altura-critica.test.ts`, "defensas costeras").
3. Si el datum es SRVN16, pasarlo a IGN histórico antes de cargarlo (los offsets están en
   IGN aprox. sobre GLO-30), o documentar la corrección aplicada.
4. Volver a correr el harness de evaluación y registrar el cambio en `odd/tasks/motor-v0-4.md`.
