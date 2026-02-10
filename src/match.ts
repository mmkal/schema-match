import type {StandardSchemaV1} from './standard-schema/contract.js'
import {looksLikeStandardSchema} from './standard-schema/utils.js'
import {ASYNC_REQUIRED, NO_MATCH, matchSchemaAsync, matchSchemaSync, extractDiscriminator, isPlainObject} from './standard-schema/compiled.js'
import type {DiscriminatorInfo} from './standard-schema/compiled.js'
import {isPromiseLike, validateSync} from './standard-schema/validation.js'
import type {InferInput, InferOutput} from './types.js'
import {NonExhaustiveError} from './errors.js'
import type {NonExhaustiveErrorOptions} from './errors.js'

/** Resolves `Unset` to `never` for use in StandardSchema types. */
type ResolveOutput<T> = T extends typeof unset ? never : T

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
  ): ReusableMatcher<input, WithReturn<Unset, result>, InferInput<schema>>
  case<input, schema extends StandardSchemaV1, result>(
    schema: schema,
    predicate: (value: InferOutput<schema>, input: input) => unknown,
    handler: (value: InferOutput<schema>, input: input) => result
  ): ReusableMatcher<input, WithReturn<Unset, result>, InferInput<schema>>
  case<input, schemas extends readonly [StandardSchemaV1, ...StandardSchemaV1[]], result>(
    ...args: [...schemas, (value: InferOutput<schemas[number]>, input: input) => result]
  ): ReusableMatcher<input, WithReturn<Unset, result>, InferInput<schemas[number]>>
}

type MatchAsyncFactory = {
  <const input, output = Unset>(value: input): MatchExpressionAsync<input, output>
  input<input>(): ReusableMatcherAsync<input, Unset>
  output<output>(): ReusableMatcherAsync<unknown, output>
  case<input, schema extends StandardSchemaV1, result>(
    schema: schema,
    handler: (value: InferOutput<schema>, input: input) => result | Promise<result>
  ): ReusableMatcherAsync<input, WithAsyncReturn<Unset, result>, InferInput<schema>>
  case<input, schema extends StandardSchemaV1, result>(
    schema: schema,
    predicate: (value: InferOutput<schema>, input: input) => unknown | Promise<unknown>,
    handler: (value: InferOutput<schema>, input: input) => result | Promise<result>
  ): ReusableMatcherAsync<input, WithAsyncReturn<Unset, result>, InferInput<schema>>
  case<input, schemas extends readonly [StandardSchemaV1, ...StandardSchemaV1[]], result>(
    ...args: [...schemas, (value: InferOutput<schemas[number]>, input: input) => result | Promise<result>]
  ): ReusableMatcherAsync<input, WithAsyncReturn<Unset, result>, InferInput<schemas[number]>>
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

// ─── MatchExpression (sync inline) ───────────────────────────────────────────

class MatchExpression<input, output, CaseInputs = never> {
  private schemas: StandardSchemaV1[] = []

  constructor(
    private input: input,
    private matched: boolean,
    private value: output | undefined
  ) {}

  case<schema extends StandardSchemaV1, result>(
    schema: schema,
    handler: (value: InferOutput<schema>, input: input) => result
  ): MatchExpression<input, WithReturn<output, result>, CaseInputs | InferInput<schema>>
  case<schema extends StandardSchemaV1, result>(
    schema: schema,
    predicate: (value: InferOutput<schema>, input: input) => unknown,
    handler: (value: InferOutput<schema>, input: input) => result
  ): MatchExpression<input, WithReturn<output, result>, CaseInputs | InferInput<schema>>
  case<schemas extends readonly [StandardSchemaV1, ...StandardSchemaV1[]], result>(
    ...args: [...schemas, (value: InferOutput<schemas[number]>, input: input) => result]
  ): MatchExpression<input, WithReturn<output, result>, CaseInputs | InferInput<schemas[number]>>
  case(...args: any[]): MatchExpression<input, any, any> {
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
  ): MatchExpression<input, WithReturn<output, result>, CaseInputs>
  when(
    predicate: (value: input) => unknown,
    handler: (value: input, input: input) => unknown
  ): MatchExpression<input, any, CaseInputs> {
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

  /**
   * Terminates the match expression with a default behavior when no case matches.
   *
   * @overload `.default('assert')` — Throws a {@link NonExhaustiveError} if no case matched. Accepts any input.
   * @overload `.default('never')` — Throws a {@link NonExhaustiveError} if no case matched. Produces a type error if the input doesn't match the union of case input types.
   * @overload `.default('reject')` — Returns a {@link NonExhaustiveError} instance (instead of throwing) if no case matched. Accepts any input.
   * @overload `.default(handler)` — Calls the handler with the input value if no case matched.
   */
  default(
    /** Throw a {@link NonExhaustiveError} if no case matched. Accepts any input type. */
    mode: 'assert'
  ): output
  default(
    /**
     * Throw a {@link NonExhaustiveError} if no case matched.
     * Constrains the input type to the union of all case schema input types —
     * produces a compile-time error if the match input doesn't extend that union.
     */
    mode: input extends CaseInputs ? 'never' : never
  ): output
  default(
    /** Return a {@link NonExhaustiveError} instance (instead of throwing) if no case matched. */
    mode: 'reject'
  ): output | NonExhaustiveError
  default<result>(
    /** A fallback handler called with the raw input when no case matched. */
    handler: (value: input) => result
  ): WithReturn<output, result>
  default(modeOrHandler: 'assert' | 'never' | 'reject' | ((value: input) => unknown)): unknown {
    if (this.matched) return this.value

    if (typeof modeOrHandler === 'function') {
      return modeOrHandler(this.input)
    }

    if (modeOrHandler === 'reject') {
      return new NonExhaustiveError(this.input, {schemas: this.schemas})
    }

    // 'assert' and 'never' both throw at runtime
    throw new NonExhaustiveError(this.input, {schemas: this.schemas})
  }

  output<O>(): MatchExpression<input, O, CaseInputs> {
    return this as any
  }

  returnType() {
    return this
  }

  narrow() {
    return this
  }
}

// ─── MatchExpressionAsync (async inline) ─────────────────────────────────────

class MatchExpressionAsync<input, output, CaseInputs = never> {
  constructor(
    private input: input,
    private state: Promise<MatchState<output>>,
    private schemas: StandardSchemaV1[] = []
  ) {}

  case<schema extends StandardSchemaV1, result>(
    schema: schema,
    handler: (value: InferOutput<schema>, input: input) => result | Promise<result>
  ): MatchExpressionAsync<input, WithAsyncReturn<output, result>, CaseInputs | InferInput<schema>>
  case<schema extends StandardSchemaV1, result>(
    schema: schema,
    predicate: (value: InferOutput<schema>, input: input) => unknown | Promise<unknown>,
    handler: (value: InferOutput<schema>, input: input) => result | Promise<result>
  ): MatchExpressionAsync<input, WithAsyncReturn<output, result>, CaseInputs | InferInput<schema>>
  case<schemas extends readonly [StandardSchemaV1, ...StandardSchemaV1[]], result>(
    ...args: [...schemas, (value: InferOutput<schemas[number]>, input: input) => result | Promise<result>]
  ): MatchExpressionAsync<input, WithAsyncReturn<output, result>, CaseInputs | InferInput<schemas[number]>>
  case(...args: any[]): MatchExpressionAsync<input, any, any> {
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
  ): MatchExpressionAsync<input, WithAsyncReturn<output, result>, CaseInputs>
  when(
    predicate: (value: input) => unknown | Promise<unknown>,
    handler: (value: input, input: input) => unknown | Promise<unknown>
  ): MatchExpressionAsync<input, any, CaseInputs> {
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

  /**
   * Terminates the async match expression with a default behavior when no case matches.
   *
   * @overload `.default('assert')` — Throws a {@link NonExhaustiveError} if no case matched.
   * @overload `.default('never')` — Throws a {@link NonExhaustiveError} if no case matched. Type error if input doesn't match case union.
   * @overload `.default('reject')` — Resolves to a {@link NonExhaustiveError} instance if no case matched.
   * @overload `.default(handler)` — Calls the handler with the input value if no case matched.
   */
  default(
    /** Throw a {@link NonExhaustiveError} if no case matched. Accepts any input type. */
    mode: 'assert'
  ): Promise<output>
  default(
    /**
     * Throw a {@link NonExhaustiveError} if no case matched.
     * Constrains the input type to the union of all case schema input types.
     */
    mode: input extends CaseInputs ? 'never' : never
  ): Promise<output>
  default(
    /** Resolve to a {@link NonExhaustiveError} instance if no case matched. */
    mode: 'reject'
  ): Promise<output | NonExhaustiveError>
  default<result>(
    /** A fallback handler called with the raw input when no case matched. */
    handler: (value: input) => result | Promise<result>
  ): Promise<WithAsyncReturn<output, result>>
  default(modeOrHandler: 'assert' | 'never' | 'reject' | ((value: input) => unknown | Promise<unknown>)): Promise<unknown> {
    const schemas = this.schemas
    return this.state.then(async state => {
      if (state.matched) return state.value

      if (typeof modeOrHandler === 'function') {
        return await modeOrHandler(this.input)
      }

      if (modeOrHandler === 'reject') {
        return new NonExhaustiveError(this.input, {schemas})
      }

      // 'assert' and 'never' both throw at runtime
      throw new NonExhaustiveError(this.input, {schemas})
    })
  }

  output<O>(): MatchExpressionAsync<input, O, CaseInputs> {
    return this as any
  }

  returnType() {
    return this
  }

  narrow() {
    return this
  }
}

// ─── ReusableMatcher (sync reusable) ─────────────────────────────────────────

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

class ReusableMatcher<input, output, CaseInputs = never> {
  private dispatch: DispatchTable | null | undefined = undefined // undefined = not yet computed

  /**
   * Standard Schema V1 interface. The matcher itself is a valid standard-schema:
   * - `validate(value)` tries all cases in order and returns `{ value }` on match or `{ issues }` on failure.
   * - `types.input` is the union of all case schema input types (`CaseInputs`).
   * - `types.output` is the union of all case handler return types.
   */
  readonly '~standard': StandardSchemaV1.Props<CaseInputs, ResolveOutput<output>>

  constructor(
    private readonly terminal: MatchState<output>,
    private readonly clauses: Array<ReusableClause<input> | ReusableWhenClause<input>> = []
  ) {
    // Build the ~standard property in the constructor so it closes over `this`
    this['~standard'] = {
      version: 1,
      vendor: 'schematch',
      validate: (value: unknown): StandardSchemaV1.Result<ResolveOutput<output>> => {
        const state = this.exec(value as input)
        if (state.matched) {
          return {value: state.value as ResolveOutput<output>}
        }
        return this.buildFailureResult(value)
      },
    }
  }

  private getDispatch(): DispatchTable | null {
    if (this.dispatch === undefined) {
      this.dispatch = buildDispatchTable(this.clauses)
    }
    return this.dispatch
  }

  case<schema extends StandardSchemaV1, result>(
    schema: schema,
    handler: (value: InferOutput<schema>, input: input) => result
  ): ReusableMatcher<input, WithReturn<output, result>, CaseInputs | InferInput<schema>>
  case<schema extends StandardSchemaV1, result>(
    schema: schema,
    predicate: (value: InferOutput<schema>, input: input) => unknown,
    handler: (value: InferOutput<schema>, input: input) => result
  ): ReusableMatcher<input, WithReturn<output, result>, CaseInputs | InferInput<schema>>
  case<schemas extends readonly [StandardSchemaV1, ...StandardSchemaV1[]], result>(
    ...args: [...schemas, (value: InferOutput<schemas[number]>, input: input) => result]
  ): ReusableMatcher<input, WithReturn<output, result>, CaseInputs | InferInput<schemas[number]>>
  case(...args: any[]): ReusableMatcher<input, any, any> {
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
  ): ReusableMatcher<input, WithReturn<output, result>, CaseInputs> {
    return new ReusableMatcher(this.terminal, [...this.clauses, {when: predicate, handler}]) as any
  }

  output<O>(): ReusableMatcher<input, O, CaseInputs> {
    return this as any
  }

  /**
   * Terminates the reusable matcher and returns a function that executes the match.
   *
   * @overload `.default('assert')` — Returns a function that throws {@link NonExhaustiveError} on no match. Accepts `unknown` input.
   * @overload `.default('never')` — Returns a function that throws {@link NonExhaustiveError} on no match. Input type is constrained to the union of case schema input types.
   * @overload `.default('reject')` — Returns a function whose return type includes {@link NonExhaustiveError} (returned, not thrown) on no match.
   * @overload `.default(handler)` — Returns a function that calls the handler on no match.
   */
  default(
    /** Throw a {@link NonExhaustiveError} if no case matched. Accepts any input type. */
    mode: 'assert'
  ): (input: input) => output
  default(
    /**
     * Throw a {@link NonExhaustiveError} if no case matched.
     * The returned function's input type is constrained to the union of all case schema input types.
     */
    mode: 'never'
  ): (input: CaseInputs) => output
  default(
    /** Return a {@link NonExhaustiveError} instance (instead of throwing) if no case matched. */
    mode: 'reject'
  ): (input: input) => output | NonExhaustiveError
  default<result>(
    /** A fallback handler called with the raw input when no case matched. */
    handler: (value: input) => result
  ): (input: input) => WithReturn<output, result>
  default(modeOrHandler: 'assert' | 'never' | 'reject' | ((value: input) => unknown)): (input: any) => unknown {
    const allSchemas = this.clauses.flatMap(c => 'schemas' in c ? c.schemas : [])

    if (typeof modeOrHandler === 'function') {
      return (input: input) => {
        const state = this.exec(input)
        if (state.matched) return state.value
        return modeOrHandler(input)
      }
    }

    if (modeOrHandler === 'reject') {
      return (input: input) => {
        const state = this.exec(input)
        if (state.matched) return state.value
        return this.buildNonExhaustiveError(input, allSchemas)
      }
    }

    // 'assert' and 'never' both throw at runtime
    return (input: input) => {
      const state = this.exec(input)
      if (state.matched) return state.value
      throw this.buildNonExhaustiveError(input, allSchemas)
    }
  }

  private buildNonExhaustiveError(input: input, allSchemas: StandardSchemaV1[]): NonExhaustiveError {
    const dispatch = this.getDispatch()
    const errorOptions: NonExhaustiveErrorOptions = {schemas: allSchemas}
    if (dispatch) {
      const discValue = isPlainObject(input)
        ? (input as Record<string, unknown>)[dispatch.key]
        : undefined
      const candidates = isPlainObject(input) ? dispatch.table.get(discValue) : null
      const matched = candidates !== null && candidates !== undefined
      errorOptions.discriminator = {
        key: dispatch.key,
        value: discValue,
        expected: dispatch.expectedValues,
        matched,
      }
      if (matched) {
        // Discriminator matched but validation failed — narrow to just that branch's schemas
        errorOptions.schemas = candidates.flatMap(i => {
          const clause = this.clauses[i]
          return 'schemas' in clause ? clause.schemas : []
        })
      }
    }
    return new NonExhaustiveError(input, errorOptions)
  }

  /** Build a standard-schema FailureResult for use in `~standard.validate`. */
  private buildFailureResult(value: unknown): StandardSchemaV1.FailureResult {
    const allSchemas = this.clauses.flatMap(c => 'schemas' in c ? c.schemas : [])
    const issues: StandardSchemaV1.Issue[] = []

    for (let i = 0; i < allSchemas.length; i += 1) {
      try {
        const result = validateSync(allSchemas[i], value)
        if ('issues' in result && result.issues) {
          for (const issue of result.issues) {
            issues.push({
              message: `Case ${i + 1}: ${issue.message}`,
              path: issue.path,
            })
          }
        }
      } catch {
        // async schema or validation threw — skip
      }
    }

    if (issues.length === 0) {
      let displayedValue: string
      try { displayedValue = JSON.stringify(value) } catch { displayedValue = String(value) }
      issues.push({message: `No schema matches value ${displayedValue}`})
    }

    return {issues}
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

// ─── ReusableMatcherAsync (async reusable) ───────────────────────────────────

type ReusableClauseAsync<input> = {
  schemas: StandardSchemaV1[]
  predicate?: (value: unknown, input: input) => unknown | Promise<unknown>
  handler: (value: unknown, input: input) => unknown | Promise<unknown>
}

type ReusableWhenClauseAsync<input> = {
  when: (input: input) => unknown | Promise<unknown>
  handler: (value: input, input: input) => unknown | Promise<unknown>
}

class ReusableMatcherAsync<input, output, CaseInputs = never> {
  private dispatch: DispatchTable | null | undefined = undefined

  /**
   * Standard Schema V1 interface (async). The matcher itself is a valid standard-schema:
   * - `validate(value)` tries all cases in order and returns `Promise<{ value }>` on match or `Promise<{ issues }>` on failure.
   * - `types.input` is the union of all case schema input types (`CaseInputs`).
   * - `types.output` is the union of all case handler return types.
   */
  readonly '~standard': StandardSchemaV1.Props<CaseInputs, ResolveOutput<output>>

  constructor(
    private readonly terminal: Promise<MatchState<output>>,
    private readonly clauses: Array<ReusableClauseAsync<input> | ReusableWhenClauseAsync<input>> = []
  ) {
    this['~standard'] = {
      version: 1,
      vendor: 'schematch',
      validate: async (value: unknown): Promise<StandardSchemaV1.Result<ResolveOutput<output>>> => {
        const state = await this.exec(value as input)
        if (state.matched) {
          return {value: state.value as ResolveOutput<output>}
        }
        return this.buildFailureResult(value)
      },
    }
  }

  private getDispatch(): DispatchTable | null {
    if (this.dispatch === undefined) {
      this.dispatch = buildDispatchTable(this.clauses as Array<ReusableClause<input> | ReusableWhenClause<input>>)
    }
    return this.dispatch
  }

  case<schema extends StandardSchemaV1, result>(
    schema: schema,
    handler: (value: InferOutput<schema>, input: input) => result | Promise<result>
  ): ReusableMatcherAsync<input, WithAsyncReturn<output, result>, CaseInputs | InferInput<schema>>
  case<schema extends StandardSchemaV1, result>(
    schema: schema,
    predicate: (value: InferOutput<schema>, input: input) => unknown | Promise<unknown>,
    handler: (value: InferOutput<schema>, input: input) => result | Promise<result>
  ): ReusableMatcherAsync<input, WithAsyncReturn<output, result>, CaseInputs | InferInput<schema>>
  case<schemas extends readonly [StandardSchemaV1, ...StandardSchemaV1[]], result>(
    ...args: [...schemas, (value: InferOutput<schemas[number]>, input: input) => result | Promise<result>]
  ): ReusableMatcherAsync<input, WithAsyncReturn<output, result>, CaseInputs | InferInput<schemas[number]>>
  case(...args: any[]): ReusableMatcherAsync<input, any, any> {
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
  ): ReusableMatcherAsync<input, WithAsyncReturn<output, result>, CaseInputs> {
    return new ReusableMatcherAsync(this.terminal, [...this.clauses, {when: predicate, handler}]) as any
  }

  output<O>(): ReusableMatcherAsync<input, O, CaseInputs> {
    return this as any
  }

  /**
   * Terminates the async reusable matcher and returns a function that executes the match.
   *
   * @overload `.default('assert')` — Returns an async function that throws {@link NonExhaustiveError} on no match.
   * @overload `.default('never')` — Returns an async function that throws on no match, with input constrained to case union.
   * @overload `.default('reject')` — Returns an async function that resolves to {@link NonExhaustiveError} on no match.
   * @overload `.default(handler)` — Returns an async function that calls the handler on no match.
   */
  default(
    /** Throw a {@link NonExhaustiveError} if no case matched. Accepts any input type. */
    mode: 'assert'
  ): (input: input) => Promise<output>
  default(
    /**
     * Throw a {@link NonExhaustiveError} if no case matched.
     * The returned function's input type is constrained to the union of all case schema input types.
     */
    mode: 'never'
  ): (input: CaseInputs) => Promise<output>
  default(
    /** Resolve to a {@link NonExhaustiveError} instance if no case matched. */
    mode: 'reject'
  ): (input: input) => Promise<output | NonExhaustiveError>
  default<result>(
    /** A fallback handler called with the raw input when no case matched. */
    handler: (value: input) => result | Promise<result>
  ): (input: input) => Promise<WithAsyncReturn<output, result>>
  default(modeOrHandler: 'assert' | 'never' | 'reject' | ((value: input) => unknown | Promise<unknown>)): (input: any) => Promise<unknown> {
    const allSchemas = this.clauses.flatMap(c => 'schemas' in c ? c.schemas : [])

    if (typeof modeOrHandler === 'function') {
      return async (input: input) => {
        const state = await this.exec(input)
        if (state.matched) return state.value
        return await modeOrHandler(input)
      }
    }

    if (modeOrHandler === 'reject') {
      return async (input: input) => {
        const state = await this.exec(input)
        if (state.matched) return state.value
        return this.buildNonExhaustiveError(input, allSchemas)
      }
    }

    // 'assert' and 'never' both throw at runtime
    return async (input: input) => {
      const state = await this.exec(input)
      if (state.matched) return state.value
      throw this.buildNonExhaustiveError(input, allSchemas)
    }
  }

  private buildNonExhaustiveError(input: input, allSchemas: StandardSchemaV1[]): NonExhaustiveError {
    const dispatch = this.getDispatch()
    const errorOptions: NonExhaustiveErrorOptions = {schemas: allSchemas}
    if (dispatch) {
      const discValue = isPlainObject(input)
        ? (input as Record<string, unknown>)[dispatch.key]
        : undefined
      const candidates = isPlainObject(input) ? dispatch.table.get(discValue) : null
      const matched = candidates !== null && candidates !== undefined
      errorOptions.discriminator = {
        key: dispatch.key,
        value: discValue,
        expected: dispatch.expectedValues,
        matched,
      }
      if (matched) {
        errorOptions.schemas = candidates.flatMap(i => {
          const clause = this.clauses[i]
          return 'schemas' in clause ? clause.schemas : []
        })
      }
    }
    return new NonExhaustiveError(input, errorOptions)
  }

  /** Build a standard-schema FailureResult for use in `~standard.validate`. */
  private buildFailureResult(value: unknown): StandardSchemaV1.FailureResult {
    const allSchemas = this.clauses.flatMap(c => 'schemas' in c ? c.schemas : [])
    const issues: StandardSchemaV1.Issue[] = []

    for (let i = 0; i < allSchemas.length; i += 1) {
      try {
        const result = validateSync(allSchemas[i], value)
        if ('issues' in result && result.issues) {
          for (const issue of result.issues) {
            issues.push({
              message: `Case ${i + 1}: ${issue.message}`,
              path: issue.path,
            })
          }
        }
      } catch {
        // async schema or validation threw — skip
      }
    }

    if (issues.length === 0) {
      let displayedValue: string
      try { displayedValue = JSON.stringify(value) } catch { displayedValue = String(value) }
      issues.push({message: `No schema matches value ${displayedValue}`})
    }

    return {issues}
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
