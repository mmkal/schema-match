import type {StandardSchemaV1} from './standard-schema/contract.js'
import {looksLikeStandardSchema} from './standard-schema/utils.js'
import {assertStandardSchema, isPromiseLike, isSuccess, validateAsync, validateSync} from './standard-schema/validation.js'
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
  return new MatchExpression(value, unmatched) as MatchExpression<input, output>
}

export function matchAsync<const input, output = Unset>(value: input): MatchExpressionAsync<input, output> {
  return new MatchExpressionAsync(value, Promise.resolve(unmatched)) as MatchExpressionAsync<input, output>
}

class MatchExpression<input, output> {
  constructor(private input: input, private state: MatchState<output>) {}

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
    if (this.state.matched) return this

    const {schemas, predicate, handler} = parseWithArgs(args)

    for (const schema of schemas) {
      assertStandardSchema(schema)
      const result = validateSync(schema, this.input)
      if (!isSuccess(result)) continue

      if (predicate) {
        const guardResult = predicate(result.value, this.input)
        if (isPromiseLike(guardResult)) {
          throw new Error('Guard returned a Promise. Use matchAsync instead.')
        }
        if (!guardResult) return new MatchExpression(this.input, unmatched)
      }

      return new MatchExpression(this.input, {
        matched: true,
        value: handler(result.value, this.input),
      })
    }

    return new MatchExpression(this.input, unmatched)
  }

  when<result>(
    predicate: (value: input) => unknown,
    handler: (value: input, input: input) => result
  ): MatchExpression<input, WithReturn<output, result>>
  when(
    predicate: (value: input) => unknown,
    handler: (value: input, input: input) => unknown
  ): MatchExpression<input, any> {
    if (this.state.matched) return this

    const result = predicate(this.input)
    if (isPromiseLike(result)) {
      throw new Error('Predicate returned a Promise. Use matchAsync instead.')
    }

    return new MatchExpression(
      this.input,
      result
        ? {matched: true, value: handler(this.input, this.input)}
        : unmatched
    )
  }

  otherwise<result>(handler: (value: input) => result): WithReturn<output, result> {
    if (this.state.matched) return this.state.value as WithReturn<output, result>
    return handler(this.input) as WithReturn<output, result>
  }

  exhaustive<result = never>(
    unexpectedValueHandler: (value: input) => result = defaultCatcher as (value: input) => result
  ): WithReturn<output, result> {
    if (this.state.matched) return this.state.value as WithReturn<output, result>
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
    const nextState = this.state.then(async state => {
      if (state.matched) return state

      const {schemas, predicate, handler} = parseWithArgs(args)

      for (const schema of schemas) {
        assertStandardSchema(schema)
        const result = await validateAsync(schema, this.input)
        if (!isSuccess(result)) continue

        if (predicate) {
          const guardResult = await predicate(result.value, this.input)
          if (!guardResult) return unmatched
        }

        return {
          matched: true as const,
          value: await handler(result.value, this.input),
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

type ParsedWithArgs = {
  schemas: StandardSchemaV1[]
  predicate?: (value: unknown, input: unknown) => unknown
  handler: (value: unknown, input: unknown) => unknown
}

const parseWithArgs = (args: unknown[]): ParsedWithArgs => {
  const handler = args[args.length - 1] as (value: unknown, input: unknown) => unknown
  const schemas: StandardSchemaV1[] = [args[0] as StandardSchemaV1]
  let predicate: ((value: unknown, input: unknown) => unknown) | undefined

  if (args.length === 3 && typeof args[1] === 'function' && !looksLikeStandardSchema(args[1])) {
    predicate = args[1] as (value: unknown, input: unknown) => unknown
  } else if (args.length > 2) {
    schemas.push(...(args.slice(1, -1) as StandardSchemaV1[]))
  }

  return {schemas, predicate, handler}
}

function defaultCatcher(input: unknown): never {
  throw new NonExhaustiveError(input)
}
