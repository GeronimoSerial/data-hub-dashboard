# production-runtime Specification

## Purpose

Ship a Node 22 standalone image on port 3000 and document Coolify cutover without mixing Fastify into this repo.

## Requirements

### Requirement: Standalone HTTP server

The production image MUST run the Next standalone server on port 3000. A GET to `/` MUST return HTTP 200. Typecheck MUST fail the image build.

#### Scenario: Container serves home

- GIVEN the production image is running
- WHEN a client GETs `/`
- THEN the response MUST be 200

#### Scenario: Type errors block the image

- GIVEN TypeScript errors exist in the app
- WHEN `pnpm build` runs for the image
- THEN the build MUST fail

### Requirement: Documented cutover and rollback

Deploy docs MUST name the Coolify app, GHCR image, FQDN, and the Fastify rollback image `ghcr.io/geronimoserial/mapa-demografico`.

#### Scenario: Operator can roll back

- GIVEN Next is live on the FQDN
- WHEN an operator follows the rollback section
- THEN they MUST be able to restore the Fastify image without changing this codebase
