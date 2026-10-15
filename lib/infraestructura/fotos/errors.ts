export type CodigoErrorPipelineFoto =
  | 'unsupported_format'
  | 'too_large'
  | 'out_of_memory'
  | 'processing_failed'

export class ErrorPipelineFoto extends Error {
  readonly name: string = 'ErrorPipelineFoto'
  readonly code: CodigoErrorPipelineFoto

  constructor(code: CodigoErrorPipelineFoto, message: string, options?: ErrorOptions) {
    super(message, options)
    this.code = code
  }
}
