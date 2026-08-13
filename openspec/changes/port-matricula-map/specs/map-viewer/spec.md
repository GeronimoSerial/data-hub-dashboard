# map-viewer Specification

## Purpose

Core provincial enrollment map as a client MapLibre view. No sobreoferta and no API GE timeline in this slice.

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

### Requirement: Core controls

The viewer MUST provide search by name/CUE, trend layer toggles (zones, down, up, flat, partial, localities), basemap choice, legend with 2023–2026 summary, title from summary, and a basic popup from GeoJSON properties.

#### Scenario: Search flies to school

- GIVEN establishments are loaded
- WHEN the user picks a search hit
- THEN the map MUST fly to that point and MUST open the establishment popup

#### Scenario: Popup is GeoJSON-only

- GIVEN an establishment or zone is selected
- WHEN the popup renders
- THEN it MUST show extracted series/properties
- AND it MUST NOT show API GE timeline or sobreoferta semáforo

#### Scenario: Sobreoferta not offered

- GIVEN the viewer is showing layer controls
- WHEN the user inspects overlays
- THEN there MUST NOT be a Sobreoferta escolar toggle

### Requirement: Theme vs map colors

Fluent overlays MUST follow hub light/dark tokens. Establishment/zone fill and stroke MUST keep the existing trend palette.

#### Scenario: Dark mode panels

- GIVEN the user enables dark theme
- WHEN overlay panels render
- THEN panel chrome MUST use Fluent dark tokens
- AND trend swatches MUST keep the same fill/stroke colors
