# Cómo cambiar una fuente de datos (runbook)

Objetivo: reemplazar o reconfigurar una fuente externa (un proveedor, un modelo o
un endpoint) **sin tocar los jobs de ingesta, el motor de cálculo ni la UI**,
apoyándose en el aislamiento por puerto/adaptador de
`lib/infraestructura/riesgo/`.

Este runbook es operativo y de un solo cambio por vez. No ejecuta red: todos los
pasos se validan con fakes inyectados (`fetchImpl`, `obtenerProbabilidades`,
`obtenerTendencia`) y nunca contra la API real.

---

## Qué NO hay que tocar (y por qué)

| Zona | Rutas | Por qué está aislada |
|---|---|---|
| Jobs de ingesta con puerto | `lib/infraestructura/riesgo/jobs/sync-ensemble.ts`, `sync-seasonal.ts`, `sync-imerg.ts` | Ya cableados (ABS1, segunda parte): consumen **sólo** la forma normalizada de `PuertoPronosticoEnsemble`/`PuertoTendenciaEstacional`/`PuertoObservacionSatelital` (`lib/infraestructura/riesgo/adaptadores-ingesta/`). No importan ningún `provider` ni arman ninguna URL; no conocen host, modelo ni token. Un cambio de proveedor real se resuelve en el adaptador o en `CONFIG_FUENTES`, nunca en el job. |
| Jobs de ingesta SIN puerto (fuera de alcance) | `calcular-climatologia.ts`, `calcular-climatologia-caudal.ts`, `sync-pronostico-caudal.ts` | Siguen importando su provider directo (`providers/climatologia*.ts`, `providers/ecmwf.ts`, `providers/flood.ts`). No existe todavía un puerto normalizado de climatología ni de pronóstico determinístico en `adaptadores-ingesta/` (sólo hay 3: ensemble, seasonal, imerg). Cambiar esas fuentes hoy sí implica tocar el job — está documentado como pendiente, no como excepción silenciosa. |
| Motor de cálculo | `lib/infraestructura/riesgo/motor/calculo.ts` | El núcleo **nunca llama a los providers ni a la red**: lee de la base (Capa 1 / `hazard_*`) a través de `PuertosMotor`. Cambiar la fuente de ingesta no cambia el cálculo. |
| UI | Componentes bajo `app/` y `components/` | Consumen endpoints/datos persistidos, no providers. El fetch externo vive aguas arriba de la DB. |
| Cliente HTTP compartido | `providers/cliente-http.ts`, `providers/cupo-om.ts` | Es el gateway común de Open-Meteo (timeout, backoff, 429, cuarentena, cupo). Cambiar un proveedor **no** debe tocar el gateway; si necesitás otro transporte, va en el adaptador nuevo. |

Regla mental: si para cambiar de fuente tenés que editar un job, el motor o la UI,
el cambio se está haciendo en la capa equivocada. La frontera correcta es
**config + adaptador**.

---

## Qué SÍ se toca

### 1. `lib/infraestructura/riesgo/providers/config-fuentes.ts`

Es el módulo único de declaración por fuente (`CONFIG_FUENTES`). Cada clave lleva
un comentario `// origen: archivo:línea`. Parámetros típicos por fuente:

- `host` / `hostAlterno`: subdominio del proveedor (tipado por `HostOpenMeteo`:
  `'api' | 'ensemble-api' | 'archive-api' | 'flood-api' | 'seasonal-api'`).
- `ruta`: path del endpoint.
- `modelo`: id del modelo (p. ej. `ensemble.modelo = 'ecmwf_ifs025'`,
  `seasonal.modelo = 'ecmwf_seasonal_seamless'`).
- `envApiKey` / `envToken` / `envModelo`: **nombre** de la variable de entorno (acá
  sólo se documenta el nombre; la lectura de `process.env` sigue en cada módulo
  de origen).
- `prefijoHostPago`: prefijo del host cuando hay plan pago (`customer-`).
- `timeoutMs`, `reintentos`: valores documentados del gateway HTTP.
- Peso de cupo (Open-Meteo): la config aporta las **entradas** del peso
  (`variables`, `tamanoLote`, `diasPronostico`); el peso se calcula con
  `pesoLlamada({ ubicaciones, variables, dias })` en `providers/cupo-om.ts`.
- Campos propios de la fuente: `tamanoLote`, `diasPronostico`, `variables`,
  `pageSizeVentana`, `ventanaBackfillHoras`, `periodoDesde/Hasta`, etc.

> **Aviso de honestidad (leer antes de editar).** `config-fuentes.ts` es un módulo
> de **consolidación de constantes**: no hace red, no contiene lógica y no lee
> `process.env`. Editar un valor acá sólo cambia el runtime si el módulo de origen
> **importa** ese campo. Estado actual verificado por `rg "CONFIG_FUENTES\."`:
>
> - **Cableados a config**: `openrouter` (url, modelo, timeout, costos),
>   `ensemble` (ruta, modelo, tamanoLote, diasPronostico), `seasonal`,
>   `climatologia`, `climatologiaCaudal`, `imergCmr`, `imergOpendap`.
> - **Aún con constantes propias (config no consumida)**: `ecmwf`, `flood` y los
>   valores `timeoutMs`/`reintentos` de todas las fuentes (viven en
>   `cliente-http.ts`).
>
> Si tu cambio es sobre una fuente no cableada, cambiá también la constante real
> del provider (o cableá el provider a `CONFIG_FUENTES` en el mismo cambio), y
> dejá el comentario `// origen:` apuntando al lugar exacto.

### 2. El archivo del adaptador/provider de esa fuente

Según la capa:

- **Provider de Open-Meteo / NASA**: `lib/infraestructura/riesgo/providers/`
  (`ensemble.ts`, `seasonal.ts`, `imerg.ts`, `ecmwf.ts`, `flood.ts`,
  `climatologia*.ts`).
- **Adaptador de ingesta al puerto**: `lib/infraestructura/riesgo/adaptadores-ingesta/`
  (`ensemble.ts`, `seasonal.ts`, `imerg.ts`, `puertos.ts`).
- **Proveedor de IA**: `lib/infraestructura/briefing-ia/proveedor-openrouter.ts`.

El adaptador de ingesta traduce **forma**, no valor: renombra campos y normaliza
unidades/instantes, y **jamás imputa `0`** (la ausencia se expresa como
`null`/omisión/`sinDato`).

---

## Ejemplo 1 (hipotético): cambiar el modelo de OpenRouter

Escenario: pasar de `deepseek/deepseek-v4.1-flash` a un modelo hipotético
`proveedor/modelo-nuevo`.

**No se toca**: `lib/infraestructura/briefing-ia/generar-briefing-asistido.ts` ni
`lib/infraestructura/briefing-ia/proveedor-openrouter.ts`.

**Dos formas válidas, en este orden de preferencia:**

1. **Env var (sin editar archivos, gana siempre si está seteada).**
   ```bash
   export OPENROUTER_MODEL="proveedor/modelo-nuevo"
   ```
   Precedencia cableada en `generar-briefing-asistido.ts:100`:
   ```ts
   const modelo = opciones.modelo
     ?? process.env.OPENROUTER_MODEL      // <- gana sobre el default de config
     ?? CONFIG_FUENTES.openrouter.modeloPorDefecto
   ```
   Es decir: `opciones.modelo` (inyectado por test) > `OPENROUTER_MODEL` >
   `CONFIG_FUENTES.openrouter.modeloPorDefecto`. Con la env var seteada, el
   default de config queda **ignorado**.

2. **Cambiar el default en config** (aplica cuando la env var NO está seteada):
   editar en `providers/config-fuentes.ts`
   ```ts
   openrouter: {
     modeloPorDefecto: 'proveedor/modelo-nuevo', // antes: 'deepseek/deepseek-v4.1-flash'
     ...
   }
   ```
   Los costos (`costoPorMillonEntradaUsd`/`costoPorMillonSalidaUsd`) también están
   en config: si el modelo nuevo tiene otra tarifa, actualizalos ahí. El
   presupuesto por entorno (`E8_PRESUPUESTO_USD_MES`, `E8_COSTO_MAXIMO_USD_LLAMADA`)
   se controla fuera de `config-fuentes.ts`, en `generar-briefing-asistido.ts`.

**Ojo con el doble fallback**: `proveedor-openrouter.ts:149` también resuelve
`opciones.modelo ?? process.env.OPENROUTER_MODEL ?? MODELO_POR_DEFECTO`. Por la vía
normal, el orquestador **siempre pasa un modelo explícito**, así que esa rama no se
ejercita; la precedencia efectiva es la del orquestador. No dupliques la fuente de
verdad: el modelo se cambia por env var o por `CONFIG_FUENTES.openrouter`.

---

## Ejemplo 2 (hipotético): reemplazar Open-Meteo Ensemble por otro proveedor ensemble

Escenario: dejar de usar `ensemble-api.open-meteo.com` y usar un proveedor
ensemble hipotético, manteniendo intactos `sync-ensemble.ts`, el motor y la UI.

**Paso 1 — Crear el provider nuevo** bajo `providers/` (p. ej.
`lib/infraestructura/riesgo/providers/ensemble-alterno.ts`). Debe exponer **la
misma forma de función** que consume el adaptador, es decir el contrato de
`obtenerProbabilidadesEnsemble`:
```ts
export async function obtenerProbabilidadesEnsembleAlterno(params: {
  geometryRefsConCoordenada: Array<{ geometryRef: string; lat: number; lon: number }>
  corridaEn: string
  acumuladoHoras: 24
  umbralP95PorCelda: Map<string, number>
  umbralP99PorCelda: Map<string, number>
  fetchImpl?: typeof fetch
  apiKey?: string
  controladorCupoFactory?: (peso: number) => ControladorCupoOM
}): Promise<{
  puntos: HazardEnsembleProbPunto[]      // misma forma de salida
  erroresPorCelda: Record<string, string>
  llamadasRealizadas?: number
}>
```
Alternativa equivalente: implementar **directamente `PuertoPronosticoEnsemble`**
(la interfaz de `adaptadores-ingesta/puertos.ts`) y saltear el adaptador de forma.
Elegí una sola vía; no mezcles.

**Paso 2 — Agregar la config de la fuente** a `CONFIG_FUENTES` en
`providers/config-fuentes.ts`:
```ts
ensembleAlterno: {
  host: 'mi-proveedor.example',
  ruta: '/v1/ensemble',
  envApiKey: 'MI_PROVEEDOR_API_KEY',
  modelo: 'modelo-ensemble-hipotetico',
  timeoutMs: 10_000,
  reintentos: 3,
  tamanoLote: 20,
  diasPronostico: 3,
},
```
Cada valor nuevo con su comentario `// origen:` si copia un valor existente.

**Paso 3 — Inyectarlo en el adaptador por sus `dependencias`.** El adaptador ya
tiene el seam listo:
```ts
crearAdaptadorEnsemble({
  obtenerProbabilidades: obtenerProbabilidadesEnsembleAlterno,
  // opcional: fetchImpl, apiKey, controladorCupoFactory, coordenadaDeGeometryRef
})
```
No se edita `adaptadores-ingesta/ensemble.ts`: sólo se pasa otra función por
`dependencias.obtenerProbabilidades`. La normalización de forma (`variable`,
`validoDesde/Hasta`, `sinDato`) sigue siendo la del adaptador.

**Paso 4 — Correr la suite de contrato ANTES de cablear el job.**
`lib/infraestructura/riesgo/adaptadores-ingesta/contrato-puerto.test.ts` es
obligatoria para todo adaptador nuevo (o parte de su puerto). Verificá que el
provider alterno cumpla: forma normalizada en el caso `normal`, ausencia como
`sinDato`/`sinDato` con puntos vacíos en `vacio`, degradación parcial con mezcla
dato/sin-dato, y **rechazo limpio** (propaga el `throw`) en `error`.

**Paso 5 — No hace falta tocar el job.** Desde ABS1 (segunda parte),
`sync-ensemble.ts` ya consume `PuertoPronosticoEnsemble` por inyección
(`crearAdaptadorEnsemble` es sólo el valor por defecto). Reemplazar el
provider real por `ensembleAlterno` es cambiar **qué función recibe**
`crearAdaptadorEnsemble({ obtenerProbabilidades: ... })` dentro de
`sync-ensemble.ts` (una sola línea, la construcción del `puerto` por
defecto) — el resto del job (loop de tandas, persistencia, salud) no cambia.
Mismo patrón para `sync-seasonal.ts` (`crearAdaptadorSeasonal`) y
`sync-imerg.ts` (`crearAdaptadorImerg`).

---

## Checklist de verificación

Ejecutar **sin llamar APIs reales** (todo se inyecta por fakes). No hace falta `cd`;
comandos desde la raíz del repo:

```bash
# 1) Suite de contrato del/los puertos afectados
pnpm exec vitest run lib/infraestructura/riesgo/adaptadores-ingesta/contrato-puerto.test.ts

# 2) Tests del provider afectado
pnpm exec vitest run lib/infraestructura/riesgo/providers/<provider>.test.ts

# 3) Tipos (sin emitir)
pnpm exec tsc --noEmit
```

Chequeos manuales:

- [ ] Ningún job, `motor/calculo.ts` ni componente de UI fue editado.
- [ ] Los campos de config tocados están **realmente importados** por el provider
      (si no, se cableó a medias).
- [ ] No se imputa `0`: ausencia = `null` / omisión / entrada en `sinDato`.
- [ ] Instantes en UTC ISO con `Z`; unidades con sufijo explícito (`Mm`, `m3/s`).
- [ ] Si el proveedor dejó de ser Open-Meteo, revisá que no dependa de
      `cliente-http.ts`/`cupo-om.ts` por accidente.
- [ ] Env var de auth documentada en `config-fuentes.ts` (y, si corresponde,
      agregada a `.env.example`).
- [ ] Cero red en la verificación: no se ejecutó ninguna llamada real.

---

## Límites duros de Open-Meteo

Nunca superar estos máximos, **ni siquiera en pruebas**:

| Ventana | Límite |
|---|---|
| Por minuto | **600** llamadas |
| Por hora | **5.000** llamadas |
| Por día | **10.000** llamadas |
| Por mes | **300.000** llamadas |

Los tests deben inyectar `fetchImpl` y **jamás** golpear `api.open-meteo.com`,
`ensemble-api.open-meteo.com`, etc. Toda validación de cupo usa los fakes de la
suite de contrato.

Otros proveedores (NASA CMR/GES DISC, OpenRouter) tienen sus propios límites y
créditos: tratalos igual — sin llamadas reales desde tests ni desde este runbook.
