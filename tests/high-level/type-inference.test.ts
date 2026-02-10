import {describe, expectTypeOf, it} from 'vitest'
import {z} from 'zod'

import {isMatching, match, matchAsync} from '../../src/index.js'
import {makeAsyncSchema} from '../helpers/standard-schema.js'

describe('high-level/type-inference', () => {
  it('infers handler values from schema output', () => {
    const Number = z.number()

    const result = match(1)
      .with(Number, value => {
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
      .with(String, value => value.length)
      .with(Number, value => value + 1)
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
      .with(AsyncNumber, value => value + 1)
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
      .with(Ok, (value, input) => {
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
})
