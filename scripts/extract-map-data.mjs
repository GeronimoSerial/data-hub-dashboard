#!/usr/bin/env node
/**
 * Extract Folium/Leaflet map data from the source HTML into GeoJSON + summary.
 * Usage: node scripts/extract-map-data.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import turfCircle from "@turf/circle";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const htmlPath = join(root, "Mapa_Evolucion_Matricula_2023_2026.html");
const outDir = join(root, "public", "data");

const TREND_BY_FILL = {
  "#F4B7B4": "down",
  "#B7E1B0": "up",
  "#FFF0A8": "flat",
  "#D9D9D9": "partial",
};

const TREND_BY_OVERLAY = {
  "Establecimientos con disminución": "down",
  "Establecimientos con aumento": "up",
  "Establecimientos sin cambio": "flat",
  "Historia parcial": "partial",
};

function decodeJsString(s) {
  return s
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'")
    .replace(/\\\\/g, "\\");
}

function stripTags(html) {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+\n/g, "\n")
    .trim();
}

function field(text, label) {
  const re = new RegExp(`${label}\\s*:\\s*([^\\n]+)`, "i");
  const m = text.match(re);
  return m ? m[1].trim() : null;
}

function fieldNumber(text, label) {
  const re = new RegExp(`${label}\\s*:\\s*([-+]?\\d+(?:[.,]\\d+)?)`, "i");
  const m = text.match(re);
  if (!m) return null;
  return Number(String(m[1]).replace(",", "."));
}

function num(value) {
  if (value == null) return null;
  const cleaned = String(value)
    .replace(/%/g, "")
    .replace(/\./g, "")
    .replace(/,/g, ".")
    .replace(/[^\d.-]/g, "");
  if (cleaned === "" || cleaned === "-" || cleaned === ".") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function money(value) {
  if (value == null) return null;
  // Argentine format: $ 22.692.466,54
  const cleaned = String(value)
    .replace(/\$/g, "")
    .trim()
    .replace(/\./g, "")
    .replace(/,/g, ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function pct(value) {
  if (value == null) return null;
  const cleaned = String(value).replace(/%/g, "").replace(",", ".").trim();
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function extractPopupHtml(block) {
  // Folium uses either template literals with $(`...`) or setContent("...")
  const tpl = block.match(/\$\(`([\s\S]*?)`\)\[0\]/);
  if (tpl) return tpl[1];
  const quoted = block.match(/\.setContent\(\s*"([\s\S]*?)"\s*\)/);
  if (quoted) return decodeJsString(quoted[1]);
  return null;
}

function parseEstablishment(popupHtml) {
  const text = stripTags(popupHtml);
  const enrollment = {
    2023: num(field(text, "2023")),
    2024: num(field(text, "2024")),
    2025: num(field(text, "2025")),
    2026: num(field(text, "2026")),
  };
  return {
    cue: field(text, "CUE-Anexo"),
    name: field(text, "Establecimiento"),
    locality: field(text, "Localidad"),
    department: field(text, "Departamento"),
    zone: field(text, "Zona"),
    enrollment,
    absChange: num(field(text, "Variación absoluta 2023-2026")),
    pctChange: pct(field(text, "Variación porcentual 2023-2026")),
    trendLabel: field(text, "Tendencia"),
    monthlySalaryCost: money(field(text, "Costo mensual de sueldos")),
  };
}

function parseZone(popupHtml) {
  const text = stripTags(popupHtml);
  const name = text.split("\n")[0]?.trim() || field(text, "Zona") || "Zona";
  return {
    name,
    diameterKm: num(field(text, "Diámetro")) ?? 20,
    establishments: num(field(text, "Establecimientos")),
    completeHistory: num(field(text, "Con historia completa")),
    observable: {
      2023: num(field(text, "Matrícula observable 2023")),
      2024: num(field(text, "Matrícula observable 2024")),
      2025: num(field(text, "Matrícula observable 2025")),
      2026: num(field(text, "Matrícula observable 2026")),
    },
    comparable: {
      2023: num(field(text, "Panel comparable 2023")),
      2026: num(field(text, "Panel comparable 2026")),
    },
    pctChange: pct(field(text, "Variación comparable 2023-2026")),
    trendLabel: field(text, "Tendencia"),
    upCount: fieldNumber(text, "Aumentaron"),
    downCount: fieldNumber(text, "Disminuyeron"),
    flatCount: fieldNumber(text, "Sin cambio"),
    monthlySalaryCost: money(field(text, "Costo mensual de sueldos")),
    monthlySavings: money(field(text, "Ahorro mensual posible")),
  };
}

function trendFromLabel(label, fallback) {
  if (!label) return fallback;
  const l = label.toLowerCase();
  if (l.includes("aument")) return "up";
  if (l.includes("dismin")) return "down";
  if (l.includes("sin cambio")) return "flat";
  if (l.includes("parcial")) return "partial";
  return fallback;
}

function buildOverlayGroupMap(html) {
  const map = {};
  const re = /"((?:[^"\\]|\\.)*)"\s*:\s*(feature_group_[a-f0-9]+)/g;
  let m;
  while ((m = re.exec(html))) {
    const label = decodeJsString(m[1]);
    map[m[2]] = label;
  }
  return map;
}

function extractCircleMarkers(html, groupMap) {
  const features = [];
  const re = /L\.circleMarker\(\s*\[([-\d.]+)\s*,\s*([-\d.]+)\]\s*,\s*(\{[\s\S]*?\})\s*\)\.addTo\((feature_group_[a-f0-9]+)\)/g;
  let m;
  while ((m = re.exec(html))) {
    const lat = Number(m[1]);
    const lng = Number(m[2]);
    const styleRaw = m[3];
    const groupId = m[4];
    const fillMatch = styleRaw.match(/"fillColor"\s*:\s*"([^"]+)"/);
    const fill = fillMatch?.[1];
    const overlayLabel = groupMap[groupId] || "";
    let trend =
      TREND_BY_OVERLAY[overlayLabel] ||
      TREND_BY_FILL[fill] ||
      "partial";

    const after = html.slice(m.index, m.index + 3500);
    const popupHtml = extractPopupHtml(after);
    const props = popupHtml
      ? parseEstablishment(popupHtml)
      : { cue: null, name: null };
    trend = trendFromLabel(props.trendLabel, trend);

    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [lng, lat] },
      properties: {
        ...props,
        trend,
        fillColor: fill || null,
      },
    });
  }
  return features;
}

function extractZones(html, groupMap) {
  const zoneGroupId = Object.entries(groupMap).find(([_, label]) =>
    label.startsWith("Zonas 20 km"),
  )?.[0];

  const features = [];
  const re = /L\.circle\(\s*\[([-\d.]+)\s*,\s*([-\d.]+)\]\s*,\s*(\{[\s\S]*?\})\s*\)/g;
  let m;
  while ((m = re.exec(html))) {
    const lat = Number(m[1]);
    const lng = Number(m[2]);
    const styleRaw = m[3];
    const after = html.slice(m.index, m.index + 4000);
    const addTo = after.match(/\.addTo\((feature_group_[a-f0-9]+)\)/);
    if (!addTo) continue;
    if (zoneGroupId && addTo[1] !== zoneGroupId) continue;

    const radiusMatch = styleRaw.match(/"radius"\s*:\s*([-\d.]+)/);
    const radiusM = radiusMatch ? Number(radiusMatch[1]) : 10000;
    const popupHtml = extractPopupHtml(after);
    const props = popupHtml ? parseZone(popupHtml) : { name: "Zona" };
    const trend = trendFromLabel(props.trendLabel, "down");
    const fillMatch = styleRaw.match(/"fillColor"\s*:\s*"([^"]+)"/);
    const strokeMatch = styleRaw.match(/"color"\s*:\s*"([^"]+)"/);

    const circle = turfCircle([lng, lat], radiusM / 1000, {
      steps: 64,
      units: "kilometers",
      properties: {
        ...props,
        trend,
        center: [lng, lat],
        radiusM,
        fillColor: fillMatch?.[1] || null,
        strokeColor: strokeMatch?.[1] || null,
      },
    });
    features.push(circle);
  }
  return features;
}

function extractLocalities(html, groupMap) {
  const localityGroupId = Object.entries(groupMap).find(
    ([_, label]) => label === "Localidades",
  )?.[0];
  if (!localityGroupId) return [];

  const features = [];
  const re = /L\.marker\(\s*\[([-\d.]+)\s*,\s*([-\d.]+)\][\s\S]*?\)\.addTo\((feature_group_[a-f0-9]+)\)/g;
  let m;
  while ((m = re.exec(html))) {
    if (m[3] !== localityGroupId) continue;
    const lat = Number(m[1]);
    const lng = Number(m[2]);
    const after = html.slice(m.index, m.index + 1500);
    const iconHtml = after.match(/"html"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    let name = null;
    if (iconHtml) {
      const decoded = decodeJsString(iconHtml[1]);
      name = stripTags(decoded);
    }
    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [lng, lat] },
      properties: { name },
    });
  }
  return features;
}

function extractSummary(html, establishments) {
  // Prefer legend panel totals
  const legend = html.match(
    /Panel comparable:\s*<b>(\d+)\s*establecimientos<\/b>[\s\S]*?Matrícula 2023:\s*<b>(\d+)<\/b>[\s\S]*?Matrícula 2026:\s*<b>(\d+)<\/b>[\s\S]*?Variación:\s*<b>([^<]+)<\/b>/,
  );
  if (legend) {
    return {
      comparableEstablishments: Number(legend[1]),
      enrollment2023: Number(legend[2]),
      enrollment2026: Number(legend[3]),
      pctChange: pct(legend[4]),
      title: "Provincia de Corrientes - Evolución de matrícula 2023-2026",
      description:
        "Mapa interactivo de establecimientos y zonas de 20 km. Pase el mouse o haga clic para consultar la serie histórica y la variación.",
    };
  }

  // Fallback: recompute from complete-history establishments
  const comparable = establishments.filter((f) => f.properties.trend !== "partial");
  const e2023 = comparable.reduce(
    (s, f) => s + (f.properties.enrollment?.[2023] ?? 0),
    0,
  );
  const e2026 = comparable.reduce(
    (s, f) => s + (f.properties.enrollment?.[2026] ?? 0),
    0,
  );
  const pctChange = e2023 ? ((e2026 - e2023) / e2023) * 100 : null;
  return {
    comparableEstablishments: comparable.length,
    enrollment2023: e2023,
    enrollment2026: e2026,
    pctChange: pctChange == null ? null : Math.round(pctChange * 10) / 10,
    title: "Provincia de Corrientes - Evolución de matrícula 2023-2026",
    description:
      "Mapa interactivo de establecimientos y zonas de 20 km. Pase el mouse o haga clic para consultar la serie histórica y la variación.",
  };
}

function fc(features) {
  return { type: "FeatureCollection", features };
}

function main() {
  const html = readFileSync(htmlPath, "utf8");
  const groupMap = buildOverlayGroupMap(html);

  const establishments = extractCircleMarkers(html, groupMap);
  const zones = extractZones(html, groupMap);
  const localities = extractLocalities(html, groupMap);
  const summary = extractSummary(html, establishments);

  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    join(outDir, "establishments.geojson"),
    JSON.stringify(fc(establishments)),
  );
  writeFileSync(join(outDir, "zones.geojson"), JSON.stringify(fc(zones)));
  writeFileSync(
    join(outDir, "localities.geojson"),
    JSON.stringify(fc(localities)),
  );
  writeFileSync(join(outDir, "summary.json"), JSON.stringify(summary, null, 2));

  console.log("Extracted:");
  console.log(`  establishments: ${establishments.length}`);
  console.log(`  zones: ${zones.length}`);
  console.log(`  localities: ${localities.length}`);
  console.log(`  summary:`, summary);

  const expected = { establishments: 288, zones: 59 };
  if (establishments.length !== expected.establishments) {
    console.warn(
      `WARN: expected ${expected.establishments} establishments, got ${establishments.length}`,
    );
  }
  if (zones.length !== expected.zones) {
    console.warn(`WARN: expected ${expected.zones} zones, got ${zones.length}`);
  }
}

main();
