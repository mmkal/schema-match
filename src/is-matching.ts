import type {StandardSchemaV1} from './standard-schema/contract.js'
import {assertStandardSchema, isSuccess, validateAsync, validateSync} from './standard-schema/validation.js'
import type {InferOutput} from './types.js'

export function isMatching<const schema extends StandardSchemaV1>(
  schema: schema
): (value: unknown) => value is InferOutput<schema>
export function isMatching<const schema extends StandardSchemaV1>(
  schema: schema,
  value: unknown
): value is InferOutput<schema>
export function isMatching<const schema extends StandardSchemaV1>(
  schema: schema,
  value?: unknown
): boolean | ((value: unknown) => boolean) {
  assertStandardSchema(schema)
  if (arguments.length === 1) {
    return (next: unknown): next is InferOutput<schema> => isMatchingValue(schema, next)
  }
  return isMatchingValue(schema, value)
}

export function isMatchingAsync<const schema extends StandardSchemaV1>(
  schema: schema
): (value: unknown) => Promise<boolean>
export function isMatchingAsync<const schema extends StandardSchemaV1>(
  schema: schema,
  value: unknown
): Promise<boolean>
export function isMatchingAsync<const schema extends StandardSchemaV1>(
  schema: schema,
  value?: unknown
): Promise<boolean> | ((value: unknown) => Promise<boolean>) {
  assertStandardSchema(schema)
  if (arguments.length === 1) {
    return async (next: unknown) => {
      const result = await validateAsync(schema, next)
      return isSuccess(result)
    }
  }
  return (async () => {
    const result = await validateAsync(schema, value)
    return isSuccess(result)
  })()
}

const isMatchingValue = <schema extends StandardSchemaV1>(
  schema: schema,
  value: unknown
): value is InferOutput<schema> => {
  const result = validateSync(schema, value)
  return isSuccess(result)
}
