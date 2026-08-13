# hub-nav-fullbleed Specification

## Purpose

Production chrome shows only ready sections. Map viewers use the remaining viewport under the masthead.

## Requirements

### Requirement: Ready-only primary nav

The TabList MUST include Inicio and Mapas. It MUST NOT include Reportes, Tableros, or Administración in this slice. Direct URLs to hidden sections MAY still render.

#### Scenario: Production tabs

- GIVEN the user is on any hub page
- WHEN the primary nav renders
- THEN tabs MUST be Inicio and Mapas only

#### Scenario: Mapas stays selected on viewer

- GIVEN the pathname is `/mapas/matricula`
- WHEN the TabList computes selection
- THEN Mapas MUST be selected

### Requirement: Full-bleed map viewer chrome

When the pathname starts with `/mapas/` and is not exactly `/mapas`, the shell MUST hide the footer and MUST NOT apply the catalog max-width or catalog padding on `main`. Masthead and TabList MUST remain visible.

#### Scenario: Viewer uses remaining height

- GIVEN the user opens `/mapas/matricula`
- WHEN the shell lays out
- THEN `main` MUST fill the viewport below the nav with no 1180px cap
- AND the footer MUST NOT be visible

#### Scenario: Catalog keeps constrained layout

- GIVEN the user is on `/mapas`
- WHEN the shell lays out
- THEN the catalog max-width and footer MUST remain as today
