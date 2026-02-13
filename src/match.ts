import type {StandardSchemaV1} from './standard-schema/contract.js'
import {looksLikeStandardSchema} from './standard-schema/utils.js'
import {ASYNC_REQUIRED, NO_MATCH, matchSchemaAsync, matchSchemaSync, extractDiscriminator, isPlainObject} from './standard-schema/compiled.js'
import type {DiscriminatorInfo} from './standard-schema/compiled.js'
import {isPromiseLike, validateSync} from './standard-schema/validation.js'
import type {InferInput, InferOutput} from './types.js'
import {MatchError} from './errors.js'
import type {MatchErrorOptions} from './errors.js'

/** Resolves `Unset` to `never` for use in StandardSchema types. */
type ResolveOutput<T> = T extends typeof unset ? never : T

/**
 * Checks if two types are strictly equal using the TypeScript internal identical-to operator.
 * @see https://github.com/microsoft/TypeScript/issues/55188#issuecomment-1656328122
 */
type IsNever<T> = [T] extends [never] ? true : false
type StrictEqual<L, R> =
  (<T>() => T extends (L & T) | T ? true : false) extends <T>() => T extends (R & T) | T ? true : false
    ? IsNever<L> extends IsNever<R>
      ? true
      : false
    : false

/** Detects whether `T` is a union type (e.g. `A | B`) vs a single type. */
type IsUnion<T, U = T> = T extends unknown ? ([U] extends [T] ? false : true) : false

/**
 * When a schema is a "pure validator" (input type === output type, i.e. no transformation)
 * and the input is a union type, use `Extract<input, output>` to narrow the input type and
 * preserve extra properties that weren't specified in the schema.
 *
 * This enables discriminated union narrowing: matching `OpencodeEvent` against
 * `z.object({type: z.literal('session.status')})` gives the handler the full
 * `{type: 'session.status', sessionId: string}` member, not just `{type: 'session.status'}`.
 *
 * Falls back to `InferOutput<schema>` when:
 * - The schema transforms (input !== output), or
 * - The input is not a union (no narrowing benefit), or
 * - `Extract` produces `never` (schema output doesn't overlap with input)
 */
type NarrowedOutput<input, schema extends StandardSchemaV1> =
  StrictEqual<InferInput<schema>, InferOutput<schema>> extends true
    ? IsUnion<input> extends true
      ? [Extract<input, InferOutput<schema>>] extends [never]
        ? InferOutput<schema>
        : Extract<input, InferOutput<schema>>
      : InferOutput<schema>
    : InferOutput<schema>

type AtCaseValues<input, key extends PropertyKey> =
  input extends unknown
    ? key extends keyof input
      ? input[key]
      : never
    : never

type AtCaseInput<input, key extends PropertyKey, value> = Extract<input, Record<key, value>>

type DefaultContext = {
  readonly error: MatchError
}

type DefaultAsyncContext = {
  readonly error: MatchError
}

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
    handler: (parsed: InferOutput<schema>, input: NarrowedOutput<input, schema>) => result
  ): ReusableMatcher<input, WithReturn<Unset, result>, InferInput<schema>>
  case<input, schema extends StandardSchemaV1, result>(
    schema: schema,
    predicate: (parsed: InferOutput<schema>, input: NarrowedOutput<input, schema>) => unknown,
    handler: (parsed: InferOutput<schema>, input: NarrowedOutput<input, schema>) => result
  ): ReusableMatcher<input, WithReturn<Unset, result>, InferInput<schema>>
  case<input, schemas extends readonly [StandardSchemaV1, ...StandardSchemaV1[]], result>(
    ...args: [...schemas, (parsed: InferOutput<schemas[number]>, input: input) => result]
  ): ReusableMatcher<input, WithReturn<Unset, result>, InferInput<schemas[number]>>
}

export const match = Object.assign(
  function match<const input, output = Unset>(value: input): MatchExpression<input, output> {
    return new MatchExpression(value) as MatchExpression<input, output>
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

// ─── MatchExpression (sync inline) ───────────────────────────────────────────

type MatchClause<input> = {
  schemas: StandardSchemaV1[]
  predicate?: (value: unknown, input: input) => unknown
  handler: (value: unknown, input: input) => unknown
}

type MatchWhenClause<input> = {
  when: (input: input) => unknown
  handler: (value: input, input: input) => unknown
}

class MatchExpression<input, output, CaseInputs = never> {
  constructor(
    private readonly input: input,
    private readonly clauses: Array<MatchClause<input> | MatchWhenClause<input>> = []
  ) {}

  case<schema extends StandardSchemaV1, result>(
    schema: schema,
    handler: (parsed: InferOutput<schema>, input: NarrowedOutput<input, schema>) => result
  ): MatchExpression<input, WithReturn<output, result>, CaseInputs | InferInput<schema>>
  case<schema extends StandardSchemaV1, result>(
    schema: schema,
    predicate: (parsed: InferOutput<schema>, input: NarrowedOutput<input, schema>) => unknown,
    handler: (parsed: InferOutput<schema>, input: NarrowedOutput<input, schema>) => result
  ): MatchExpression<input, WithReturn<output, result>, CaseInputs | InferInput<schema>>
  case<schemas extends readonly [StandardSchemaV1, ...StandardSchemaV1[]], result>(
    ...args: [...schemas, (parsed: InferOutput<schemas[number]>, input: input) => result]
  ): MatchExpression<input, WithReturn<output, result>, CaseInputs | InferInput<schemas[number]>>
  case(...args: any[]): MatchExpression<input, any, any> {
    const length = args.length
    const handler = args[length - 1] as (value: unknown, input: input) => unknown
    const hasGuard = length === 3 && typeof args[1] === 'function' && !looksLikeStandardSchema(args[1])
    const predicate = hasGuard ? (args[1] as (value: unknown, input: input) => unknown) : undefined
    const schemaEnd = hasGuard ? 1 : length - 1
    const schemas = args.slice(0, schemaEnd) as StandardSchemaV1[]
    return new MatchExpression(this.input, [...this.clauses, {schemas, predicate, handler}])
  }

  when<result>(
    predicate: (value: input) => unknown,
    handler: (value: input, input: input) => result
  ): MatchExpression<input, WithReturn<output, result>, CaseInputs>
  when(
    predicate: (value: input) => unknown,
    handler: (value: input, input: input) => unknown
  ): MatchExpression<input, any, CaseInputs> {
    return new MatchExpression(this.input, [...this.clauses, {when: predicate, handler}])
  }

  /**
   * Terminates the match expression with a default behavior when no case matches.
   *
   * @overload `.default('assert')` — Throws a {@link MatchError} if no case matched. Accepts any input.
   * @overload `.default('never')` — Throws a {@link MatchError} if no case matched. Produces a type error if the input doesn't match the union of case input types.
   * @overload `.default('reject')` — Returns a {@link MatchError} instance (instead of throwing) if no case matched. Accepts any input.
   * @overload `.default(handler)` — Calls the handler with the input value if no case matched.
   */
  default(
    /** Throw a {@link MatchError} if no case matched. Accepts any input type. */
    mode: 'assert'
  ): output
  default(
    /**
     * Throw a {@link MatchError} if no case matched.
     * Constrains the input type to the union of all case schema input types —
     * produces a compile-time error if the match input doesn't extend that union.
     */
    mode: input extends CaseInputs ? 'never' : never
  ): output
  default(
    /** Return a {@link MatchError} instance (instead of throwing) if no case matched. */
    mode: 'reject'
  ): output | MatchError
  default<
    unmatched = input,
    handler extends (value: unmatched, context: DefaultContext) => unknown = (value: unmatched, context: DefaultContext) => unknown
  >(
    /** A fallback handler called with the raw input and lazy match error when no case matched. */
    handler: handler
  ): [unmatched] extends [never] ? output : WithReturn<output, ReturnType<handler>>
  default(modeOrHandler: 'assert' | 'never' | 'reject' | ((value: input, context: DefaultContext) => unknown)): unknown {
    const matcher = new ReusableMatcher<input, output, CaseInputs>(
      unmatched as MatchState<output>,
      this.clauses as Array<ReusableClause<input> | ReusableWhenClause<input>>
    )
    const run = matcher.default(modeOrHandler as any) as (input: input) => unknown
    return run(this.input)
  }

  /**
   * Async terminal for match expressions.
   *
   * Build clauses with `.case()` / `.when()`, then execute once with `.defaultAsync(...)`.
   */
  defaultAsync(
    mode: 'assert'
  ): Promise<Awaited<output>>
  defaultAsync(
    mode: input extends CaseInputs ? 'never' : never
  ): Promise<Awaited<output>>
  defaultAsync(
    mode: 'reject'
  ): Promise<Awaited<output> | MatchError>
  defaultAsync<
    unmatched = input,
    handler extends (value: unmatched, context: DefaultAsyncContext) => unknown | Promise<unknown> =
      (value: unmatched, context: DefaultAsyncContext) => unknown | Promise<unknown>
  >(
    handler: handler
  ): Promise<[unmatched] extends [never] ? Awaited<output> : WithAsyncReturn<output, ReturnType<handler>>>
  defaultAsync(
    modeOrHandler: 'assert' | 'never' | 'reject' | ((value: input, context: DefaultAsyncContext) => unknown | Promise<unknown>)
  ): Promise<unknown> {
    const matcher = new ReusableMatcher<input, output, CaseInputs>(
      unmatched as MatchState<output>,
      this.clauses as Array<ReusableClause<input> | ReusableWhenClause<input>>
    )
    const run = matcher.defaultAsync(modeOrHandler as any) as (input: input) => Promise<unknown>
    return run(this.input)
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

function atCaseSchema<input, key extends PropertyKey, value>(
  key: key,
  expected: value
): StandardSchemaV1<AtCaseInput<input, key, value>, AtCaseInput<input, key, value>> {
  return {
    '~standard': {
      version: 1,
      vendor: 'schematch',
      validate: (candidate: unknown) => {
        if (!isPlainObject(candidate)) {
          return {
            issues: [{message: `Expected object with ${String(key)} = ${String(expected)}`}] as StandardSchemaV1.Issue[],
          }
        }
        const actual = (candidate as Record<PropertyKey, unknown>)[key]
        if (!Object.is(actual, expected)) {
          return {
            issues: [{message: `Expected ${String(key)} = ${String(expected)}`}] as StandardSchemaV1.Issue[],
          }
        }
        return {value: candidate as AtCaseInput<input, key, value>}
      },
    },
  }
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
    handler: (parsed: InferOutput<schema>, input: NarrowedOutput<input, schema>) => result
  ): ReusableMatcher<input, WithReturn<output, result>, CaseInputs | InferInput<schema>>
  case<schema extends StandardSchemaV1, result>(
    schema: schema,
    predicate: (parsed: InferOutput<schema>, input: NarrowedOutput<input, schema>) => unknown,
    handler: (parsed: InferOutput<schema>, input: NarrowedOutput<input, schema>) => result
  ): ReusableMatcher<input, WithReturn<output, result>, CaseInputs | InferInput<schema>>
  case<schemas extends readonly [StandardSchemaV1, ...StandardSchemaV1[]], result>(
    ...args: [...schemas, (parsed: InferOutput<schemas[number]>, input: input) => result]
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

  at<key extends PropertyKey>(key: key): ReusableMatcherAt<input, output, CaseInputs, key> {
    return new ReusableMatcherAt(this, key)
  }

  /**
   * Terminates the reusable matcher and returns a function that executes the match.
   *
   * @overload `.default('assert')` — Returns a function that throws {@link MatchError} on no match. Accepts `unknown` input.
   * @overload `.default('never')` — Returns a function that throws {@link MatchError} on no match. Input type is constrained to the union of case schema input types.
   * @overload `.default('reject')` — Returns a function whose return type includes {@link MatchError} (returned, not thrown) on no match.
   * @overload `.default(handler)` — Returns a function that calls the handler on no match.
   */
  default(
    /** Throw a {@link MatchError} if no case matched. Accepts any input type. */
    mode: 'assert'
  ): (input: input) => output
  default(
    /**
     * Throw a {@link MatchError} if no case matched.
     * The returned function's input type is constrained to the union of all case schema input types.
     */
    mode: 'never'
  ): (input: CaseInputs) => output
  default(
    /** Return a {@link MatchError} instance (instead of throwing) if no case matched. */
    mode: 'reject'
  ): (input: input) => output | MatchError
  default<
    unmatched = input,
    handler extends (value: unmatched, context: DefaultContext) => unknown = (value: unmatched, context: DefaultContext) => unknown
  >(
    /** A fallback handler called with the raw input and lazy match error when no case matched. */
    handler: handler
  ): (input: [unmatched] extends [never] ? CaseInputs : input) => ([unmatched] extends [never] ? output : WithReturn<output, ReturnType<handler>>)
  default(modeOrHandler: 'assert' | 'never' | 'reject' | ((value: input, context: DefaultContext) => unknown)): (input: any) => unknown {
    const allSchemas = this.clauses.flatMap(c => 'schemas' in c ? c.schemas : [])

    if (typeof modeOrHandler === 'function') {
      return (input: input) => {
        const state = this.exec(input)
        if (state.matched) return state.value
        let error: MatchError | undefined
        const buildError = () => this.buildMatchError(input, allSchemas)
        const context: DefaultContext = {
          get error() {
            if (!error) error = buildError()
            return error
          },
        }
        return modeOrHandler(input, context)
      }
    }

    if (modeOrHandler === 'reject') {
      return (input: input) => {
        const state = this.exec(input)
        if (state.matched) return state.value
        return this.buildMatchError(input, allSchemas)
      }
    }

    modeOrHandler satisfies 'assert' | 'never';
    // 'assert' and 'never' both throw at runtime
    return (input: input) => {
      const state = this.exec(input)
      if (state.matched) return state.value
      throw this.buildMatchError(input, allSchemas)
    }
  }

  /**
   * Async terminal for reusable matchers.
   *
   * Build clauses with `.case()` / `.when()`, then execute with `.defaultAsync(...)`.
   */
  defaultAsync(
    mode: 'assert'
  ): (input: input) => Promise<Awaited<output>>
  defaultAsync(
    mode: 'never'
  ): (input: CaseInputs) => Promise<Awaited<output>>
  defaultAsync(
    mode: 'reject'
  ): (input: input) => Promise<Awaited<output> | MatchError>
  defaultAsync<
    unmatched = input,
    handler extends (value: unmatched, context: DefaultAsyncContext) => unknown | Promise<unknown> =
      (value: unmatched, context: DefaultAsyncContext) => unknown | Promise<unknown>
  >(
    handler: handler
  ): (input: [unmatched] extends [never] ? CaseInputs : input) => Promise<[unmatched] extends [never] ? Awaited<output> : WithAsyncReturn<output, ReturnType<handler>>>
  defaultAsync(
    modeOrHandler: 'assert' | 'never' | 'reject' | ((value: input, context: DefaultAsyncContext) => unknown | Promise<unknown>)
  ): (input: any) => Promise<unknown> {
    const allSchemas = this.clauses.flatMap(c => 'schemas' in c ? c.schemas : [])

    if (typeof modeOrHandler === 'function') {
      return async (input: input) => {
        const state = await this.execAsync(input)
        if (state.matched) return state.value
        let error: MatchError | undefined
        const buildError = () => this.buildMatchError(input, allSchemas)
        const context: DefaultAsyncContext = {
          get error() {
            if (!error) error = buildError()
            return error
          },
        }
        return await modeOrHandler(input, context)
      }
    }

    if (modeOrHandler === 'reject') {
      return async (input: input) => {
        const state = await this.execAsync(input)
        if (state.matched) return state.value
        return this.buildMatchError(input, allSchemas)
      }
    }

    modeOrHandler satisfies 'assert' | 'never';
    // 'assert' and 'never' both throw at runtime
    return async (input: input) => {
      const state = await this.execAsync(input)
      if (state.matched) return state.value
      throw this.buildMatchError(input, allSchemas)
    }
  }

  private buildMatchError(input: input, allSchemas: StandardSchemaV1[]): MatchError {
    const dispatch = this.getDispatch()
    const errorOptions: MatchErrorOptions = {schemas: allSchemas}
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
    return new MatchError(input, errorOptions)
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
        throw new Error('Predicate returned a Promise. Use .defaultAsync(...) instead.')
      }
      if (!predicateResult) return null
      return {matched: true, value: clause.handler(input, input) as output}
    }

    for (let j = 0; j < clause.schemas.length; j += 1) {
      const result = matchSchemaSync(clause.schemas[j], input)
      if (result === NO_MATCH) continue
      if (result === ASYNC_REQUIRED) {
        throw new Error('Schema validation returned a Promise. Use .defaultAsync(...) instead.')
      }

      if (clause.predicate) {
        const guardResult = clause.predicate(result, input)
        if (isPromiseLike(guardResult)) {
          throw new Error('Guard returned a Promise. Use .defaultAsync(...) instead.')
        }
        if (!guardResult) continue
      }

      return {matched: true, value: clause.handler(result, input) as output}
    }

    return null
  }

  private async execClauseAsync(
    clause: ReusableClause<input> | ReusableWhenClause<input>,
    input: input
  ): Promise<MatchState<Awaited<output>> | null> {
    if ('when' in clause) {
      if (!(await clause.when(input))) return null
      return {matched: true, value: await clause.handler(input, input) as Awaited<output>}
    }

    for (let j = 0; j < clause.schemas.length; j += 1) {
      const result = await matchSchemaAsync(clause.schemas[j], input)
      if (result === NO_MATCH) continue

      if (clause.predicate && !(await clause.predicate(result, input))) continue

      return {matched: true, value: await clause.handler(result, input) as Awaited<output>}
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

  private async execAsync(input: input): Promise<MatchState<Awaited<output>>> {
    const dispatch = this.getDispatch()

    if (dispatch && isPlainObject(input)) {
      const discriminatorValue = (input as Record<string, unknown>)[dispatch.key]
      const candidates = dispatch.table.get(discriminatorValue)
      const candidateSet = candidates ? new Set(candidates) : null

      for (let i = 0; i < this.clauses.length; i += 1) {
        if (!candidateSet?.has(i) && !dispatch.fallbackSet.has(i)) continue
        const result = await this.execClauseAsync(this.clauses[i], input)
        if (result) return result
      }
    } else {
      for (let i = 0; i < this.clauses.length; i += 1) {
        const result = await this.execClauseAsync(this.clauses[i], input)
        if (result) return result
      }
    }

    if (this.terminal.matched) {
      return {matched: true, value: await this.terminal.value as Awaited<output>}
    }
    return unmatched as MatchState<Awaited<output>>
  }
}

class ReusableMatcherAt<input, output, CaseInputs = never, key extends PropertyKey = PropertyKey> {
  readonly '~standard': StandardSchemaV1.Props<CaseInputs, ResolveOutput<output>>

  constructor(
    private readonly matcher: ReusableMatcher<input, output, CaseInputs>,
    private readonly key: key
  ) {
    this['~standard'] = matcher['~standard'] as StandardSchemaV1.Props<CaseInputs, ResolveOutput<output>>
  }

  case<value extends AtCaseValues<input, key>, result>(
    value: value,
    handler: (value: AtCaseInput<input, key, value>) => result
  ): ReusableMatcherAt<input, WithReturn<output, result>, CaseInputs | AtCaseInput<input, key, value>, key> {
    const schema = atCaseSchema<input, key, value>(this.key, value)
    const next = this.matcher.case(schema, (_parsed, narrowed) =>
      handler(narrowed as AtCaseInput<input, key, value>)
    ) as ReusableMatcher<input, WithReturn<output, result>, CaseInputs | AtCaseInput<input, key, value>>

    return new ReusableMatcherAt(next, this.key)
  }

  when<result>(
    predicate: (value: input) => unknown,
    handler: (value: input, input: input) => result
  ): ReusableMatcherAt<input, WithReturn<output, result>, CaseInputs, key> {
    return new ReusableMatcherAt(this.matcher.when(predicate, handler), this.key) as any
  }

  output<O>(): ReusableMatcherAt<input, O, CaseInputs, key> {
    return new ReusableMatcherAt(this.matcher.output<O>(), this.key) as any
  }

  default(
    mode: 'assert'
  ): (input: input) => output
  default(
    mode: 'never'
  ): (input: CaseInputs) => output
  default(
    mode: 'reject'
  ): (input: input) => output | MatchError
  default<
    unmatched = input,
    handler extends (value: unmatched, context: DefaultContext) => unknown = (value: unmatched, context: DefaultContext) => unknown
  >(
    handler: handler
  ): (input: [unmatched] extends [never] ? CaseInputs : input) => ([unmatched] extends [never] ? output : WithReturn<output, ReturnType<handler>>)
  default(modeOrHandler: 'assert' | 'never' | 'reject' | ((value: input, context: DefaultContext) => unknown)): (input: any) => unknown {
    return this.matcher.default(modeOrHandler as any) as any
  }

  defaultAsync(
    mode: 'assert'
  ): (input: input) => Promise<Awaited<output>>
  defaultAsync(
    mode: 'never'
  ): (input: CaseInputs) => Promise<Awaited<output>>
  defaultAsync(
    mode: 'reject'
  ): (input: input) => Promise<Awaited<output> | MatchError>
  defaultAsync<
    unmatched = input,
    handler extends (value: unmatched, context: DefaultAsyncContext) => unknown | Promise<unknown> =
      (value: unmatched, context: DefaultAsyncContext) => unknown | Promise<unknown>
  >(
    handler: handler
  ): (input: [unmatched] extends [never] ? CaseInputs : input) => Promise<[unmatched] extends [never] ? Awaited<output> : WithAsyncReturn<output, ReturnType<handler>>>
  defaultAsync(
    modeOrHandler: 'assert' | 'never' | 'reject' | ((value: input, context: DefaultAsyncContext) => unknown | Promise<unknown>)
  ): (input: any) => Promise<unknown> {
    return this.matcher.defaultAsync(modeOrHandler as any) as any
  }
}
