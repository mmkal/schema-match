import {describe, expectTypeOf, it} from 'vitest'
import {z} from 'zod'

import {isMatching, match, matchAsync} from '../../src/index.js'
import {makeAsyncSchema} from '../helpers/standard-schema.js'

describe('high-level/type-inference', () => {
  it('infers handler values from schema output', () => {
    const Number = z.number()

    const result = match(1)
      .case(Number, value => {
        expectTypeOf(value).toEqualTypeOf<number>()
        return value
      })
      .otherwise(() => 'fallback')

    expectTypeOf(result).toEqualTypeOf<number | string>()
  })

  it('unions handler return types across branches', () => {
    const String = z.string()
    const Number = z.number()

    const result = match<unknown>('hello')
      .case(String, value => value.length)
      .case(Number, value => value + 1)
      .otherwise(() => false)

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
      .otherwise(() => 0)

    expectTypeOf(result).toEqualTypeOf<Promise<number>>()
  })

  it('supports constraining input type for reusable matchers', () => {
    type Input =
      | {type: 'ok'; value: number}
      | {type: 'err'; message: string}

    const Ok = z.object({type: z.literal('ok'), value: z.number()})

    const matcher = match
      .input<Input>()
      .case(Ok, (value, input) => {
        expectTypeOf(value).toEqualTypeOf<{type: 'ok'; value: number}>()
        expectTypeOf(input).toEqualTypeOf<Input>()
        return value.value
      })
      .otherwise(input => {
        expectTypeOf(input).toEqualTypeOf<Input>()
        return -1
      })

    expectTypeOf(matcher).toEqualTypeOf<(input: Input) => number>()
  })

  it('supports constraining output type with .output<T>() on inline match', () => {
    const Number = z.number()

    const result = match<unknown>('hello')
      .output<string | number>()
      .case(Number, value => value + 1)
      .otherwise(() => 'fallback')

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
      .otherwise(() => -1)

    expectTypeOf(matcher).toEqualTypeOf<(input: Input) => number>()
  })

  it('supports .output<T>() on the factory without .input<T>()', () => {
    const Number = z.number()

    const matcher = match
      .output<number>()
      .case(Number, value => value + 1)
      .otherwise(() => -1)

    expectTypeOf(matcher).toEqualTypeOf<(input: unknown) => number>()
  })

  it('supports .output<T>() on async matchers', () => {
    const AsyncNumber = makeAsyncSchema<number>(
      (value): value is number => typeof value === 'number'
    )

    const result = matchAsync(2)
      .output<number>()
      .case(AsyncNumber, value => value + 1)
      .otherwise(() => 0)

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
      .otherwise(() => 0)

    expectTypeOf(matcher).toEqualTypeOf<(input: unknown) => Promise<number>>()
  })
})
