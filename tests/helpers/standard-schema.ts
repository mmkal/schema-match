import type {StandardSchemaV1} from '../../src/index.js'

export const success = <Output>(value: Output): StandardSchemaV1.SuccessResult<Output> => ({
  value,
})

export const failure = (message = 'Invalid value'): StandardSchemaV1.FailureResult => ({
  issues: [{message}],
})

export const makeSchema = <Output>(
  isMatch: (value: unknown) => value is Output,
  options?: {vendor?: string; message?: string}
): StandardSchemaV1<unknown, Output> => ({
  '~standard': {
    version: 1,
    vendor: options?.vendor ?? 'test',
    validate: (value: unknown) => (isMatch(value) ? success(value) : failure(options?.message)),
  },
})

export const makeAsyncSchema = <Output>(
  isMatch: (value: unknown) => value is Output,
  options?: {vendor?: string; message?: string}
): StandardSchemaV1<unknown, Output> => ({
  '~standard': {
    version: 1,
    vendor: options?.vendor ?? 'test',
    validate: async (value: unknown) => (isMatch(value) ? success(value) : failure(options?.message)),
  },
})
