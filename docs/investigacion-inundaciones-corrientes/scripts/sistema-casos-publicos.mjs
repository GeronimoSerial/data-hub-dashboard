// Offline: qué radar (pronóstico Open-Meteo) y qué alertas SMN tenía el sistema para casos PÚBLICOS.
// Sin red ni base de datos. Uso: node sistema-casos-publicos.mjs <directorio-snapshot>
// El directorio debe contener radar_meteo_run.jsonl y smn_alerta.jsonl exportados en solo lectura.
// Coordenadas de casos: referencia aproximada de la localidad para elegir celda, NO punto del incidente.
// Las horas de payload.times se interpretan como UTC (misma convención que el análisis previo); verificar.
import fs from 'node:fs';
const S = process.argv[2]; const H = 3600e3;
const rj = f => fs.readFileSync(`${S}/${f}`, 'utf8').trim().split('\n').map(JSON.parse);
const runs = rj('radar_meteo_run.jsonl').map(r => ({ runMs: Date.parse(r.run_at), fetchedMs: Date.parse(r.fetched_at), cells: r.payload.cells, times: r.payload.times.map(t => Date.parse(t + ':00Z')), v: r.payload.values })).sort((a, b) => a.runMs - b.runMs);
const alerts = rj('smn_alerta.jsonl').map(a => ({ ...a, onsetMs: Date.parse(a.onset), expMs: Date.parse(a.expires), fetchedMs: Date.parse(a.fetched_at), sentMs: Date.parse(a.sent) }));
const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const hav = (a, b, c, d) => { const R = 6371, r = Math.PI / 180; const x = Math.sin((c - a) * r / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin((d - b) * r / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };
const utc = ms => new Date(ms).toISOString().slice(0, 16) + 'Z';
const lats = runs[0].cells.map(c => c.lat), lons = runs[0].cells.map(c => c.lon);
console.log('grilla lat', Math.min(...lats), Math.max(...lats), 'lon', Math.min(...lons), Math.max(...lons), 'celdas', lats.length);
// ref = referencia aproximada de la localidad (no punto del incidente).
// desde = hora de referencia del caso: inicio del hecho que respalda su evidencia (ver 04-matriz-caso-sistema.md).
// Solo cuenta como "lo que el sistema tenía" lo capturado (fetched_at) antes de `desde`.
// hasta = fin de la ventana de comparación (fin de la medición informada o corte del análisis).
const casos = [
  { caso: 'Curuzu Cuatia temporal noche 7-8/10', dep: 'Curuzú Cuatiá', lat: -29.79, lon: -58.05, desde: '2026-10-07T23:00Z', hasta: '2026-10-08T11:30Z', base: 'noche del 7/10 (EV-20261008-001, EVD-045; sin hora: se supone 20:00 ART) hasta 08:30 ART del 8/10 (fin de la medición)' },
  { caso: 'Curuzu Cuatia sensibilidad 18:00 ART', dep: 'Curuzú Cuatiá', lat: -29.79, lon: -58.05, desde: '2026-10-07T21:00Z', hasta: '2026-10-08T11:30Z', base: 'variante conservadora: inicio supuesto 18:00 ART del 7/10' },
  { caso: 'Capital lluvia 8/10 hasta 09:00', dep: 'Capital', lat: -27.47, lon: -58.83, desde: '2026-10-08T03:00Z', hasta: '2026-10-08T12:00Z', base: '00:00 a 09:00 ART del 8/10 (EV-20261008-002, EVD-007: 17 mm hasta las 9)' },
  { caso: 'Goya lluvia 12/10 hasta 20:00', dep: 'Goya', lat: -29.04, lon: -59.26, desde: '2026-10-12T03:00Z', hasta: '2026-10-12T23:00Z', base: '00:00 a 20:00 ART del 12/10 (EV-20261012-002, EVD-018)' },
  { caso: 'Monte Caseros cruce cerrado desde 7/10 08:00', dep: 'Monte Caseros', lat: -30.25, lon: -57.64, desde: '2026-10-07T11:00Z', hasta: '2026-10-09T03:00Z', base: 'cierre del cruce Monte Caseros-Bella Unión 7/10 08:00 ART (EV-20261008-004, EVD-053 no localizada; cierre confirmado el 8/10 por EVD-033) hasta fin del 8/10 (corte de luz EV-20261008-005)' },
  { caso: 'Paso de los Libres 8,49 m y evacuacion 7/10', dep: 'Paso de los Libres', lat: -29.71, lon: -57.09, desde: '2026-10-07T03:00Z', hasta: '2026-10-13T15:00Z', base: 'inicio del 7/10 ART, día de la primera publicación de 8,49 m y evacuación (EV-20261007-001, EVD-002; sin hora) hasta el corte' },
  { caso: 'Ituzaingo evacuacion Isla Apipe 11/10', dep: 'Ituzaingó', lat: -27.59, lon: -56.69, desde: '2026-10-11T03:00Z', hasta: '2026-10-13T15:00Z', base: 'inicio del 11/10 ART, evacuación de Isla Apipé y mayor liberación de Yacyretá (EV-20261011-001/002) hasta el corte' },
];
const val = (run, f, i, h) => { const x = run.v[f]?.[i]?.[h]; return typeof x === 'number' && Number.isFinite(x) ? x : null; };
for (const c of casos) {
  const d = Date.parse(c.desde), h = Date.parse(c.hasta);
  const known = runs.filter(r => r.fetchedMs <= d); const run = known.at(-1);
  let ci = 0, best = 1e9; run.cells.forEach((x, i) => { const k = hav(c.lat, c.lon, x.lat, x.lon); if (k < best) { best = k; ci = i; } });
  const idx = run.times.map((t, i) => [t, i]).filter(([t]) => t >= d && t < h).map(([, i]) => i);
  const sum = idx.reduce((s, i) => s + (val(run, 'precipitation', ci, i) ?? 0), 0);
  const gust = Math.max(...idx.map(i => val(run, 'wind_gusts_10m', ci, i) ?? 0));
  const tor = idx.some(i => [95, 96, 99].includes(val(run, 'weather_code', ci, i)));
  // run posterior más reciente dentro de la ventana (para comparar cambio de pronóstico)
  const last = runs.filter(r => r.fetchedMs <= h).at(-1);
  const idx2 = last.times.map((t, i) => [t, i]).filter(([t]) => t >= d && t < h).map(([, i]) => i);
  const sum2 = idx2.reduce((s, i) => s + (val(last, 'precipitation', ci, i) ?? 0), 0);
  const al = alerts.filter(a => (a.departamentos || []).some(x => norm(x.nombre ?? x) === norm(c.dep)) && a.onsetMs < h && a.expMs > d);
  const alAntes = al.filter(a => a.fetchedMs <= d);
  // conocidas al inicio Y vigentes en ese instante (onset <= desde < expires), sin cancelar
  const vigAlInicio = alAntes.filter(a => a.onsetMs <= d && a.expMs > d && !a.cancelada);
  const sevAntes = [...new Set(alAntes.map(a => `${a.event}/${a.severity}`))];
  const sev = [...new Set(al.map(a => `${a.event}/${a.severity}`))];
  const hidro = al.filter(a => !/tormenta/i.test(a.event)).length;
  console.log(JSON.stringify({ caso: c.caso, desde: utc(d), hasta: utc(h), celda: run.cells[ci].id, distKm: +best.toFixed(1), runConocidoAlInicio: utc(run.runMs), fetched: utc(run.fetchedMs), pVentanaMm: +sum.toFixed(1), rafagaMax: gust, tormentaWMO: tor, ultimoRunEnVentana: utc(last.runMs), pVentanaUltimoRunMm: +sum2.toFixed(1), alertasDepSolapan: al.length, conocidasAlInicio: alAntes.length, vigentesYConocidasAlInicio: vigAlInicio.length, severidadesConocidasAlInicio: sevAntes, severidades: sev, primeraEnviada: al.length ? utc(Math.min(...al.map(a => a.sentMs))) : null, noTormenta: hidro, base: c.base }));
}
