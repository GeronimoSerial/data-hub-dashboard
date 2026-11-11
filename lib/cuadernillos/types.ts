export type QuantityLine = { productId: string; quantity: number }

export type ApprovalInput = {
  requestId: string
  lines: QuantityLine[]
  idempotencyKey: string
}

export type ApprovalResult = {
  requestId: string
  status: 'approved'
  approved: QuantityLine[]
  remaining: QuantityLine[]
  signerUserId: string
  approvedAt: string
}

export type RejectInput = {
  requestId: string
  idempotencyKey: string
  reason: string
}

export type Eligibility = {
  eligible: boolean
  severity: string | null
  evaluatedAt: string
}

export type EnrollmentRecommendation = {
  productId: string
  students: number | null
  suggested: number | null
  sourceCutId: string | null
}

export type AssignmentProvenance = {
  sourceId: string
  location: string
}

export type AssignmentRelationship = 'cabecera' | 'dependiente'

/** A source assertion, not a verified account or permission grant. */
export type AssignmentSourceRow = {
  cue: string | null
  schoolName: string
  relationship: AssignmentRelationship
  supervisorName: string | null
  cabeceraCue: string | null
  provenance: AssignmentProvenance
}

export type AssignmentAccepted = {
  cueAnexo: string
  schoolName: string
  relationship: AssignmentRelationship
  supervisorName: string
  cabeceraCue: string
  provenance: AssignmentProvenance[]
}

export type AssignmentConflict = {
  cueAnexo: string
  rows: AssignmentSourceRow[]
}

export type AssignmentUnresolvedReason =
  | 'missing_cue'
  | 'invalid_cue'
  | 'missing_annex'
  | 'missing_supervisor'
  | 'missing_cabecera'
  | 'invalid_cabecera'

export type AssignmentUnresolved = {
  cue: string | null
  schoolName: string
  reason: AssignmentUnresolvedReason
  provenance: AssignmentProvenance
}

export type AssignmentValidationResult = {
  accepted: AssignmentAccepted[]
  conflicts: AssignmentConflict[]
  unresolved: AssignmentUnresolved[]
}

export type BookletCapability = 'planning' | 'cabecera' | 'supervisor'

export type BookletBalanceView = {
  productId: string
  productLabel: string
  globalAvailable: number | null
  quotaAssigned: number | null
  quotaAvailable: number | null
  cabeceraCueAnexo: string | null
  cabeceraName: string | null
}

export type BookletCampaignOption = {
  id: string
  name: string
  distributionEnabled: boolean
  overassignmentAllowed: boolean | null
}

export type BookletRequestLineView = {
  productId: string
  productLabel: string
  quantity: number
}

export type BookletRequestSummary = {
  requestId: string
  rootRequestId: string
  recipientCueAnexo: string
  recipientName: string
  cabeceraCueAnexo: string
  cabeceraName: string
  status: 'draft' | 'pending' | 'approved' | 'rejected'
  requested: BookletRequestLineView[]
  approved: BookletRequestLineView[]
  remaining: BookletRequestLineView[]
  submittedAt: string | null
  approvedAt: string | null
  approvalIdentity: string | null
}

/** Display-only assignment fields; names do not establish authorization. */
export type BookletAssignmentView = {
  cueAnexo: string
  schoolName: string
  relationship: AssignmentRelationship
  cabeceraCueAnexo: string | null
  supervisorName: string | null
}

export type BookletOverview = {
  capability: BookletCapability
  campaignId: string | null
  campaignOptions: BookletCampaignOption[]
  balances: BookletBalanceView[]
  requests: BookletRequestSummary[]
  eligibility: Eligibility | null
  hasMore: boolean
  nextCursor: string | null
}

export type BookletRequestsPage = {
  campaignId: string | null
  campaignOptions: BookletCampaignOption[]
  requests: BookletRequestSummary[]
  hasMore: boolean
  nextCursor: string | null
}

export type BookletAssignmentsPage = {
  items: BookletAssignmentView[]
  nextCursor: string | null
}

export type StockInput = {
  campaignId: string
  productId: string
  quantity: number
  movement: 'initial' | 'replenishment'
  idempotencyKey: string
}

export type StockView = {
  campaignId: string
  productId: string
  globalStock: number
}

export type QuotaInput = {
  campaignId: string
  cabeceraCueAnexo: string
  productId: string
  quantity: number
}

export type QuotaView = {
  campaignId: string
  cabeceraCueAnexo: string
  productId: string
  assigned: number
  globalStock: number
  quotaAvailable: number
}

export type CreateRequestInput = {
  campaignId: string
  recipientCueAnexo: string
  lines: QuantityLine[]
  submit: boolean
  idempotencyKey: string
}

export type RequestView = {
  requestId: string
  campaignId: string
  recipientCueAnexo: string
  recipientName: string
  cabeceraCueAnexo: string
  status: 'draft' | 'pending' | 'approved' | 'rejected'
  lines: QuantityLine[]
  recommendations: EnrollmentRecommendation[]
  submittedAt: string | null
}

export type RemainderInput = {
  rootRequestId: string
  lines: QuantityLine[]
  idempotencyKey: string
}

export type RequestChainView = {
  rootRequestId: string
  requested: QuantityLine[]
  approved: QuantityLine[]
  remaining: QuantityLine[]
  availableRemainder: QuantityLine[]
}
