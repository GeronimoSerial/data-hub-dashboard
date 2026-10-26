// Port of "who a parte affects" for one CUE. Nothing here names a GE table or
// a GE column: adapters translate their own rows into these shapes.
//
// GE-shaped consumers that stay on the GE rows (listarSeccionesGe) and why:
// - ParteActual.secciones and calcularEstadoServicioGeneral read geSectionId
//   and curso/division/nivel, and the GET ficha serializes those rows; the
//   response contract is frozen by the characterization tests.
// - describirMovimiento receives the same snapshot to name sections.
// Validation and membership checks (POST section/turno, members per unit) use
// the generic UnidadAlcance and the port methods.

// Unit of scope a parte can affect, in generic terms.
// - id: adapter-local numeric id (GE: ge_section_id).
// - etiqueta: human label for the unit.
// - turno: shift the unit runs in, used for shift-level validation.
// - grupo: grouping level (GE: nivel; higher-education: career type, later).
export interface UnidadAlcance {
  id: number
  etiqueta: string
  turno: string | null
  grupo: string | null
}

// A member of a unit. miembroId is a numeric surrogate id: GE uses the
// person id; matrícula members will use their own numeric row id. DNI is only
// a hashed search column and never an identity here.
export interface IdentidadMiembro {
  miembroId: number
  nombre: string
  apellido: string
}

// Who is affected by a parte, for one CUE. Adapters decide where units and
// members come from; callers only see units, member ids per unit and the
// identities behind those ids.
//
// Out of this port's scope (T2): per-unit service interruption (alcance de
// servicio por sección) and building state. They are designed in T4, once a
// second adapter shows what the port has to carry.
export interface AlcanceProvider {
  // Units of the CUE in the vigente corte.
  listUnits(): Promise<UnidadAlcance[]>
  // Member ids per unit. Units without members may be absent from the map;
  // callers read them with `get(id) ?? new Set()`.
  listMembers(unitIds: number[]): Promise<Map<number, Set<number>>>
  // Names behind member ids. Only call for an authorized, nominal view.
  resolveIdentities(memberIds: number[]): Promise<IdentidadMiembro[]>
}
