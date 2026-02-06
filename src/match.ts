import type {StandardSchemaV1} from './standard-schema/contract.js'
import {looksLikeStandardSchema} from './standard-schema/utils.js'
import {ASYNC_REQUIRED, NO_MATCH, matchSchemaAsync, matchSchemaSync} from './standard-schema/compiled.js'
import {isPromiseLike} from './standard-schema/validation.js'
import type {InferOutput} from './types.js'
import {NonExhaustiveError} from './errors.js'

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

export function match<const input, output = Unset>(value: input): MatchExpression<input, output> {
  return new MatchExpression(value, false, undefined) as MatchExpression<input, output>
}

export function matchAsync<const input, output = Unset>(value: input): MatchExpressionAsync<input, output> {
  return new MatchExpressionAsync(value, Promise.resolve(unmatched)) as MatchExpressionAsync<input, output>
}

class MatchExpression<input, output> {
  constructor(
    private input: input,
    private matched: boolean,
    private value: output | undefined
  ) {}

  with<schema extends StandardSchemaV1, result>(
    schema: schema,
    handler: (value: InferOutput<schema>, input: input) => result
  ): MatchExpression<input, WithReturn<output, result>>
  with<schema extends StandardSchemaV1, result>(
    schema: schema,
    predicate: (value: InferOutput<schema>, input: input) => unknown,
    handler: (value: InferOutput<schema>, input: input) => result
  ): MatchExpression<input, WithReturn<output, result>>
  with<schemas extends readonly [StandardSchemaV1, ...StandardSchemaV1[]], result>(
    ...args: [...schemas, (value: InferOutput<schemas[number]>, input: input) => result]
  ): MatchExpression<input, WithReturn<output, result>>
  with(...args: any[]): MatchExpression<input, any> {
    if (this.matched) return this

    const length = args.length
    const handler = args[length - 1] as (value: unknown, input: input) => output

    if (length === 2) {
      const result = matchSchemaSync(args[0] as StandardSchemaV1, this.input)
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
      const result = matchSchemaSync(args[index] as StandardSchemaV1, this.input)
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
    unexpectedValueHandler: (value: input) => result = defaultCatcher as (value: input) => result
  ): WithReturn<output, result> {
    if (this.matched) return this.value as WithReturn<output, result>
    return unexpectedValueHandler(this.input) as WithReturn<output, result>
  }

  run(): output {
    return this.exhaustive()
  }

  returnType() {
    return this
  }

  narrow() {
    return this
  }
}

class MatchExpressionAsync<input, output> {
  constructor(private input: input, private state: Promise<MatchState<output>>) {}

  with<schema extends StandardSchemaV1, result>(
    schema: schema,
    handler: (value: InferOutput<schema>, input: input) => result | Promise<result>
  ): MatchExpressionAsync<input, WithAsyncReturn<output, result>>
  with<schema extends StandardSchemaV1, result>(
    schema: schema,
    predicate: (value: InferOutput<schema>, input: input) => unknown | Promise<unknown>,
    handler: (value: InferOutput<schema>, input: input) => result | Promise<result>
  ): MatchExpressionAsync<input, WithAsyncReturn<output, result>>
  with<schemas extends readonly [StandardSchemaV1, ...StandardSchemaV1[]], result>(
    ...args: [...schemas, (value: InferOutput<schemas[number]>, input: input) => result | Promise<result>]
  ): MatchExpressionAsync<input, WithAsyncReturn<output, result>>
  with(...args: any[]): MatchExpressionAsync<input, any> {
    const length = args.length
    const handler = args[length - 1] as (value: unknown, input: input) => unknown | Promise<unknown>

    if (length === 2) {
      const nextState = this.state.then(async state => {
        if (state.matched) return state

        const result = await matchSchemaAsync(args[0] as StandardSchemaV1, this.input)
        if (result === NO_MATCH) return unmatched

        return {
          matched: true as const,
          value: await handler(result, this.input),
        }
      })

      return new MatchExpressionAsync(this.input, nextState)
    }

    const hasGuard = length === 3 && typeof args[1] === 'function' && !looksLikeStandardSchema(args[1])
    const predicate = hasGuard ? (args[1] as (value: unknown, input: input) => unknown | Promise<unknown>) : undefined
    const schemaEnd = hasGuard ? 1 : length - 1

    const nextState = this.state.then(async state => {
      if (state.matched) return state

      for (let index = 0; index < schemaEnd; index += 1) {
        const result = await matchSchemaAsync(args[index] as StandardSchemaV1, this.input)
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

    return new MatchExpressionAsync(this.input, nextState)
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
    unexpectedValueHandler: (value: input) => result | Promise<result> =
      defaultCatcher as (value: input) => result | Promise<result>
  ): Promise<WithAsyncReturn<output, result>> {
    return this.state.then(async state => {
      if (state.matched) return state.value as WithAsyncReturn<output, result>
      return (await unexpectedValueHandler(this.input)) as WithAsyncReturn<output, result>
    })
  }

  run(): Promise<output> {
    return this.exhaustive()
  }

  returnType() {
    return this
  }

  narrow() {
    return this
  }
}

function defaultCatcher(input: unknown): never {
  throw new NonExhaustiveError(input)
}
