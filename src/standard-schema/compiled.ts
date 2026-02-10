import type {StandardSchemaV1} from './contract.js'
import {looksLikeStandardSchemaFailure} from './utils.js'
import {assertStandardSchema, isPromiseLike} from './validation.js'

export const NO_MATCH = Symbol('no-match')
export const ASYNC_REQUIRED = Symbol('async-required')

type NoMatch = typeof NO_MATCH
type AsyncRequired = typeof ASYNC_REQUIRED

type SyncMatchResult = unknown | NoMatch | AsyncRequired
type AsyncMatchResult = Promise<unknown | NoMatch>

type CompiledMatcher = {
  sync: (value: unknown) => SyncMatchResult
  async: (value: unknown) => AsyncMatchResult
}

const compiledMatcherSymbol = Symbol.for('schema-match.compiled-matcher')
const fastCheckSymbol = Symbol.for('schema-match.fast-check')
const compiledMatcherCache = new WeakMap<object, CompiledMatcher>()

export const matchSchemaSync = (schema: StandardSchemaV1, value: unknown): SyncMatchResult => {
  return getCompiledMatcher(schema).sync(value)
}

export const matchSchemaAsync = async (schema: StandardSchemaV1, value: unknown): AsyncMatchResult => {
  return await getCompiledMatcher(schema).async(value)
}

const getCompiledMatcher = (schema: StandardSchemaV1): CompiledMatcher => {
  const schemaObject = schema as object & {[compiledMatcherSymbol]?: CompiledMatcher}
  const symbolCached = schemaObject[compiledMatcherSymbol]
  if (symbolCached) return symbolCached

  const cached = compiledMatcherCache.get(schemaObject)
  if (cached) return cached

  const compiled = compileMatcher(schema)

  try {
    schemaObject[compiledMatcherSymbol] = compiled
  } catch {
    compiledMatcherCache.set(schemaObject, compiled)
  }

  return compiled
}

const compileMatcher = (schema: StandardSchemaV1): CompiledMatcher => {
  assertStandardSchema(schema)

  const literalMatcher = compileLiteralMatcher(schema)
  if (literalMatcher) return literalMatcher

  const fastCheckMatcher = compileFastCheckMatcher(schema)
  if (fastCheckMatcher) return fastCheckMatcher

  const zodMatcher = compileZodMatcher(schema)
  if (zodMatcher) return zodMatcher

  const valibotMatcher = compileValibotMatcher(schema)
  if (valibotMatcher) return valibotMatcher

  const arktypeMatcher = compileArktypeMatcher(schema)
  if (arktypeMatcher) return arktypeMatcher

  return compileGenericMatcher(schema)
}

const compileLiteralMatcher = (schema: StandardSchemaV1): CompiledMatcher | null => {
  const maybeSchema = schema as any

  if (Object.prototype.hasOwnProperty.call(maybeSchema, 'unit') && maybeSchema.includesTransform !== true) {
    const unit = maybeSchema.unit
    return {
      sync: value => (Object.is(value, unit) ? unit : NO_MATCH),
      async: async value => (Object.is(value, unit) ? unit : NO_MATCH),
    }
  }

  if (maybeSchema?.type === 'literal' && Object.prototype.hasOwnProperty.call(maybeSchema, 'literal')) {
    const literal = maybeSchema.literal
    return {
      sync: value => (Object.is(value, literal) ? literal : NO_MATCH),
      async: async value => (Object.is(value, literal) ? literal : NO_MATCH),
    }
  }

  const zodDef = maybeSchema?._def ?? maybeSchema?.def
  if (zodDef?.type === 'literal' && Array.isArray(zodDef.values) && zodDef.values.length === 1) {
    const literal = zodDef.values[0]
    return {
      sync: value => (Object.is(value, literal) ? literal : NO_MATCH),
      async: async value => (Object.is(value, literal) ? literal : NO_MATCH),
    }
  }

  return null
}

const compileFastCheckMatcher = (schema: StandardSchemaV1): CompiledMatcher | null => {
  const fastCheck = (schema as any)[fastCheckSymbol]
  if (typeof fastCheck !== 'function') return null

  return {
    sync: value => {
      const result = fastCheck(value)
      if (isPromiseLike(result)) return ASYNC_REQUIRED
      return result ? value : NO_MATCH
    },
    async: async value => {
      const result = await fastCheck(value)
      return result ? value : NO_MATCH
    },
  }
}

const compileGenericMatcher = (schema: StandardSchemaV1): CompiledMatcher => {
  const validate = schema['~standard'].validate
  return {
    sync: value => {
      const result = validate(value)
      if (isPromiseLike(result)) return ASYNC_REQUIRED
      return isFailureResult(result) ? NO_MATCH : result.value
    },
    async: async value => {
      const result = await validate(value)
      return isFailureResult(result) ? NO_MATCH : result.value
    },
  }
}

const compileZodMatcher = (schema: StandardSchemaV1): CompiledMatcher | null => {
  const zod = (schema as any)._zod
  const run = zod?.run
  if (!zod || typeof run !== 'function') return null
  const precheck = compileZodLikePrecheck(schema as any)

  const syncPayload: {value: unknown; issues: unknown[]} = {value: undefined, issues: []}
  const asyncPayload: {value: unknown; issues: unknown[]} = {value: undefined, issues: []}
  const syncCtx = {async: false}
  const asyncCtx = {async: true}

  return {
    sync: value => {
      if (precheck && !precheck(value)) return NO_MATCH
      syncPayload.value = value
      syncPayload.issues.length = 0
      const result = run.call(schema, syncPayload, syncCtx)
      if (isPromiseLike(result)) return ASYNC_REQUIRED
      return syncPayload.issues.length === 0 ? result.value : NO_MATCH
    },
    async: async value => {
      if (precheck && !precheck(value)) return NO_MATCH
      asyncPayload.value = value
      asyncPayload.issues.length = 0
      const result = await run.call(schema, asyncPayload, asyncCtx)
      return asyncPayload.issues.length === 0 ? result.value : NO_MATCH
    },
  }
}

const compileArktypeMatcher = (schema: StandardSchemaV1): CompiledMatcher | null => {
  const maybeSchema = schema as any
  const allows = maybeSchema.allows
  if (typeof allows !== 'function') return null

  const callable = typeof schema === 'function' ? (schema as (value: unknown) => unknown) : null
  const includesTransform = maybeSchema.includesTransform === true

  return {
    sync: value => {
      if (!allows(value)) return NO_MATCH

      if (!callable || !includesTransform) return value

      const result = callable(value)
      if (isPromiseLike(result)) return ASYNC_REQUIRED
      return isFailureResult(result) ? NO_MATCH : result
    },
    async: async value => {
      if (!allows(value)) return NO_MATCH

      if (!callable || !includesTransform) return value

      const result = await callable(value)
      return isFailureResult(result) ? NO_MATCH : result
    },
  }
}

type ZodLikePrecheck = (value: unknown) => boolean

const compileZodLikePrecheck = (schema: any): ZodLikePrecheck | null => {
  const def = schema?._def ?? schema?.def
  if (!def || typeof def !== 'object') return null

  switch (def.type) {
    case 'literal': {
      const values = Array.isArray(def.values) ? def.values : []
      if (values.length !== 1) return null
      const literal = values[0]
      return value => Object.is(value, literal)
    }
    case 'object': {
      const shape = typeof def.shape === 'function' ? def.shape() : def.shape
      if (!shape || typeof shape !== 'object') return isPlainObject

      const checks: Array<[key: string, check: ZodLikePrecheck]> = []
      for (const key in shape) {
        const check = compileZodLikePrecheck(shape[key])
        if (check) checks.push([key, check])
      }

      if (checks.length === 0) return isPlainObject

      return value => {
        if (!isPlainObject(value)) return false
        const record = value as Record<string, unknown>
        for (let index = 0; index < checks.length; index += 1) {
          const [key, check] = checks[index]
          if (!check(record[key])) return false
        }
        return true
      }
    }
    case 'tuple': {
      const items = Array.isArray(def.items) ? def.items : []
      const hasRest = !!def.rest
      if (items.length === 0 && !hasRest) {
        return value => Array.isArray(value) && value.length === 0
      }

      const checks = items.map((item: unknown) => compileZodLikePrecheck(item))
      return value => {
        if (!Array.isArray(value)) return false
        if (value.length < items.length) return false
        if (!hasRest && value.length > items.length) return false
        for (let index = 0; index < checks.length; index += 1) {
          const check = checks[index]
          if (check && !check(value[index])) return false
        }
        return true
      }
    }
    case 'union': {
      const options = Array.isArray(def.options) ? def.options : []
      if (options.length === 0) return null

      const checks = options
        .map((option: unknown) => compileZodLikePrecheck(option))
        .filter((check: ZodLikePrecheck | null): check is ZodLikePrecheck => check !== null)

      if (checks.length === 0) return null

      return value => {
        for (let index = 0; index < checks.length; index += 1) {
          if (checks[index](value)) return true
        }
        return false
      }
    }
    case 'string':
    case 'number':
    case 'boolean':
    case 'bigint':
    case 'symbol': {
      const expected = def.type as string
      return value => typeof value === expected
    }
    case 'null':
      return value => value === null
    case 'undefined':
      return value => value === undefined
    case 'date':
      return value => value instanceof Date
    default:
      return null
  }
}

const compileValibotMatcher = (schema: StandardSchemaV1): CompiledMatcher | null => {
  const maybeSchema = schema as any
  const run = maybeSchema?.['~run']
  if (typeof run !== 'function') return null

  const isAsyncSchema = maybeSchema.async === true
  const precheck = compileValibotPrecheck(maybeSchema)
  const config = {}

  return {
    sync: value => {
      if (isAsyncSchema) return ASYNC_REQUIRED
      if (precheck && !precheck(value)) return NO_MATCH

      const result = run.call(schema, {value}, config)
      if (isPromiseLike(result)) return ASYNC_REQUIRED
      return result.typed ? result.value : NO_MATCH
    },
    async: async value => {
      if (precheck && !precheck(value)) return NO_MATCH

      const result = await run.call(schema, {value}, config)
      return result.typed ? result.value : NO_MATCH
    },
  }
}

type ValibotPrecheck = (value: unknown) => boolean

const compileValibotPrecheck = (schema: any): ValibotPrecheck | null => {
  if (!schema || typeof schema !== 'object') return null

  switch (schema.type) {
    case 'literal': {
      if (!Object.prototype.hasOwnProperty.call(schema, 'literal')) return null
      const literal = schema.literal
      return value => Object.is(value, literal)
    }
    case 'object': {
      const entries = schema.entries
      if (!entries || typeof entries !== 'object') {
        return isPlainObject
      }

      const checks: Array<[key: string, check: ValibotPrecheck]> = []
      for (const key in entries) {
        const check = compileValibotPrecheck(entries[key])
        if (check) checks.push([key, check])
      }

      if (checks.length === 0) return isPlainObject

      return value => {
        if (!isPlainObject(value)) return false
        const record = value as Record<string, unknown>
        for (let index = 0; index < checks.length; index += 1) {
          const [key, check] = checks[index]
          if (!check(record[key])) return false
        }
        return true
      }
    }
    case 'tuple': {
      const items = Array.isArray(schema.items) ? schema.items : []
      const hasRest = !!schema.rest
      if (items.length === 0 && !hasRest) {
        return value => Array.isArray(value) && value.length === 0
      }

      const checks = items.map((item: unknown) => compileValibotPrecheck(item))
      return value => {
        if (!Array.isArray(value)) return false
        if (value.length < items.length) return false
        if (!hasRest && value.length > items.length) return false
        for (let index = 0; index < checks.length; index += 1) {
          const check = checks[index]
          if (check && !check(value[index])) return false
        }
        return true
      }
    }
    case 'variant': {
      const key = schema.key
      const options = Array.isArray(schema.options) ? schema.options : []
      if (typeof key !== 'string' || options.length === 0) return null

      const byDiscriminator = new Map<unknown, ValibotPrecheck>()
      for (let index = 0; index < options.length; index += 1) {
        const option = options[index]
        const literal = option?.entries?.[key]?.literal
        if (literal === undefined) continue
        byDiscriminator.set(literal, compileValibotPrecheck(option) ?? (() => true))
      }

      if (byDiscriminator.size === 0) return null

      return value => {
        if (!isPlainObject(value)) return false
        const record = value as Record<string, unknown>
        const optionCheck = byDiscriminator.get(record[key])
        if (!optionCheck) return false
        return optionCheck(value)
      }
    }
    case 'union': {
      const options = Array.isArray(schema.options) ? schema.options : []
      if (options.length === 0) return null

      const checks = options
        .map((option: unknown) => compileValibotPrecheck(option))
        .filter((check: ValibotPrecheck | null): check is ValibotPrecheck => check !== null)

      if (checks.length === 0) return null

      return value => {
        for (let index = 0; index < checks.length; index += 1) {
          if (checks[index](value)) return true
        }
        return false
      }
    }
    case 'string':
    case 'number':
    case 'boolean':
    case 'bigint':
    case 'symbol': {
      const expected = schema.type as string
      return value => typeof value === expected
    }
    case 'null':
      return value => value === null
    case 'undefined':
      return value => value === undefined
    case 'date':
      return value => value instanceof Date
    default:
      return null
  }
}

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

const isFailureResult = (result: unknown): result is StandardSchemaV1.FailureResult => {
  if (!result || typeof result !== 'object') return false
  if ('issues' in result) return true
  return looksLikeStandardSchemaFailure(result)
}
