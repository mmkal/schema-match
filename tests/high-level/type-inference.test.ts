import {describe, expect, expectTypeOf, it} from 'vitest'
import {z} from 'zod'

import {isMatching, match, matchAsync, NonExhaustiveError} from '../../src/index.js'
import type {StandardSchemaV1} from '../../src/index.js'
import {makeAsyncSchema} from '../helpers/standard-schema.js'

describe('high-level/type-inference', () => {
  it('infers handler values from schema output', () => {
    const Number = z.number()

    const result = match(1)
      .case(Number, value => {
        expectTypeOf(value).toEqualTypeOf<number>()
        return value
      })
      .default(() => 'fallback')

    expectTypeOf(result).toEqualTypeOf<number | string>()
  })

  it('unions handler return types across branches', () => {
    const String = z.string()
    const Number = z.number()

    const result = match<unknown>('hello')
      .case(String, value => value.length)
      .case(Number, value => value + 1)
      .default(() => false)

    expectTypeOf(result).toEqualTypeOf<number | boolean>()
  })

  it('narrows with isMatching type guards', () => {
    const String = z.string()
    const value: unknown = 'hello'

    if (isMatching(String, value)) {
      expectTypeOf(value).toEqualTypeOf<string>()
    }
  })

  it('returns promise types for matchAsync', () => {
    const AsyncNumber = makeAsyncSchema<number>(
      (value): value is number => typeof value === 'number'
    )

    const result = matchAsync(2)
      .case(AsyncNumber, value => value + 1)
      .default(() => 0)

    expectTypeOf(result).toEqualTypeOf<Promise<number>>()
  })

  it('supports constraining input type for reusable matchers', () => {
    type Input =
      | {type: 'ok'; value: number}
      | {type: 'err'; message: string}

    const Ok = z.object({type: z.literal('ok'), value: z.number()})

    const matcher = match
      .input<Input>()
      .case(Ok, (parsed, input) => {
        expectTypeOf(parsed).toEqualTypeOf<{type: 'ok'; value: number}>()
        expectTypeOf(input).toEqualTypeOf<{type: 'ok'; value: number}>()
        return parsed.value
      })
      .default(input => {
        expectTypeOf(input).toEqualTypeOf<Input>()
        return -1
      })

    expectTypeOf(matcher).toEqualTypeOf<(input: Input) => number>()
  })

  it('types case args as parsed first and narrowed input second', () => {
    type Event =
      | {type: 'session.status'; sessionId: string}
      | {type: 'message.updated'; properties: {sessionId: string}}

    const matcher = match
      .input<Event>()
      .case(z.object({type: z.literal('session.status')}), (parsed, input) => {
        expectTypeOf(parsed).toEqualTypeOf<{type: 'session.status'}>()
        expectTypeOf(input).toEqualTypeOf<{type: 'session.status'; sessionId: string}>()
        return input.sessionId
      })
      .case(z.object({type: z.literal('message.updated')}), (parsed, input) => {
        expectTypeOf(parsed).toEqualTypeOf<{type: 'message.updated'}>()
        expectTypeOf(input).toEqualTypeOf<{type: 'message.updated'; properties: {sessionId: string}}>()
        return input.properties.sessionId
      })
      .default(() => 'fallback')

    expectTypeOf(matcher).toEqualTypeOf<(input: Event) => string>()
  })

  it('narrows .at(key).case(value, handler) by discriminator value', () => {
    type Event =
      | {type: 'session.status'; sessionId: string}
      | {type: 'message.updated'; properties: {sessionId: string}}

    const matcher = match
      .input<Event>()
      .at('type')
      .case('session.status', value => {
        expectTypeOf(value).toEqualTypeOf<{type: 'session.status'; sessionId: string}>()
        return value.sessionId
      })
      .case('message.updated', value => {
        expectTypeOf(value).toEqualTypeOf<{type: 'message.updated'; properties: {sessionId: string}}>()
        return value.properties.sessionId
      })
      .default('never')

    expectTypeOf(matcher).toEqualTypeOf<(input: Event) => string>()
  })

  it('supports constraining output type with .output<T>() on inline match', () => {
    const Number = z.number()

    const result = match<unknown>('hello')
      .output<string | number>()
      .case(Number, value => value + 1)
      .default(() => 'fallback')

    expectTypeOf(result).toEqualTypeOf<string | number>()
  })

  it('supports constraining output type with .output<T>() on reusable matchers', () => {
    type Input =
      | {type: 'ok'; value: number}
      | {type: 'err'; message: string}

    const Ok = z.object({type: z.literal('ok'), value: z.number()})

    const matcher = match
      .input<Input>()
      .output<number>()
      .case(Ok, value => value.value)
      .default(() => -1)

    expectTypeOf(matcher).toEqualTypeOf<(input: Input) => number>()
  })

  it('supports .output<T>() on the factory without .input<T>()', () => {
    const Number = z.number()

    const matcher = match
      .output<number>()
      .case(Number, value => value + 1)
      .default(() => -1)

    expectTypeOf(matcher).toEqualTypeOf<(input: unknown) => number>()
  })

  it('supports .output<T>() on async matchers', () => {
    const AsyncNumber = makeAsyncSchema<number>(
      (value): value is number => typeof value === 'number'
    )

    const result = matchAsync(2)
      .output<number>()
      .case(AsyncNumber, value => value + 1)
      .default(() => 0)

    expectTypeOf(result).toEqualTypeOf<Promise<number>>()
  })

  it('supports .output<T>() on reusable async matchers', () => {
    const AsyncNumber = makeAsyncSchema<number>(
      (value): value is number => typeof value === 'number'
    )

    const matcher = matchAsync
      .input<unknown>()
      .output<number>()
      .case(AsyncNumber, value => value + 1)
      .default(() => 0)

    expectTypeOf(matcher).toEqualTypeOf<(input: unknown) => Promise<number>>()
  })

  describe('.default modes', () => {
    it('.default("assert") throws NonExhaustiveError on no match', () => {
      const result = match(42)
        .case(z.string(), s => s.length)
        .case(z.number(), n => n + 1)
        .default('assert')

      expectTypeOf(result).toEqualTypeOf<number>()
      expect(result).toBe(43)

      expect(() =>
        match(true as unknown)
          .case(z.string(), () => 'str')
          .default('assert')
      ).toThrow(NonExhaustiveError)
    })

    it('.default("reject") returns NonExhaustiveError instead of throwing', () => {
      const result = match(42)
        .case(z.string(), s => s.length)
        .default('reject')

      expectTypeOf(result).toEqualTypeOf<number | NonExhaustiveError>()
      expect(result).toBeInstanceOf(NonExhaustiveError)

      const result2 = match('hello')
        .case(z.string(), s => s.length)
        .default('reject')

      expectTypeOf(result2).toEqualTypeOf<number | NonExhaustiveError>()
      expect(result2).toBe(5)
    })

    it('.default("never") constrains input type in inline mode', () => {
      // When input matches case union, 'never' is allowed
      const result = match(42 as number)
        .case(z.number(), n => n + 1)
        .default('never')

      expectTypeOf(result).toEqualTypeOf<number>()
      expect(result).toBe(43)
    })

    it('.default("never") constrains input type in reusable mode', () => {
      const matcher = match
        .case(z.string(), s => s.length)
        .case(z.number(), n => n + 1)
        .default('never')

      // Input type should be constrained to string | number
      expectTypeOf(matcher).toEqualTypeOf<(input: string | number) => number>()

      expect(matcher('hello')).toBe(5)
      expect(matcher(42)).toBe(43)
    })

    it('.default("assert") reusable accepts unknown input', () => {
      const matcher = match
        .case(z.string(), s => s.length)
        .case(z.number(), n => n + 1)
        .default('assert')

      // Input type should be unknown
      expectTypeOf(matcher).toEqualTypeOf<(input: unknown) => number>()

      expect(matcher('hello')).toBe(5)
      expect(matcher(42)).toBe(43)
      expect(() => matcher(true)).toThrow(NonExhaustiveError)
    })

    it('.default("reject") reusable returns error union', () => {
      const matcher = match
        .case(z.string(), s => s.length)
        .default('reject')

      expectTypeOf(matcher).toEqualTypeOf<(input: unknown) => number | NonExhaustiveError>()

      expect(matcher('hello')).toBe(5)
      expect(matcher(42)).toBeInstanceOf(NonExhaustiveError)
    })

    it('.default("never") async reusable constrains input from schema input type', () => {
      // makeAsyncSchema returns StandardSchemaV1<unknown, number>, so InferInput is unknown
      const AsyncNumber = makeAsyncSchema<number>(
        (value): value is number => typeof value === 'number'
      )

      const matcher = matchAsync
        .case(AsyncNumber, n => n + 1)
        .default('never')

      // Since the schema input type is unknown, 'never' mode also accepts unknown
      expectTypeOf(matcher).toEqualTypeOf<(input: unknown) => Promise<number>>()
    })

    it('.default("never") async reusable constrains input with typed schemas', () => {
      const matcher = matchAsync
        .case(z.string(), s => s.length)
        .case(z.number(), n => n + 1)
        .default('never')

      // Zod schemas have typed inputs, so the constraint should be string | number
      expectTypeOf(matcher).toEqualTypeOf<(input: string | number) => Promise<number>>()
    })

    it('.default("reject") async inline resolves to error union', async () => {
      const result = await matchAsync(42)
        .case(z.string(), s => s.length)
        .default('reject')

      expectTypeOf(result).toEqualTypeOf<number | NonExhaustiveError>()
      expect(result).toBeInstanceOf(NonExhaustiveError)
    })
  })

  describe('matcher as StandardSchema', () => {
    it('satisfies StandardSchemaV1 with correct input/output types', () => {
      const MySchema = match
        .case(z.string(), s => s.split(','))
        .case(z.number(), n => Array.from({length: n}, () => 'hi'))

      type S = typeof MySchema
      expectTypeOf<S['~standard']>().toExtend<{version: 1; vendor: string}>()

      // InferInput should be the union of case schema input types
      type In = StandardSchemaV1.InferInput<S>
      expectTypeOf<In>().toEqualTypeOf<string | number>()

      // InferOutput should be the union of handler return types
      type Out = StandardSchemaV1.InferOutput<S>
      expectTypeOf<Out>().toEqualTypeOf<string[]>()
    })

    it('satisfies StandardSchemaV1 with mixed return types', () => {
      const MySchema = match
        .case(z.string(), s => s.length)
        .case(z.number(), n => String(n))

      type In = StandardSchemaV1.InferInput<typeof MySchema>
      expectTypeOf<In>().toEqualTypeOf<string | number>()

      type Out = StandardSchemaV1.InferOutput<typeof MySchema>
      expectTypeOf<Out>().toEqualTypeOf<number | string>()
    })

    it('async matcher satisfies StandardSchemaV1 with Promise validate', () => {
      const MySchema = matchAsync
        .case(z.string(), s => s.length)
        .case(z.number(), n => n + 1)

      type In = StandardSchemaV1.InferInput<typeof MySchema>
      expectTypeOf<In>().toEqualTypeOf<string | number>()

      type Out = StandardSchemaV1.InferOutput<typeof MySchema>
      expectTypeOf<Out>().toEqualTypeOf<number>()
    })
  })
})
