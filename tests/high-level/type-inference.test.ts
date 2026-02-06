import {describe, expectTypeOf, it} from 'vitest'
import {z} from 'zod'

import {isMatching, match, matchAsync} from '../../src/index.js'
import {makeAsyncSchema} from '../helpers/standard-schema.js'

describe('high-level/type-inference', () => {
  it('infers handler values from schema output', () => {
    const numberSchema = z.number()

    const result = match(1)
      .with(numberSchema, value => {
        expectTypeOf(value).toEqualTypeOf<number>()
        return value
      })
      .otherwise(() => 'fallback')

    expectTypeOf(result).toEqualTypeOf<number | string>()
  })

  it('unions handler return types across branches', () => {
    const stringSchema = z.string()
    const numberSchema = z.number()

    const result = match<unknown>('hello')
      .with(stringSchema, value => value.length)
      .with(numberSchema, value => value + 1)
      .otherwise(() => false)

    expectTypeOf(result).toEqualTypeOf<number | boolean>()
  })

  it('narrows with isMatching type guards', () => {
    const stringSchema = z.string()
    const value: unknown = 'hello'

    if (isMatching(stringSchema, value)) {
      expectTypeOf(value).toEqualTypeOf<string>()
    }
  })

  it('returns promise types for matchAsync', () => {
    const asyncNumberSchema = makeAsyncSchema<number>(
      (value): value is number => typeof value === 'number'
    )

    const result = matchAsync(2)
      .with(asyncNumberSchema, value => value + 1)
      .otherwise(() => 0)

    expectTypeOf(result).toEqualTypeOf<Promise<number>>()
  })
})
