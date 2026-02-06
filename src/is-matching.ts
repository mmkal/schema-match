import type {StandardSchemaV1} from './standard-schema/contract.js'
import {ASYNC_REQUIRED, NO_MATCH, matchSchemaAsync, matchSchemaSync} from './standard-schema/compiled.js'
import {assertStandardSchema} from './standard-schema/validation.js'
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
      return (await matchSchemaAsync(schema, next)) !== NO_MATCH
    }
  }
  return (async () => {
    return (await matchSchemaAsync(schema, value)) !== NO_MATCH
  })()
}

const isMatchingValue = <schema extends StandardSchemaV1>(
  schema: schema,
  value: unknown
): value is InferOutput<schema> => {
  const result = matchSchemaSync(schema, value)
  if (result === ASYNC_REQUIRED) {
    throw new Error('Schema validation returned a Promise. Use isMatchingAsync instead.')
  }
  return result !== NO_MATCH
}
