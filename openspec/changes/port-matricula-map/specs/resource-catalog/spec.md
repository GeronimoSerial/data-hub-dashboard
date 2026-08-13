# resource-catalog Specification

## Purpose

How catalog resources gain an optional in-app path so a published map can open a viewer without making every card a link.

## Requirements

### Requirement: Optional resource path

A Recurso MAY include `ruta`. When present it MUST be an in-app path starting with `/`. When absent the resource MUST remain display-only.

#### Scenario: Matrícula card navigates

- GIVEN resource r1 is published with `ruta` `/mapas/matricula`
- WHEN the user activates that card on `/mapas` or Inicio
- THEN the app MUST navigate to `/mapas/matricula`

#### Scenario: Alertas card stays inert

- GIVEN resource r3 has no `ruta`
- WHEN the user views that card
- THEN the card MUST NOT navigate
- AND it MUST still show title, taxonomy, and metadata

#### Scenario: Path is optional on create

- GIVEN an admin upserts a Recurso without `ruta`
- WHEN the resource is stored in hub state
- THEN the system MUST accept it
- AND catalog cards for it MUST stay inert
