import type {StandardSchemaV1} from './standard-schema/contract.js'

export type StandardSchema = StandardSchemaV1

export type InferInput<Schema extends StandardSchemaV1> = StandardSchemaV1.InferInput<Schema>
export type InferOutput<Schema extends StandardSchemaV1> = StandardSchemaV1.InferOutput<Schema>
