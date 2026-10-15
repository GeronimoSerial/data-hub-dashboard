export type CodigoErrorPipelineFoto =
  | 'unsupported_format'
  | 'too_large'
  | 'out_of_memory'
  | 'processing_failed'

export class ErrorPipelineFoto extends Error {
  readonly name = 'ErrorPipelineFoto'

  constructor(readonly code: CodigoErrorPipelineFoto, message: string, options?: ErrorOptions) {
    super(message, options)
  }
}
