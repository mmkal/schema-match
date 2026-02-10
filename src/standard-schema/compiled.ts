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

const compiledMatcherSymbol = Symbol.for('schematch.compiled-matcher')
const fastCheckSymbol = Symbol.for('schematch.fast-check')
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
  const precheckResult = compileZodLikePrecheck(schema as any)
  const precheck = precheckResult?.check ?? null

  // When the precheck fully covers the schema (no transforms, pipes, refinements, or unhandled types),
  // we can skip _zod.run() entirely and just return the input value. This is especially beneficial
  // for zod-mini which lacks zod's JIT fast path.
  if (precheckResult?.complete) {
    return {
      sync: value => (precheck!(value) ? value : NO_MATCH),
      async: async value => (precheck!(value) ? value : NO_MATCH),
    }
  }

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

type ZodLikePrecheckResult = {
  check: ZodLikePrecheck
  /**
   * When true, the precheck fully validates the schema — no transforms, pipes, refinements,
   * or unhandled type constraints exist in the schema tree. This means we can skip `_zod.run()`
   * entirely and just return the original input value when the precheck passes.
   */
  complete: boolean
}

const compileZodLikePrecheck = (schema: any): ZodLikePrecheckResult | null => {
  const def = schema?._def ?? schema?.def
  if (!def || typeof def !== 'object') return null

  // Schemas with checks (e.g. z.string().min(5)) or coercion are not fully covered by our precheck
  const hasChecks = Array.isArray(def.checks) && def.checks.length > 0
  const hasCoerce = !!def.coerce

  switch (def.type) {
    case 'literal': {
      const values = Array.isArray(def.values) ? def.values : []
      if (values.length !== 1) return null
      const literal = values[0]
      return {check: value => Object.is(value, literal), complete: !hasChecks && !hasCoerce}
    }
    case 'object': {
      const shape = typeof def.shape === 'function' ? def.shape() : def.shape
      if (!shape || typeof shape !== 'object') return {check: isPlainObject, complete: false}

      const checks: Array<[key: string, check: ZodLikePrecheck]> = []
      let allComplete = !hasChecks && !hasCoerce
      const shapeKeys = Object.keys(shape)
      for (const key of shapeKeys) {
        const result = compileZodLikePrecheck(shape[key])
        if (result) {
          checks.push([key, result.check])
          if (!result.complete) allComplete = false
        } else {
          allComplete = false
        }
      }

      if (checks.length === 0) return {check: isPlainObject, complete: false}

      return {
        check: value => {
          if (!isPlainObject(value)) return false
          const record = value as Record<string, unknown>
          for (let index = 0; index < checks.length; index += 1) {
            const [key, check] = checks[index]
            if (!check(record[key])) return false
          }
          return true
        },
        // Complete only if we compiled checks for ALL shape keys
        complete: allComplete && checks.length === shapeKeys.length,
      }
    }
    case 'tuple': {
      const items = Array.isArray(def.items) ? def.items : []
      const hasRest = !!def.rest
      if (items.length === 0 && !hasRest) {
        return {check: value => Array.isArray(value) && value.length === 0, complete: !hasChecks && !hasCoerce}
      }

      const itemResults = items.map((item: unknown) => compileZodLikePrecheck(item))
      const checks = itemResults.map((r: ZodLikePrecheckResult | null) => r?.check ?? null)
      const allComplete = !hasChecks && !hasCoerce && !hasRest && itemResults.every((r: ZodLikePrecheckResult | null) => r?.complete)
      return {
        check: value => {
          if (!Array.isArray(value)) return false
          if (value.length < items.length) return false
          if (!hasRest && value.length > items.length) return false
          for (let index = 0; index < checks.length; index += 1) {
            const check = checks[index]
            if (check && !check(value[index])) return false
          }
          return true
        },
        complete: allComplete,
      }
    }
    case 'union': {
      const options = Array.isArray(def.options) ? def.options : []
      if (options.length === 0) return null

      const results = options
        .map((option: unknown) => compileZodLikePrecheck(option))
        .filter((r: ZodLikePrecheckResult | null): r is ZodLikePrecheckResult => r !== null)

      if (results.length === 0) return null

      const checks = results.map((r: ZodLikePrecheckResult) => r.check)
      return {
        check: value => {
          for (let index = 0; index < checks.length; index += 1) {
            if (checks[index](value)) return true
          }
          return false
        },
        // Complete only if ALL options were compiled and all are complete
        complete: !hasChecks && !hasCoerce && results.length === options.length && results.every((r: ZodLikePrecheckResult) => r.complete),
      }
    }
    case 'string':
    case 'number':
    case 'boolean':
    case 'bigint':
    case 'symbol': {
      // Coerced schemas accept any input type, so a typeof check would be incorrect
      if (hasCoerce) return null
      const expected = def.type as string
      return {check: value => typeof value === expected, complete: !hasChecks}
    }
    case 'null':
      return {check: value => value === null, complete: !hasChecks && !hasCoerce}
    case 'undefined':
      return {check: value => value === undefined, complete: !hasChecks && !hasCoerce}
    case 'date':
      // Coerced date schemas accept string/number inputs
      if (hasCoerce) return null
      return {check: value => value instanceof Date, complete: !hasChecks}
    case 'custom': {
      // Covers z.instanceof(SomeClass) — the `fn` is the custom validation function
      const fn = def.fn
      if (typeof fn === 'function') {
        return {check: value => fn(value), complete: !hasChecks && !hasCoerce}
      }
      return null
    }
    default:
      return null
  }
}

const compileValibotMatcher = (schema: StandardSchemaV1): CompiledMatcher | null => {
  const maybeSchema = schema as any
  const run = maybeSchema?.['~run']
  if (typeof run !== 'function') return null

  const isAsyncSchema = maybeSchema.async === true
  const precheckResult = compileValibotPrecheck(maybeSchema)
  const precheck = precheckResult?.check ?? null
  const config = {}

  // When the precheck fully covers the schema, skip ~run entirely
  if (precheckResult?.complete && !isAsyncSchema) {
    return {
      sync: value => (precheck!(value) ? value : NO_MATCH),
      async: async value => (precheck!(value) ? value : NO_MATCH),
    }
  }

  return {
    sync: value => {
      if (isAsyncSchema) return ASYNC_REQUIRED
      if (precheck && !precheck(value)) return NO_MATCH

      const result = run.call(schema, {value}, config)
      if (isPromiseLike(result)) return ASYNC_REQUIRED
      return result.typed && !result.issues ? result.value : NO_MATCH
    },
    async: async value => {
      if (precheck && !precheck(value)) return NO_MATCH

      const result = await run.call(schema, {value}, config)
      return result.typed && !result.issues ? result.value : NO_MATCH
    },
  }
}

type ValibotPrecheck = (value: unknown) => boolean

type ValibotPrecheckResult = {
  check: ValibotPrecheck
  complete: boolean
}

const compileValibotPrecheck = (schema: any): ValibotPrecheckResult | null => {
  if (!schema || typeof schema !== 'object') return null

  // Schemas with pipe (transformations, refinements, etc.) are not fully covered
  const hasPipe = Array.isArray(schema.pipe) && schema.pipe.length > 0

  switch (schema.type) {
    case 'literal': {
      if (!Object.prototype.hasOwnProperty.call(schema, 'literal')) return null
      const literal = schema.literal
      return {check: value => Object.is(value, literal), complete: !hasPipe}
    }
    case 'object': {
      const entries = schema.entries
      if (!entries || typeof entries !== 'object') {
        return {check: isPlainObject, complete: false}
      }

      const checks: Array<[key: string, check: ValibotPrecheck]> = []
      let allComplete = !hasPipe
      const entryKeys = Object.keys(entries)
      for (const key of entryKeys) {
        const result = compileValibotPrecheck(entries[key])
        if (result) {
          checks.push([key, result.check])
          if (!result.complete) allComplete = false
        } else {
          allComplete = false
        }
      }

      if (checks.length === 0) return {check: isPlainObject, complete: false}

      return {
        check: value => {
          if (!isPlainObject(value)) return false
          const record = value as Record<string, unknown>
          for (let index = 0; index < checks.length; index += 1) {
            const [key, check] = checks[index]
            if (!check(record[key])) return false
          }
          return true
        },
        complete: allComplete && checks.length === entryKeys.length,
      }
    }
    case 'tuple': {
      const items = Array.isArray(schema.items) ? schema.items : []
      const hasRest = !!schema.rest
      if (items.length === 0 && !hasRest) {
        return {check: value => Array.isArray(value) && value.length === 0, complete: !hasPipe}
      }

      const itemResults = items.map((item: unknown) => compileValibotPrecheck(item))
      const checks = itemResults.map((r: ValibotPrecheckResult | null) => r?.check ?? null)
      const allComplete = !hasPipe && !hasRest && itemResults.every((r: ValibotPrecheckResult | null) => r?.complete)
      return {
        check: value => {
          if (!Array.isArray(value)) return false
          if (value.length < items.length) return false
          if (!hasRest && value.length > items.length) return false
          for (let index = 0; index < checks.length; index += 1) {
            const check = checks[index]
            if (check && !check(value[index])) return false
          }
          return true
        },
        complete: allComplete,
      }
    }
    case 'variant': {
      const key = schema.key
      const options = Array.isArray(schema.options) ? schema.options : []
      if (typeof key !== 'string' || options.length === 0) return null

      const byDiscriminator = new Map<unknown, ValibotPrecheck>()
      let allComplete = !hasPipe
      for (let index = 0; index < options.length; index += 1) {
        const option = options[index]
        const literal = option?.entries?.[key]?.literal
        if (literal === undefined) continue
        const result = compileValibotPrecheck(option)
        byDiscriminator.set(literal, result?.check ?? (() => true))
        if (!result?.complete) allComplete = false
      }

      if (byDiscriminator.size === 0) return null

      return {
        check: value => {
          if (!isPlainObject(value)) return false
          const record = value as Record<string, unknown>
          const optionCheck = byDiscriminator.get(record[key])
          if (!optionCheck) return false
          return optionCheck(value)
        },
        complete: allComplete && byDiscriminator.size === options.length,
      }
    }
    case 'union': {
      const options = Array.isArray(schema.options) ? schema.options : []
      if (options.length === 0) return null

      const results = options
        .map((option: unknown) => compileValibotPrecheck(option))
        .filter((r: ValibotPrecheckResult | null): r is ValibotPrecheckResult => r !== null)

      if (results.length === 0) return null

      const checks = results.map((r: ValibotPrecheckResult) => r.check)
      return {
        check: value => {
          for (let index = 0; index < checks.length; index += 1) {
            if (checks[index](value)) return true
          }
          return false
        },
        complete: !hasPipe && results.length === options.length && results.every((r: ValibotPrecheckResult) => r.complete),
      }
    }
    case 'instance': {
      // Covers v.instance(SomeClass) — schema.class is the constructor
      const cls = schema.class
      if (typeof cls === 'function') {
        return {check: value => value instanceof cls, complete: !hasPipe}
      }
      return null
    }
    case 'string':
    case 'number':
    case 'boolean':
    case 'bigint':
    case 'symbol': {
      const expected = schema.type as string
      return {check: value => typeof value === expected, complete: !hasPipe}
    }
    case 'null':
      return {check: value => value === null, complete: !hasPipe}
    case 'undefined':
      return {check: value => value === undefined, complete: !hasPipe}
    case 'date':
      return {check: value => value instanceof Date, complete: !hasPipe}
    default:
      return null
  }
}

export type DiscriminatorInfo = {key: string; value: unknown}

/**
 * Attempts to extract a discriminator (a literal-typed property) from an object schema.
 * Returns the key name and literal value if found, or null.
 * Works across zod, valibot, and arktype by inspecting library-specific internals.
 */
export const extractDiscriminator = (schema: StandardSchemaV1): DiscriminatorInfo | null => {
  const s = schema as any

  // Zod / zod-mini: _def.type === 'object', shape has a literal key
  const zodDef = s?._def ?? s?.def
  if (zodDef && typeof zodDef === 'object' && zodDef.type === 'object') {
    const shape = typeof zodDef.shape === 'function' ? zodDef.shape() : zodDef.shape
    if (shape && typeof shape === 'object') {
      return findLiteralKeyInZodShape(shape)
    }
  }

  // Valibot: schema.type === 'object', entries has a literal key
  if (s?.type === 'object' && s.entries && typeof s.entries === 'object') {
    return findLiteralKeyInValibotEntries(s.entries)
  }

  // Arktype: uses .json for structural inspection
  const json = s?.json
  if (json && json.domain === 'object' && Array.isArray(json.required)) {
    return findLiteralKeyInArktypeJson(json.required)
  }

  return null
}

// Common discriminator key names, preferred in this order
const preferredKeys = ['type', 'kind', 'status', '_tag', 'tag']

const findLiteralKeyInZodShape = (shape: Record<string, any>): DiscriminatorInfo | null => {
  let fallback: DiscriminatorInfo | null = null
  for (const key of Object.keys(shape)) {
    const fieldDef = shape[key]?._def ?? shape[key]?.def
    if (fieldDef?.type === 'literal' && Array.isArray(fieldDef.values) && fieldDef.values.length === 1) {
      const info = {key, value: fieldDef.values[0]}
      if (preferredKeys.includes(key)) return info
      if (!fallback) fallback = info
    }
  }
  return fallback
}

const findLiteralKeyInValibotEntries = (entries: Record<string, any>): DiscriminatorInfo | null => {
  let fallback: DiscriminatorInfo | null = null
  for (const key of Object.keys(entries)) {
    if (entries[key]?.type === 'literal' && Object.prototype.hasOwnProperty.call(entries[key], 'literal')) {
      const info = {key, value: entries[key].literal}
      if (preferredKeys.includes(key)) return info
      if (!fallback) fallback = info
    }
  }
  return fallback
}

const findLiteralKeyInArktypeJson = (required: Array<{key: string; value: any}>): DiscriminatorInfo | null => {
  let fallback: DiscriminatorInfo | null = null
  for (let i = 0; i < required.length; i += 1) {
    const entry = required[i]
    if (entry.value && typeof entry.value === 'object' && Object.prototype.hasOwnProperty.call(entry.value, 'unit')) {
      const info = {key: entry.key, value: entry.value.unit}
      if (preferredKeys.includes(entry.key)) return info
      if (!fallback) fallback = info
    }
  }
  return fallback
}

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

export {isPlainObject}

const isFailureResult = (result: unknown): result is StandardSchemaV1.FailureResult => {
  if (!result || typeof result !== 'object') return false
  if ('issues' in result) return true
  return looksLikeStandardSchemaFailure(result)
}
