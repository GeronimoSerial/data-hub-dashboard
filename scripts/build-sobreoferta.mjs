#!/usr/bin/env node
/**
 * Build public/data/sobreoferta.json — capa "Sobreoferta escolar" (Ruta A).
 *
 * Combina demanda actual (matrícula/edificio por zona) con demanda futura
 * (variación de nacidos vivos 2014→2023 por departamento, PowerBI Corrientes).
 *
 * Usage: node scripts/build-sobreoferta.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const outDir = join(root, "public", "data");
const corrDir = join(root, "docs", "powerbi_corrientes");

const SEMAFORO = {
  rojo: { fill: "#E57373", stroke: "#C62828", label: "Sobreoferta clara" },
  amarillo: {
    fill: "#FFF176",
    stroke: "#F9A825",
    label: "Sobreoferta futura probable",
  },
  verde: {
    fill: "#81C784",
    stroke: "#2E7D32",
    label: "Demanda estable/suficiente",
  },
};

function fail(msg) {
  console.error(`build-sobreoferta: ${msg}`);
  process.exit(1);
}

function normalizeDept(value) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

function parseCsv(text) {
  const lines = text.replace(/^\uFEFF/, "").trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const row = {};
    headers.forEach((h, i) => {
      row[h] = cells[i] ?? "";
    });
    return row;
  });
}

function splitCsvLine(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function num(value) {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function zoneKeyFromEstablishment(zone) {
  if (zone == null || zone === "") return null;
  const s = String(zone).trim();
  if (!s || /^sin zona$/i.test(s)) return null;
  if (/^zona\s+/i.test(s)) return s.replace(/^zona\s+/i, "Zona ");
  if (/^\d+$/.test(s)) return `Zona ${s}`;
  return s;
}

function classifySemaforo({ bajoDemanda, natalidadEnCaida }) {
  if (natalidadEnCaida && bajoDemanda) return "rojo";
  if (natalidadEnCaida) return "amarillo";
  return "verde";
}

function loadRequired(path) {
  if (!existsSync(path)) fail(`falta ${path}`);
  return readFileSync(path, "utf8");
}

// --- Load inputs ---
const establishments = JSON.parse(
  loadRequired(join(outDir, "establishments.geojson")),
);
const zones = JSON.parse(loadRequired(join(outDir, "zones.geojson")));
const nacidosRows = parseCsv(loadRequired(join(corrDir, "nacidos_vivos.csv")));
const escenariosRows = parseCsv(
  loadRequired(join(corrDir, "escenarios_4anios.csv")),
);
const icseRows = parseCsv(loadRequired(join(corrDir, "icse.csv")));

const mapDepts = [
  ...new Set(
    establishments.features
      .map((f) => normalizeDept(f.properties?.department))
      .filter(Boolean),
  ),
].sort();

if (mapDepts.length !== 25) {
  fail(`se esperaban 25 departamentos en el mapa, hay ${mapDepts.length}`);
}
if (zones.features.length !== 59) {
  fail(`se esperaban 59 zonas, hay ${zones.features.length}`);
}

// --- Department PowerBI data ---
/** @type {Record<string, any>} */
const departments = {};

for (const row of nacidosRows) {
  const name = row.departamento;
  if (!name || name === "DESCONOCIDO") continue;
  const key = normalizeDept(name);
  const nacidos2014 = num(row.nacidos2014);
  const nacidos2023 = num(row.nacidos2023);
  if (nacidos2014 == null || nacidos2023 == null || nacidos2014 === 0) {
    fail(`nacidos incompletos para ${name}`);
  }
  const variacionNatalidad = (nacidos2023 - nacidos2014) / nacidos2014;
  departments[key] = {
    key,
    name,
    codDpto: String(row.codDpto),
    nacidos2014,
    nacidos2023,
    variacionNatalidad,
    tasaAsistencia4: null,
    icseQuintil: null,
    establishments: 0,
    matricula2026: 0,
    alumnosPorEdificio: null,
    bajoDemanda: false,
    natalidadEnCaida: false,
    semaforo: "verde",
    fillColor: SEMAFORO.verde.fill,
    strokeColor: SEMAFORO.verde.stroke,
  };
}

for (const row of escenariosRows) {
  const key = normalizeDept(row.departamento);
  if (!departments[key]) continue;
  departments[key].tasaAsistencia4 = num(row.tasaAsistencia4);
}

for (const row of icseRows) {
  const key = normalizeDept(row.departamento);
  if (!departments[key]) continue;
  departments[key].icseQuintil = num(row.icseQuintil);
}

const missingFromPowerbi = mapDepts.filter((d) => !departments[d]);
if (missingFromPowerbi.length) {
  fail(`deptos del mapa sin cruce PowerBI: ${missingFromPowerbi.join(", ")}`);
}
const extraPowerbi = Object.keys(departments).filter((d) => !mapDepts.includes(d));
if (extraPowerbi.length) {
  fail(`deptos PowerBI sin mapa: ${extraPowerbi.join(", ")}`);
}
for (const key of mapDepts) {
  const d = departments[key];
  if (d.tasaAsistencia4 == null) fail(`sin tasa asistencia 4 años: ${key}`);
  if (d.icseQuintil == null) fail(`sin ICSE: ${key}`);
}

// --- Establishment counts / matrícula by zone & dept ---
/** @type {Record<string, Record<string, number>>} */
const zoneDeptCounts = {};
/** @type {Record<string, number>} */
const deptEstCounts = {};

for (const f of establishments.features) {
  const dept = normalizeDept(f.properties?.department);
  const zoneId = zoneKeyFromEstablishment(f.properties?.zone);
  const enroll = f.properties?.enrollment?.[2026];
  const mat = typeof enroll === "number" ? enroll : num(enroll) ?? 0;

  if (!dept) continue;
  deptEstCounts[dept] = (deptEstCounts[dept] ?? 0) + 1;
  if (departments[dept]) {
    departments[dept].establishments += 1;
    departments[dept].matricula2026 += mat;
  }

  if (!zoneId) continue;
  if (!zoneDeptCounts[zoneId]) zoneDeptCounts[zoneId] = {};
  zoneDeptCounts[zoneId][dept] = (zoneDeptCounts[zoneId][dept] ?? 0) + 1;
}

for (const d of Object.values(departments)) {
  d.alumnosPorEdificio =
    d.establishments > 0 ? d.matricula2026 / d.establishments : null;
}

// --- Zone metrics ---
/** @type {Record<string, any>} */
const zoneOut = {};
const zoneRatios = [];

for (const feature of zones.features) {
  const name = feature.properties?.name;
  if (!name) fail("zona sin nombre");
  const establishmentsCount = num(feature.properties?.establishments) ?? 0;
  const matricula =
    num(feature.properties?.observable?.[2026]) ??
    num(feature.properties?.observable?.["2026"]) ??
    0;
  const alumnosPorEdificio =
    establishmentsCount > 0 ? matricula / establishmentsCount : null;
  if (alumnosPorEdificio != null) zoneRatios.push(alumnosPorEdificio);

  const deptCounts = zoneDeptCounts[name] ?? {};
  const totalInZone = Object.values(deptCounts).reduce((a, b) => a + b, 0);
  if (totalInZone === 0) {
    fail(`zona ${name} sin establecimientos asignados`);
  }

  const deptShares = Object.entries(deptCounts).map(([deptKey, count]) => {
    const deptTotal = deptEstCounts[deptKey] ?? 0;
    const share = deptTotal > 0 ? count / deptTotal : 0;
    return {
      key: deptKey,
      name: departments[deptKey]?.name ?? deptKey,
      establishmentsInZone: count,
      establishmentsInDept: deptTotal,
      share,
      variacionNatalidad: departments[deptKey]?.variacionNatalidad ?? null,
    };
  });

  // Señal futura: variación ponderada por share (reparto por edificios)
  const shareSum = deptShares.reduce((a, s) => a + s.share, 0);
  let variacionNatalidad = null;
  if (shareSum > 0) {
    variacionNatalidad = deptShares.reduce(
      (a, s) => a + (s.variacionNatalidad ?? 0) * (s.share / shareSum),
      0,
    );
  }

  zoneOut[name] = {
    name,
    establishments: establishmentsCount,
    matricula2026: matricula,
    alumnosPorEdificio,
    variacionNatalidad,
    departments: deptShares,
    multiDepartment: deptShares.length > 1,
    bajoDemanda: false,
    natalidadEnCaida: false,
    semaforo: "verde",
    fillColor: SEMAFORO.verde.fill,
    strokeColor: SEMAFORO.verde.stroke,
  };
}

if (Object.keys(zoneOut).length !== 59) {
  fail(`zonas de salida: ${Object.keys(zoneOut).length}`);
}

const medianAlumnos = median(zoneRatios);
const deptVariaciones = mapDepts.map((k) => departments[k].variacionNatalidad);
const medianVariacion = median(deptVariaciones);
if (medianAlumnos == null || medianVariacion == null) {
  fail("no se pudo calcular medianas");
}

// --- Classify ---
for (const zone of Object.values(zoneOut)) {
  zone.bajoDemanda =
    zone.alumnosPorEdificio != null && zone.alumnosPorEdificio < medianAlumnos;
  zone.natalidadEnCaida =
    zone.variacionNatalidad != null && zone.variacionNatalidad < medianVariacion;
  zone.semaforo = classifySemaforo(zone);
  zone.fillColor = SEMAFORO[zone.semaforo].fill;
  zone.strokeColor = SEMAFORO[zone.semaforo].stroke;
}

const medianAlumnosDept = median(
  mapDepts
    .map((k) => departments[k].alumnosPorEdificio)
    .filter((v) => v != null),
);

for (const d of Object.values(departments)) {
  d.bajoDemanda =
    d.alumnosPorEdificio != null &&
    medianAlumnosDept != null &&
    d.alumnosPorEdificio < medianAlumnosDept;
  d.natalidadEnCaida = d.variacionNatalidad < medianVariacion;
  d.semaforo = classifySemaforo(d);
  d.fillColor = SEMAFORO[d.semaforo].fill;
  d.strokeColor = SEMAFORO[d.semaforo].stroke;
}

const zoneCounts = { rojo: 0, amarillo: 0, verde: 0 };
for (const z of Object.values(zoneOut)) zoneCounts[z.semaforo] += 1;
const deptCountsOut = { rojo: 0, amarillo: 0, verde: 0 };
for (const d of Object.values(departments)) deptCountsOut[d.semaforo] += 1;

if (zoneCounts.rojo === 0 || zoneCounts.amarillo === 0 || zoneCounts.verde === 0) {
  fail(
    `semáforos de zona incompletos: ${JSON.stringify(zoneCounts)} (se requieren los 3 estados)`,
  );
}

const multiDeptZones = Object.values(zoneOut).filter((z) => z.multiDepartment);
const warnings = [
  // Primeros 3: los que muestra LegendPanel (meta.warnings.slice(0, 3)) con overlay activo.
  "Nacidos vivos = lugar de registro, no residencia: Capital concentra partos de otros deptos. Usar la variación como señal relativa.",
  "Natalidad en caída = variación peor que la mediana departamental de Corrientes (no cualquier valor negativo).",
  `${multiDeptZones.length} zonas multi-departamento (Sobreoferta escolar): demanda futura repartida por share de establecimientos (Ruta A).`,
  // Resto: se conservan en el JSON para completitud, no aparecen en la leyenda.
  "Tasa de asistencia 4 años: serie de escenarios (06a), no la observada (05b).",
  "La caída 2014→2023 incluye efecto pandemia; no extrapolar mecánicamente.",
  "Los CSV nacionales de PowerBI tienen homónimos (Capital, San Martín, etc.); este build usa el recorte Corrientes por CODDPTO/provincia en docs/powerbi_corrientes/.",
];

const payload = {
  generatedAt: new Date().toISOString(),
  meta: {
    medianAlumnosPorEdificio: medianAlumnos,
    medianAlumnosPorEdificioDept: medianAlumnosDept,
    medianVariacionNatalidad: medianVariacion,
    zoneSemaforoCounts: zoneCounts,
    departmentSemaforoCounts: deptCountsOut,
    multiDepartmentZones: multiDeptZones.map((z) => z.name),
    colors: SEMAFORO,
    warnings,
  },
  zones: zoneOut,
  departments,
};

mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, "sobreoferta.json");
writeFileSync(outPath, JSON.stringify(payload, null, 2));

console.log(`Wrote ${outPath}`);
console.log(
  `Zonas: ${Object.keys(zoneOut).length} | Deptos: ${Object.keys(departments).length}`,
);
console.log(`Semáforo zonas: ${JSON.stringify(zoneCounts)}`);
console.log(`Semáforo deptos: ${JSON.stringify(deptCountsOut)}`);
console.log(
  `Mediana alumnos/edificio (zona): ${medianAlumnos.toFixed(2)} | Mediana variación natalidad: ${(medianVariacion * 100).toFixed(1)}%`,
);
console.log(`Zonas multi-depto: ${multiDeptZones.map((z) => z.name).join(", ")}`);
