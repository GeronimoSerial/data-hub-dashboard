#!/usr/bin/env node
// Public Shiny chart extraction: no login, private endpoints, or DEIS mutation.
import { chromium } from '@playwright/test'
import { writeFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { extraerSerieRenaper, construirSnapshotRenaper } from '../lib/mapas/renaper-natalidad.ts'

if (process.argv.includes('--help')) {
  console.log('Usage: node scripts/extract-renaper-natalidad.mjs\nReads public RENAPER charts for all 25 Corrientes departments and the provincial series (2012–2025). Writes independent source/public snapshots; never modifies DEIS. Requires installed Playwright Chromium.')
  process.exit(0)
}
const root = fileURLToPath(new URL('../', import.meta.url))
const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage()
  await page.goto('https://estadisticas.renaper.gob.ar/app_myn/', { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => window.Shiny?.shinyapp?.$values?.mapa)
  const methodology = (await page.locator('body').textContent()).replace(/\s+/g, ' ')
  if (!methodology.includes('2012–2025') || !/Septiembre de 2026/i.test(methodology)) {
    throw new Error('RENAPER source period/cutoff changed; review provenance before publishing')
  }
  await page.evaluate(() => {
    Shiny.setInputValue('boton_selector_prov_dpto', 'CORRIENTES')
    Shiny.setInputValue('provincia_tres', ['CORRIENTES'])
    Shiny.setInputValue('boton_selector_tres', 'Nacimientos registrados')
    for (const name of ['names_dptos_Input', 'lineas_dpto_2_nac', 'lineas_d']) {
      Shiny.setInputValue('.clientdata_output_' + name + '_hidden', false)
    }
  })
  await page.waitForFunction(() => window.Shiny?.shinyapp?.$values?.names_dptos_Input?.html?.includes('BERON DE ASTRADA') && window.Shiny?.shinyapp?.$values?.lineas_d)
  const names = await page.evaluate(() => {
    const el = document.createElement('div')
    el.innerHTML = Shiny.shinyapp.$values.names_dptos_Input.html
    return [...el.querySelectorAll('option')].map(option => option.value)
  })
  const provinceSeries = await page.evaluate(() => Shiny.shinyapp.$values.lineas_d.x.hc_opts.series)
  if (provinceSeries[0]?.name !== 'CORRIENTES') throw new Error('Province chart is not Corrientes')
  await page.evaluate(() => [...document.querySelectorAll('a')].find(a => a.textContent.trim() === 'Nivel Departamental').click())
  await page.evaluate(() => [...document.querySelectorAll('.tab-pane.active a')].find(a => a.textContent.trim() === 'Evolución').click())
  await page.waitForFunction(() => document.querySelector('#departamento')?.selectize)
  await page.waitForTimeout(1500)
  const departamentos = {}
  for (const name of names) {
    const chart = await page.evaluate((name) => new Promise((resolve, reject) => {
      const selector = document.querySelector('#departamento').selectize
      if (selector.getValue() === name) {
        resolve(Shiny.shinyapp.$values.lineas_dpto_2_nac.x.hc_opts.series)
        return
      }
      const timer = setTimeout(() => { $(document).off('shiny:value.renaper'); reject(new Error('Department chart timed out: ' + name)) }, 15000)
      $(document).on('shiny:value.renaper', event => {
        if (event.name !== 'lineas_dpto_2_nac') return
        clearTimeout(timer)
        $(document).off('shiny:value.renaper')
        resolve(event.value.x.hc_opts.series)
      })
      selector.setValue(name)
    }), name)
    await page.waitForTimeout(150)
    departamentos[name] = extraerSerieRenaper(chart)
    console.log(name + ': 2025=' + departamentos[name]['2025'])
  }
  const snapshot = construirSnapshotRenaper(departamentos, extraerSerieRenaper(provinceSeries), new Date().toISOString())
  const payload = JSON.stringify(snapshot, null, 2) + '\n'
  for (const [directory, filename] of [['data/natalidad', 'renaper-corrientes-2012-2025.json'], ['public/data/natalidad', 'renaper.json']]) {
    await mkdir(resolve(root, directory), { recursive: true })
    await writeFile(resolve(root, directory, filename), payload)
  }
  console.log('RENAPER snapshot validated: 25 departments, 14 years; provincial 2025=' + snapshot.provincia.serie['2025'])
  console.log('Reconciliation: ' + JSON.stringify(snapshot.conciliacion))
} finally {
  await browser.close()
}
