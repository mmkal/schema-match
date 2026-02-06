import type {StandardSchemaV1} from './contract.js'
import {looksLikeStandardSchema, looksLikeStandardSchemaFailure} from './utils.js'

export function assertStandardSchema(schema: unknown): asserts schema is StandardSchemaV1 {
  if (!looksLikeStandardSchema(schema)) {
    throw new TypeError('Expected a Standard Schema value with a `~standard` property.')
  }
}

export const isPromiseLike = (value: unknown): value is Promise<unknown> => {
  return !!value && (typeof value === 'object' || typeof value === 'function') && 'then' in value
}

export const validateSync = <Output>(
  schema: StandardSchemaV1<unknown, Output>,
  value: unknown
): StandardSchemaV1.Result<Output> => {
  const result = schema['~standard'].validate(value)
  if (isPromiseLike(result)) {
    throw new Error('Schema validation returned a Promise. Use matchAsync or isMatchingAsync instead.')
  }
  return result
}

export const validateAsync = async <Output>(
  schema: StandardSchemaV1<unknown, Output>,
  value: unknown
): Promise<StandardSchemaV1.Result<Output>> => {
  return await schema['~standard'].validate(value)
}

export const isSuccess = <Output>(
  result: StandardSchemaV1.Result<Output>
): result is StandardSchemaV1.SuccessResult<Output> => {
  return !looksLikeStandardSchemaFailure(result)
}
