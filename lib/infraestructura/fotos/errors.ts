export type CodigoErrorPipelineFoto =
  | 'unsupported_format'
  | 'invalid_input'
  | 'invalid_limit'
  | 'too_large'
  | 'out_of_memory'
  | 'storage_failed'
  | 'missing_original'
  | 'processing_failed'

export class ErrorPipelineFoto extends Error {
  readonly name: string = 'ErrorPipelineFoto'
  readonly code: CodigoErrorPipelineFoto

  constructor(code: CodigoErrorPipelineFoto, message: string, options?: ErrorOptions) {
    super(message, options)
    this.code = code
  }
}
