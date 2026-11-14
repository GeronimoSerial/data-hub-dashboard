import type { Page } from "@playwright/test";
import { cuentaPorClave } from "../cuentas-qa";
import { ESPERADOS, ESPERADOS_HIDRO, ESPERADOS_RADAR } from "../seed/esperados";
import { esperarMapaListo, expect, test } from "../fixtures/base";

test.use({ storageState: cuentaPorClave("admin").storageStatePath });

type VentanaE2E = {
  __mapaE2E: {
    featuresRenderizadas(capa: string): number;
    proyectar(lon: number, lat: number): { x: number; y: number };
    centro(): { lon: number; lat: number; zoom: number };
  };
};

// Formato es-AR con una cifra decimal, como lo muestra la app.
const metros = (valor: number) => `${valor.toFixed(2).replace(".", ",")} m`;
const milimetros = (valor: number) =>
  `${valor.toFixed(1).replace(".", ",")} mm`;

// Punto (lon, lat) dentro de cada celda de 0,1° de lluvia observada, lejos de las estaciones y los centros urbanos:
// los marcadores de escuela y de estación tapan la celda que tienen debajo.
const PUNTO_EN_CELDA: Record<string, readonly [number, number]> = {
  "-27.5_-58.8": [-58.76, -27.54], // SE de la celda; pna-corrientes está en (-27.46, -58.84)
  "-27.4_-58.9": [-58.93, -27.37], // NO de la celda; lejos del centro de Capital
  "-29.1_-59.2": [-59.16, -29.06], // NE de la celda; lejos del centro de Goya (-29.137, -59.247)
};

async function abrirRadar(page: Page): Promise<void> {
  await page.goto("/mapas/infraestructura#radar");
  await expect(page.getByTestId("panel-radar")).toBeVisible({
    timeout: 30_000,
  });
}

// La cámara del mapa anima su encuadre al cargar: un punto proyectado antes de que se asiente cae en otro lugar.
async function esperarCamaraQuieta(page: Page): Promise<void> {
  let previa = "";
  await expect
    .poll(async () => {
      const actual = JSON.stringify(
        await page.evaluate(() =>
          (window as unknown as VentanaE2E).__mapaE2E.centro(),
        ),
      );
      const quieta = actual === previa;
      previa = actual;
      return quieta;
    })
    .toBe(true);
}

async function zoomActual(page: Page): Promise<number> {
  return page.evaluate(
    () => (window as unknown as VentanaE2E).__mapaE2E.centro().zoom,
  );
}

// A zoom bajo, los marcadores de estaciones y escuelas se pisan. La rueda acerca la cámara anclada al cursor:
// el punto bajo el cursor no se mueve, así que se acerca sobre el mismo punto que después se clickea.
async function acercarA(
  page: Page,
  lon: number,
  lat: number,
  zoomMinimo: number,
): Promise<void> {
  const punto = await page.evaluate(
    ([x, y]) => (window as unknown as VentanaE2E).__mapaE2E.proyectar(x, y),
    [lon, lat] as const,
  );
  await page.mouse.move(punto.x, punto.y);
  for (
    let intento = 0;
    intento < 15 && (await zoomActual(page)) < zoomMinimo;
    intento++
  ) {
    await page.mouse.wheel(0, -300);
    await esperarCamaraQuieta(page);
  }
  expect(await zoomActual(page)).toBeGreaterThanOrEqual(zoomMinimo);
}

async function clicEnPunto(
  page: Page,
  lon: number,
  lat: number,
): Promise<void> {
  await esperarCamaraQuieta(page);
  const punto = await page.evaluate(
    ([x, y]) => (window as unknown as VentanaE2E).__mapaE2E.proyectar(x, y),
    [lon, lat] as const,
  );
  await page.mouse.click(punto.x, punto.y);
}

function estacionDelManifiesto(estacionId: string) {
  const estacion = ESPERADOS_HIDRO.estaciones.find(
    (e) => e.estacionId === estacionId,
  );
  if (!estacion) throw new Error(`Estación sin valor esperado: ${estacionId}`);
  return estacion;
}

test("radar: la sección de alertas del SMN muestra la alerta sembrada con su evento, severidad y zona", async ({
  page,
}) => {
  await abrirRadar(page);

  const alertas = page
    .getByTestId("radar-alertas-smn")
    .getByTestId("radar-alerta");
  await expect(alertas).toHaveCount(1);
  await expect(alertas).toContainText(
    `${ESPERADOS.radar.alerta.event} · ${ESPERADOS.radar.alerta.severidadEspanol}`,
  );
  await expect(alertas).toContainText(
    ESPERADOS.radar.alerta.departamentos.join(", "),
  );
});

// Horizonte por defecto (72 h). La corrida sembrada tiene 1 mm/h durante 24 h en cada celda, así que la suma de
// 72 h es 24 mm por departamento. El horizonte de 24 h no sirve: suma un único día calendario local y su valor
// depende de la hora a la que corre la prueba.
for (const departamento of Object.keys(ESPERADOS.escuelas.porDepartamento)) {
  test(`pronóstico a 72 h: ${departamento} muestra ${ESPERADOS.radar.corrida.lluviaAcumulada24hMm} mm de lluvia`, async ({
    page,
  }) => {
    await abrirRadar(page);

    await expect(
      page.getByRole("button", {
        name: `${departamento}, ${ESPERADOS.radar.corrida.lluviaAcumulada24hMm} mm`,
        exact: true,
      }),
    ).toBeVisible({ timeout: 30_000 });
  });
}

test("ríos: el mapa dibuja las 3 estaciones de Prefectura", async ({
  page,
}) => {
  await page.goto("/mapas/infraestructura#radar");
  await esperarMapaListo(page);

  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as unknown as VentanaE2E).__mapaE2E.featuresRenderizadas(
          "estacionesRio",
        ),
      ),
    )
    .toBe(ESPERADOS.hidrometria.estaciones.total);
});

test("ríos: la estación en alerta muestra su altura y el exceso sobre el umbral de alerta", async ({
  page,
}) => {
  const estacion = estacionDelManifiesto(ESPERADOS.hidrometria.enAlerta);
  const { lecturaM, alertaM } = estacion.ultimaLectura;
  await page.goto("/mapas/infraestructura#radar");
  await esperarMapaListo(page);

  await acercarA(page, estacion.lon, estacion.lat, 12);
  await clicEnPunto(page, estacion.lon, estacion.lat);

  const tarjeta = page.getByTestId("tarjeta-estacion-rio");
  await expect(tarjeta).toBeVisible({ timeout: 30_000 });
  await expect(tarjeta).toHaveAttribute("data-estado", estacion.estado);
  await expect(
    tarjeta.getByRole("heading", { name: estacion.nombre }),
  ).toBeVisible();
  await expect(tarjeta.locator(".tarjeta-estacion__estado")).toHaveText(
    "Alerta",
  );
  await expect(tarjeta).toContainText(metros(lecturaM));
  await expect(tarjeta).toContainText(
    `▲ ${metros(lecturaM - alertaM)} sobre alerta`,
  );
});

test("ríos: una estación bajo el umbral de alerta muestra Normal y su altura", async ({
  page,
}) => {
  const estacion = ESPERADOS_HIDRO.estaciones.find(
    (e) => e.estado === "normal",
  );
  if (!estacion)
    throw new Error("El manifiesto no tiene estaciones en estado normal");
  await page.goto("/mapas/infraestructura#radar");
  await esperarMapaListo(page);

  await acercarA(page, estacion.lon, estacion.lat, 12);
  await clicEnPunto(page, estacion.lon, estacion.lat);

  const tarjeta = page.getByTestId("tarjeta-estacion-rio");
  await expect(tarjeta).toBeVisible({ timeout: 30_000 });
  await expect(tarjeta).toHaveAttribute("data-estado", estacion.estado);
  await expect(
    tarjeta.getByRole("heading", { name: estacion.nombre }),
  ).toBeVisible();
  await expect(tarjeta.locator(".tarjeta-estacion__estado")).toHaveText(
    "Normal",
  );
  await expect(tarjeta).toContainText(metros(estacion.ultimaLectura.lecturaM));
});

for (const celda of ESPERADOS_RADAR.lluviaObservada.celdas) {
  const punto = PUNTO_EN_CELDA[celda.geometryRef];
  if (!punto)
    throw new Error(`Sin punto de clic para la celda ${celda.geometryRef}`);
  const [lon, lat] = punto;
  test(`lluvia observada: la celda ${celda.geometryRef} muestra ${milimetros(celda.acumuladoMm)} al hacer clic`, async ({
    page,
  }) => {
    // En el radar la lluvia observada no abre popup (sinPopup): su tarjeta sólo existe en "Situación actual".
    await page.goto("/mapas/infraestructura");
    await page.getByRole("tab", { name: /Situación actual/ }).click();
    await esperarMapaListo(page);

    await acercarA(page, lon, lat, 12);
    await clicEnPunto(page, lon, lat);

    await expect(page.getByTestId("capa-lluvia-observada")).toContainText(
      milimetros(celda.acumuladoMm),
      { timeout: 30_000 },
    );
  });
}
