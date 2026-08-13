# map-viewer Specification

## Purpose

Provincial enrollment map as a client MapLibre view, including the Sobreoferta overlay and optional API GE timeline.

## Requirements

### Requirement: Viewer route

The system MUST serve `/mapas/matricula` as a client-only map. The map MUST NOT be server-rendered.

#### Scenario: Open viewer

- GIVEN core GeoJSON files exist under `/data/`
- WHEN the user opens `/mapas/matricula`
- THEN the map MUST show establishments, zones, and localities after load

#### Scenario: Missing required data

- GIVEN a required file (`summary.json` or a core GeoJSON) fails to load
- WHEN the viewer finishes fetching
- THEN the user MUST see an error, not a blank shell

#### Scenario: Optional enrichment missing

- GIVEN `sobreoferta.json` or `api-cantidad-alumnos.json` is absent
- WHEN the viewer finishes fetching
- THEN the core map MUST still load
- AND the Sobreoferta toggle MAY remain available
- AND the popup MUST omit Demanda and API GE sections that have no data

### Requirement: Core controls

The viewer MUST provide search by name/CUE, layer toggles (zones, sobreoferta, down, up, flat, partial, localities), basemap choice, legend with 2023–2026 summary, title from summary, and a popup from GeoJSON properties.

#### Scenario: Search flies to school

- GIVEN establishments are loaded
- WHEN the user picks a search hit
- THEN the map MUST fly to that point and MUST open the establishment popup

#### Scenario: Popup shows GeoJSON series

- GIVEN an establishment or zone is selected
- WHEN the popup renders
- THEN it MUST show extracted series/properties (enrollment, costs)

### Requirement: Sobreoferta overlay

The viewer MUST offer a «Sobreoferta escolar» layer toggle. The toggle MUST default to off. When on and `sobreoferta.json` is loaded, zone and school paint MUST use the semáforo colors; the legend MUST show the semáforo block; the popup MUST show the Demanda vs edificios section.

#### Scenario: Toggle present and off by default

- GIVEN the viewer is showing layer controls
- WHEN the user inspects overlays
- THEN there MUST be a Sobreoferta escolar toggle
- AND it MUST be unchecked until the user enables it

#### Scenario: Semáforo paint when enabled

- GIVEN `sobreoferta.json` is loaded
- WHEN the user enables Sobreoferta escolar
- THEN zone fill/stroke and school circles MUST use semáforo colors from that dataset

#### Scenario: Demanda in popup when enabled

- GIVEN Sobreoferta is on and the dataset has a matching department or zone
- WHEN the user selects an establishment or zone
- THEN the popup MUST show the Demanda vs edificios section

### Requirement: API GE timeline

When `api-cantidad-alumnos.json` is loaded, an establishment popup MUST show the API GE enrollment timeline for that CUE if an entry exists.

#### Scenario: Timeline when CUE matches

- GIVEN the API dataset contains the selected establishment CUE
- WHEN the popup renders
- THEN it MUST show inicio → fin by year
- AND it MUST NOT require Sobreoferta to be on

### Requirement: Theme vs map colors

Fluent overlays MUST follow hub light/dark tokens. Establishment/zone fill and stroke MUST keep the trend palette unless Sobreoferta is on.

#### Scenario: Dark mode panels

- GIVEN the user enables dark theme
- WHEN overlay panels render
- THEN panel chrome MUST use Fluent dark tokens
- AND trend swatches MUST keep the same fill/stroke colors
