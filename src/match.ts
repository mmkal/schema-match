import type {StandardSchemaV1} from './standard-schema/contract.js'
import {looksLikeStandardSchema} from './standard-schema/utils.js'
import {ASYNC_REQUIRED, NO_MATCH, matchSchemaAsync, matchSchemaSync, extractDiscriminator, isPlainObject} from './standard-schema/compiled.js'
import type {DiscriminatorInfo} from './standard-schema/compiled.js'
import {isPromiseLike} from './standard-schema/validation.js'
import type {InferOutput} from './types.js'
import {NonExhaustiveError} from './errors.js'
import type {NonExhaustiveErrorOptions} from './errors.js'

type MatchState<output> =
  | {matched: true; value: output}
  | {matched: false; value: undefined}

const unmatched: MatchState<never> = {
  matched: false,
  value: undefined,
}

const unset = Symbol('unset')
type Unset = typeof unset

type WithReturn<current, next> = current extends Unset ? next : current | next
type WithAsyncReturn<current, next> = current extends Unset ? Awaited<next> : current | Awaited<next>

type MatchFactory = {
  <const input, output = Unset>(value: input): MatchExpression<input, output>
  input<input>(): ReusableMatcher<input, Unset>
  output<output>(): ReusableMatcher<unknown, output>
  case<input, schema extends StandardSchemaV1, result>(
    schema: schema,
    handler: (value: InferOutput<schema>, input: input) => result
  ): ReusableMatcher<input, WithReturn<Unset, result>>
  case<input, schema extends StandardSchemaV1, result>(
    schema: schema,
    predicate: (value: InferOutput<schema>, input: input) => unknown,
    handler: (value: InferOutput<schema>, input: input) => result
  ): ReusableMatcher<input, WithReturn<Unset, result>>
  case<input, schemas extends readonly [StandardSchemaV1, ...StandardSchemaV1[]], result>(
    ...args: [...schemas, (value: InferOutput<schemas[number]>, input: input) => result]
  ): ReusableMatcher<input, WithReturn<Unset, result>>
}

type MatchAsyncFactory = {
  <const input, output = Unset>(value: input): MatchExpressionAsync<input, output>
  input<input>(): ReusableMatcherAsync<input, Unset>
  output<output>(): ReusableMatcherAsync<unknown, output>
  case<input, schema extends StandardSchemaV1, result>(
    schema: schema,
    handler: (value: InferOutput<schema>, input: input) => result | Promise<result>
  ): ReusableMatcherAsync<input, WithAsyncReturn<Unset, result>>
  case<input, schema extends StandardSchemaV1, result>(
    schema: schema,
    predicate: (value: InferOutput<schema>, input: input) => unknown | Promise<unknown>,
    handler: (value: InferOutput<schema>, input: input) => result | Promise<result>
  ): ReusableMatcherAsync<input, WithAsyncReturn<Unset, result>>
  case<input, schemas extends readonly [StandardSchemaV1, ...StandardSchemaV1[]], result>(
    ...args: [...schemas, (value: InferOutput<schemas[number]>, input: input) => result | Promise<result>]
  ): ReusableMatcherAsync<input, WithAsyncReturn<Unset, result>>
}

export const match = Object.assign(
  function match<const input, output = Unset>(value: input): MatchExpression<input, output> {
    return new MatchExpression(value, false, undefined) as MatchExpression<input, output>
  },
  {
    input() {
      return new ReusableMatcher<unknown, Unset>(unmatched as MatchState<Unset>)
    },
    output() {
      return new ReusableMatcher<unknown, Unset>(unmatched as MatchState<Unset>)
    },
    'case'(...args: any[]) {
      return (new ReusableMatcher<unknown, Unset>(unmatched as MatchState<Unset>) as any).case(...args)
    },
  }
) as MatchFactory

export const matchAsync = Object.assign(
  function matchAsync<const input, output = Unset>(value: input): MatchExpressionAsync<input, output> {
    return new MatchExpressionAsync(value, Promise.resolve(unmatched)) as MatchExpressionAsync<input, output>
  },
  {
    input() {
      return new ReusableMatcherAsync<unknown, Unset>(
        Promise.resolve(unmatched as MatchState<Unset>)
      )
    },
    output() {
      return new ReusableMatcherAsync<unknown, Unset>(
        Promise.resolve(unmatched as MatchState<Unset>)
      )
    },
    'case'(...args: any[]) {
      return (new ReusableMatcherAsync<unknown, Unset>(
        Promise.resolve(unmatched as MatchState<Unset>)
      ) as any).case(...args)
    },
  }
) as MatchAsyncFactory

class MatchExpression<input, output> {
  private schemas: StandardSchemaV1[] = []

  constructor(
    private input: input,
    private matched: boolean,
    private value: output | undefined
  ) {}

  case<schema extends StandardSchemaV1, result>(
    schema: schema,
    handler: (value: InferOutput<schema>, input: input) => result
  ): MatchExpression<input, WithReturn<output, result>>
  case<schema extends StandardSchemaV1, result>(
    schema: schema,
    predicate: (value: InferOutput<schema>, input: input) => unknown,
    handler: (value: InferOutput<schema>, input: input) => result
  ): MatchExpression<input, WithReturn<output, result>>
  case<schemas extends readonly [StandardSchemaV1, ...StandardSchemaV1[]], result>(
    ...args: [...schemas, (value: InferOutput<schemas[number]>, input: input) => result]
  ): MatchExpression<input, WithReturn<output, result>>
  case(...args: any[]): MatchExpression<input, any> {
    if (this.matched) return this

    const length = args.length
    const handler = args[length - 1] as (value: unknown, input: input) => output

    if (length === 2) {
      const schema = args[0] as StandardSchemaV1
      this.schemas.push(schema)
      const result = matchSchemaSync(schema, this.input)
      if (result === ASYNC_REQUIRED) {
        throw new Error('Schema validation returned a Promise. Use matchAsync instead.')
      }
      if (result !== NO_MATCH) {
        this.matched = true
        this.value = handler(result, this.input)
      }
      return this
    }

    const hasGuard = length === 3 && typeof args[1] === 'function' && !looksLikeStandardSchema(args[1])
    const predicate = hasGuard ? (args[1] as (value: unknown, input: input) => unknown) : undefined
    const schemaEnd = hasGuard ? 1 : length - 1

    for (let index = 0; index < schemaEnd; index += 1) {
      const schema = args[index] as StandardSchemaV1
      this.schemas.push(schema)
      const result = matchSchemaSync(schema, this.input)
      if (result === NO_MATCH) continue
      if (result === ASYNC_REQUIRED) {
        throw new Error('Schema validation returned a Promise. Use matchAsync instead.')
      }

      if (predicate) {
        const guardResult = predicate(result, this.input)
        if (isPromiseLike(guardResult)) {
          throw new Error('Guard returned a Promise. Use matchAsync instead.')
        }
        if (!guardResult) continue
      }

      this.matched = true
      this.value = handler(result, this.input)

      break
    }

    return this
  }

  when<result>(
    predicate: (value: input) => unknown,
    handler: (value: input, input: input) => result
  ): MatchExpression<input, WithReturn<output, result>>
  when(
    predicate: (value: input) => unknown,
    handler: (value: input, input: input) => unknown
  ): MatchExpression<input, any> {
    if (this.matched) return this

    const result = predicate(this.input)
    if (isPromiseLike(result)) {
      throw new Error('Predicate returned a Promise. Use matchAsync instead.')
    }

    if (result) {
      this.matched = true
      this.value = handler(this.input, this.input) as output
    }

    return this
  }

  otherwise<result>(handler: (value: input) => result): WithReturn<output, result> {
    if (this.matched) return this.value as WithReturn<output, result>
    return handler(this.input) as WithReturn<output, result>
  }

  exhaustive<result = never>(
    unexpectedValueHandler?: (value: input) => result
  ): WithReturn<output, result> {
    if (this.matched) return this.value as WithReturn<output, result>
    if (unexpectedValueHandler) return unexpectedValueHandler(this.input) as WithReturn<output, result>
    throw new NonExhaustiveError(this.input, {schemas: this.schemas})
  }

  run(): output {
    return this.exhaustive()
  }

  output<O>(): MatchExpression<input, O> {
    return this as any
  }

  returnType() {
    return this
  }

  narrow() {
    return this
  }
}

class MatchExpressionAsync<input, output> {
  constructor(
    private input: input,
    private state: Promise<MatchState<output>>,
    private schemas: StandardSchemaV1[] = []
  ) {}

  case<schema extends StandardSchemaV1, result>(
    schema: schema,
    handler: (value: InferOutput<schema>, input: input) => result | Promise<result>
  ): MatchExpressionAsync<input, WithAsyncReturn<output, result>>
  case<schema extends StandardSchemaV1, result>(
    schema: schema,
    predicate: (value: InferOutput<schema>, input: input) => unknown | Promise<unknown>,
    handler: (value: InferOutput<schema>, input: input) => result | Promise<result>
  ): MatchExpressionAsync<input, WithAsyncReturn<output, result>>
  case<schemas extends readonly [StandardSchemaV1, ...StandardSchemaV1[]], result>(
    ...args: [...schemas, (value: InferOutput<schemas[number]>, input: input) => result | Promise<result>]
  ): MatchExpressionAsync<input, WithAsyncReturn<output, result>>
  case(...args: any[]): MatchExpressionAsync<input, any> {
    const length = args.length
    const handler = args[length - 1] as (value: unknown, input: input) => unknown | Promise<unknown>

    if (length === 2) {
      const schema = args[0] as StandardSchemaV1
      const nextSchemas = [...this.schemas, schema]
      const nextState = this.state.then(async state => {
        if (state.matched) return state

        const result = await matchSchemaAsync(schema, this.input)
        if (result === NO_MATCH) return unmatched

        return {
          matched: true as const,
          value: await handler(result, this.input),
        }
      })

      return new MatchExpressionAsync(this.input, nextState, nextSchemas)
    }

    const hasGuard = length === 3 && typeof args[1] === 'function' && !looksLikeStandardSchema(args[1])
    const predicate = hasGuard ? (args[1] as (value: unknown, input: input) => unknown | Promise<unknown>) : undefined
    const schemaEnd = hasGuard ? 1 : length - 1

    const caseSchemas = args.slice(0, schemaEnd) as StandardSchemaV1[]
    const nextSchemas = [...this.schemas, ...caseSchemas]

    const nextState = this.state.then(async state => {
      if (state.matched) return state

      for (let index = 0; index < schemaEnd; index += 1) {
        const result = await matchSchemaAsync(caseSchemas[index], this.input)
        if (result === NO_MATCH) continue

        if (predicate) {
          const guardResult = await predicate(result, this.input)
          if (!guardResult) continue
        }

        return {
          matched: true as const,
          value: await handler(result, this.input),
        }
      }

      return unmatched
    })

    return new MatchExpressionAsync(this.input, nextState, nextSchemas)
  }

  when<result>(
    predicate: (value: input) => unknown | Promise<unknown>,
    handler: (value: input, input: input) => result | Promise<result>
  ): MatchExpressionAsync<input, WithAsyncReturn<output, result>>
  when(
    predicate: (value: input) => unknown | Promise<unknown>,
    handler: (value: input, input: input) => unknown | Promise<unknown>
  ): MatchExpressionAsync<input, any> {
    const nextState = this.state.then(async state => {
      if (state.matched) return state

      const result = await predicate(this.input)
      if (!result) return unmatched

      return {
        matched: true as const,
        value: await handler(this.input, this.input),
      }
    })

    return new MatchExpressionAsync(this.input, nextState)
  }

  otherwise<result>(
    handler: (value: input) => result | Promise<result>
  ): Promise<WithAsyncReturn<output, result>> {
    return this.state.then(async state => {
      if (state.matched) return state.value as WithAsyncReturn<output, result>
      return (await handler(this.input)) as WithAsyncReturn<output, result>
    })
  }

  exhaustive<result = never>(
    unexpectedValueHandler?: (value: input) => result | Promise<result>
  ): Promise<WithAsyncReturn<output, result>> {
    const schemas = this.schemas
    return this.state.then(async state => {
      if (state.matched) return state.value as WithAsyncReturn<output, result>
      if (unexpectedValueHandler) return (await unexpectedValueHandler(this.input)) as WithAsyncReturn<output, result>
      throw new NonExhaustiveError(this.input, {schemas})
    })
  }

  run(): Promise<output> {
    return this.exhaustive()
  }

  output<O>(): MatchExpressionAsync<input, O> {
    return this as any
  }

  returnType() {
    return this
  }

  narrow() {
    return this
  }
}

type ReusableClause<input> = {
  schemas: StandardSchemaV1[]
  predicate?: (value: unknown, input: input) => unknown
  handler: (value: unknown, input: input) => unknown
}

type ReusableWhenClause<input> = {
  when: (input: input) => unknown
  handler: (value: input, input: input) => unknown
}

type DispatchTable = {
  key: string
  /** Maps discriminator value → array of clause indices to try */
  table: Map<unknown, number[]>
  /** Clause indices that could not be indexed (e.g. .when() clauses, non-object schemas) */
  fallback: number[]
  /** Same as fallback but as a Set for O(1) lookup during dispatch */
  fallbackSet: Set<number>
  /** All expected discriminator values (for error reporting) */
  expectedValues: unknown[]
}

/**
 * Inspects all clauses to find a common discriminator key across object schemas.
 * If found, builds a dispatch table for O(1) branch selection.
 */
function buildDispatchTable<input>(
  clauses: Array<ReusableClause<input> | ReusableWhenClause<input>>
): DispatchTable | null {
  if (clauses.length < 2) return null

  const discriminators: Array<{clauseIndex: number; info: DiscriminatorInfo} | null> = []
  const fallbackIndices: number[] = []
  let commonKey: string | null = null
  let hasAnyDiscriminator = false

  for (let i = 0; i < clauses.length; i += 1) {
    const clause = clauses[i]

    // .when() clauses always go to fallback
    if ('when' in clause) {
      discriminators.push(null)
      fallbackIndices.push(i)
      continue
    }

    // Try to extract discriminator from each schema in the clause
    let found: DiscriminatorInfo | null = null
    for (let j = 0; j < clause.schemas.length; j += 1) {
      const info = extractDiscriminator(clause.schemas[j])
      if (info) {
        found = info
        break
      }
    }

    if (found) {
      hasAnyDiscriminator = true
      // Check that all discriminated clauses share the same key
      if (commonKey === null) {
        commonKey = found.key
      } else if (commonKey !== found.key) {
        // Different discriminator keys across clauses — can't build a dispatch table
        return null
      }
      discriminators.push({clauseIndex: i, info: found})
    } else {
      discriminators.push(null)
      fallbackIndices.push(i)
    }
  }

  if (!hasAnyDiscriminator || commonKey === null) return null

  // Build the dispatch table
  const table = new Map<unknown, number[]>()
  const expectedValues: unknown[] = []

  for (let i = 0; i < discriminators.length; i += 1) {
    const entry = discriminators[i]
    if (!entry) continue

    const existing = table.get(entry.info.value)
    if (existing) {
      existing.push(entry.clauseIndex)
    } else {
      table.set(entry.info.value, [entry.clauseIndex])
      expectedValues.push(entry.info.value)
    }
  }

  return {key: commonKey, table, fallback: fallbackIndices, fallbackSet: new Set(fallbackIndices), expectedValues}
}

class ReusableMatcher<input, output> {
  private dispatch: DispatchTable | null | undefined = undefined // undefined = not yet computed

  constructor(
    private readonly terminal: MatchState<output>,
    private readonly clauses: Array<ReusableClause<input> | ReusableWhenClause<input>> = []
  ) {}

  private getDispatch(): DispatchTable | null {
    if (this.dispatch === undefined) {
      this.dispatch = buildDispatchTable(this.clauses)
    }
    return this.dispatch
  }

  case<schema extends StandardSchemaV1, result>(
    schema: schema,
    handler: (value: InferOutput<schema>, input: input) => result
  ): ReusableMatcher<input, WithReturn<output, result>>
  case<schema extends StandardSchemaV1, result>(
    schema: schema,
    predicate: (value: InferOutput<schema>, input: input) => unknown,
    handler: (value: InferOutput<schema>, input: input) => result
  ): ReusableMatcher<input, WithReturn<output, result>>
  case<schemas extends readonly [StandardSchemaV1, ...StandardSchemaV1[]], result>(
    ...args: [...schemas, (value: InferOutput<schemas[number]>, input: input) => result]
  ): ReusableMatcher<input, WithReturn<output, result>>
  case(...args: any[]): ReusableMatcher<input, any> {
    const length = args.length
    const handler = args[length - 1] as (value: unknown, input: input) => unknown
    const hasGuard = length === 3 && typeof args[1] === 'function' && !looksLikeStandardSchema(args[1])
    const predicate = hasGuard ? (args[1] as (value: unknown, input: input) => unknown) : undefined
    const schemaEnd = hasGuard ? 1 : length - 1
    const schemas = args.slice(0, schemaEnd) as StandardSchemaV1[]

    return new ReusableMatcher(this.terminal, [...this.clauses, {schemas, predicate, handler}])
  }

  when<result>(
    predicate: (value: input) => unknown,
    handler: (value: input, input: input) => result
  ): ReusableMatcher<input, WithReturn<output, result>> {
    return new ReusableMatcher(this.terminal, [...this.clauses, {when: predicate, handler}]) as any
  }

  output<O>(): ReusableMatcher<input, O> {
    return this as any
  }

  otherwise<result>(handler: (value: input) => result): (input: input) => WithReturn<output, result> {
    return input => {
      const state = this.exec(input)
      if (state.matched) return state.value as WithReturn<output, result>
      return handler(input) as WithReturn<output, result>
    }
  }

  exhaustive<result = never>(
    unexpectedValueHandler?: (value: input) => result
  ): (input: input) => WithReturn<output, result> {
    const allSchemas = this.clauses.flatMap(c => 'schemas' in c ? c.schemas : [])
    return input => {
      const state = this.exec(input)
      if (state.matched) return state.value as WithReturn<output, result>
      if (unexpectedValueHandler) return unexpectedValueHandler(input) as WithReturn<output, result>

      const dispatch = this.getDispatch()
      const errorOptions: NonExhaustiveErrorOptions = {schemas: allSchemas}
      if (dispatch) {
        const discValue = isPlainObject(input)
          ? (input as Record<string, unknown>)[dispatch.key]
          : undefined
        errorOptions.discriminator = {
          key: dispatch.key,
          value: discValue,
          expected: dispatch.expectedValues,
        }
        // For re-validation, only include schemas from the matching discriminator branch
        const candidates = isPlainObject(input) ? dispatch.table.get(discValue) : null
        if (candidates) {
          errorOptions.schemas = candidates.flatMap(i => {
            const clause = this.clauses[i]
            return 'schemas' in clause ? clause.schemas : []
          })
        }
      }
      throw new NonExhaustiveError(input, errorOptions)
    }
  }

  private execClause(clause: ReusableClause<input> | ReusableWhenClause<input>, input: input): MatchState<output> | null {
    if ('when' in clause) {
      const predicateResult = clause.when(input)
      if (isPromiseLike(predicateResult)) {
        throw new Error('Predicate returned a Promise. Use matchAsync.case(...) instead.')
      }
      if (!predicateResult) return null
      return {matched: true, value: clause.handler(input, input) as output}
    }

    for (let j = 0; j < clause.schemas.length; j += 1) {
      const result = matchSchemaSync(clause.schemas[j], input)
      if (result === NO_MATCH) continue
      if (result === ASYNC_REQUIRED) {
        throw new Error('Schema validation returned a Promise. Use matchAsync.case(...) instead.')
      }

      if (clause.predicate) {
        const guardResult = clause.predicate(result, input)
        if (isPromiseLike(guardResult)) {
          throw new Error('Guard returned a Promise. Use matchAsync.case(...) instead.')
        }
        if (!guardResult) continue
      }

      return {matched: true, value: clause.handler(result, input) as output}
    }

    return null
  }

  private exec(input: input): MatchState<output> {
    const dispatch = this.getDispatch()

    if (dispatch && isPlainObject(input)) {
      const discriminatorValue = (input as Record<string, unknown>)[dispatch.key]
      const candidates = dispatch.table.get(discriminatorValue)
      const candidateSet = candidates ? new Set(candidates) : null

      // Iterate in original clause order, but skip dispatched clauses whose
      // discriminator value doesn't match. Fallback clauses and candidates
      // are always tried, preserving first-match-wins semantics.
      for (let i = 0; i < this.clauses.length; i += 1) {
        if (!candidateSet?.has(i) && !dispatch.fallbackSet.has(i)) continue
        const result = this.execClause(this.clauses[i], input)
        if (result) return result
      }

      return this.terminal
    }

    // No dispatch table or non-object input: linear scan
    for (let i = 0; i < this.clauses.length; i += 1) {
      const result = this.execClause(this.clauses[i], input)
      if (result) return result
    }

    return this.terminal
  }
}

type ReusableClauseAsync<input> = {
  schemas: StandardSchemaV1[]
  predicate?: (value: unknown, input: input) => unknown | Promise<unknown>
  handler: (value: unknown, input: input) => unknown | Promise<unknown>
}

type ReusableWhenClauseAsync<input> = {
  when: (input: input) => unknown | Promise<unknown>
  handler: (value: input, input: input) => unknown | Promise<unknown>
}

class ReusableMatcherAsync<input, output> {
  private dispatch: DispatchTable | null | undefined = undefined

  constructor(
    private readonly terminal: Promise<MatchState<output>>,
    private readonly clauses: Array<ReusableClauseAsync<input> | ReusableWhenClauseAsync<input>> = []
  ) {}

  private getDispatch(): DispatchTable | null {
    if (this.dispatch === undefined) {
      this.dispatch = buildDispatchTable(this.clauses as Array<ReusableClause<input> | ReusableWhenClause<input>>)
    }
    return this.dispatch
  }

  case<schema extends StandardSchemaV1, result>(
    schema: schema,
    handler: (value: InferOutput<schema>, input: input) => result | Promise<result>
  ): ReusableMatcherAsync<input, WithAsyncReturn<output, result>>
  case<schema extends StandardSchemaV1, result>(
    schema: schema,
    predicate: (value: InferOutput<schema>, input: input) => unknown | Promise<unknown>,
    handler: (value: InferOutput<schema>, input: input) => result | Promise<result>
  ): ReusableMatcherAsync<input, WithAsyncReturn<output, result>>
  case<schemas extends readonly [StandardSchemaV1, ...StandardSchemaV1[]], result>(
    ...args: [...schemas, (value: InferOutput<schemas[number]>, input: input) => result | Promise<result>]
  ): ReusableMatcherAsync<input, WithAsyncReturn<output, result>>
  case(...args: any[]): ReusableMatcherAsync<input, any> {
    const length = args.length
    const handler = args[length - 1] as (value: unknown, input: input) => unknown | Promise<unknown>
    const hasGuard = length === 3 && typeof args[1] === 'function' && !looksLikeStandardSchema(args[1])
    const predicate = hasGuard ? (args[1] as (value: unknown, input: input) => unknown | Promise<unknown>) : undefined
    const schemaEnd = hasGuard ? 1 : length - 1
    const schemas = args.slice(0, schemaEnd) as StandardSchemaV1[]

    return new ReusableMatcherAsync(this.terminal, [...this.clauses, {schemas, predicate, handler}])
  }

  when<result>(
    predicate: (value: input) => unknown | Promise<unknown>,
    handler: (value: input, input: input) => result | Promise<result>
  ): ReusableMatcherAsync<input, WithAsyncReturn<output, result>> {
    return new ReusableMatcherAsync(this.terminal, [...this.clauses, {when: predicate, handler}]) as any
  }

  output<O>(): ReusableMatcherAsync<input, O> {
    return this as any
  }

  otherwise<result>(
    handler: (value: input) => result | Promise<result>
  ): (input: input) => Promise<WithAsyncReturn<output, result>> {
    return async input => {
      const state = await this.exec(input)
      if (state.matched) return state.value as WithAsyncReturn<output, result>
      return (await handler(input)) as WithAsyncReturn<output, result>
    }
  }

  exhaustive<result = never>(
    unexpectedValueHandler?: (value: input) => result | Promise<result>
  ): (input: input) => Promise<WithAsyncReturn<output, result>> {
    const allSchemas = this.clauses.flatMap(c => 'schemas' in c ? c.schemas : [])
    return async input => {
      const state = await this.exec(input)
      if (state.matched) return state.value as WithAsyncReturn<output, result>
      if (unexpectedValueHandler) return (await unexpectedValueHandler(input)) as WithAsyncReturn<output, result>

      const dispatch = this.getDispatch()
      const errorOptions: NonExhaustiveErrorOptions = {schemas: allSchemas}
      if (dispatch) {
        const discValue = isPlainObject(input)
          ? (input as Record<string, unknown>)[dispatch.key]
          : undefined
        errorOptions.discriminator = {
          key: dispatch.key,
          value: discValue,
          expected: dispatch.expectedValues,
        }
        const candidates = isPlainObject(input) ? dispatch.table.get(discValue) : null
        if (candidates) {
          errorOptions.schemas = candidates.flatMap(i => {
            const clause = this.clauses[i]
            return 'schemas' in clause ? clause.schemas : []
          })
        }
      }
      throw new NonExhaustiveError(input, errorOptions)
    }
  }

  private async execClause(
    clause: ReusableClauseAsync<input> | ReusableWhenClauseAsync<input>,
    input: input
  ): Promise<MatchState<output> | null> {
    if ('when' in clause) {
      if (!(await clause.when(input))) return null
      return {matched: true, value: await clause.handler(input, input) as output}
    }

    for (let j = 0; j < clause.schemas.length; j += 1) {
      const result = await matchSchemaAsync(clause.schemas[j], input)
      if (result === NO_MATCH) continue

      if (clause.predicate && !(await clause.predicate(result, input))) continue

      return {matched: true, value: await clause.handler(result, input) as output}
    }

    return null
  }

  private async exec(input: input): Promise<MatchState<output>> {
    const dispatch = this.getDispatch()

    if (dispatch && isPlainObject(input)) {
      const discriminatorValue = (input as Record<string, unknown>)[dispatch.key]
      const candidates = dispatch.table.get(discriminatorValue)
      const candidateSet = candidates ? new Set(candidates) : null

      for (let i = 0; i < this.clauses.length; i += 1) {
        if (!candidateSet?.has(i) && !dispatch.fallbackSet.has(i)) continue
        const result = await this.execClause(this.clauses[i], input)
        if (result) return result
      }

      return await this.terminal
    }

    for (let i = 0; i < this.clauses.length; i += 1) {
      const result = await this.execClause(this.clauses[i], input)
      if (result) return result
    }

    return await this.terminal
  }
}

