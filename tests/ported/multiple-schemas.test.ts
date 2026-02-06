import {describe, expect, expectTypeOf, it} from 'vitest'

import {match} from '../../src/index.js'
import {makeSchema} from '../helpers/standard-schema.js'

describe('ported/multiple-schemas', () => {
  const twoSchema = makeSchema<2>((value): value is 2 => value === 2)
  const threeSchema = makeSchema<3>((value): value is 3 => value === 3)
  const fourSchema = makeSchema<4>((value): value is 4 => value === 4)
  const numberSchema = makeSchema<number>((value): value is number => typeof value === 'number')

  it('matches if one of the schemas matches', () => {
    const result = match(3)
      .with(twoSchema, threeSchema, fourSchema, value => {
        expectTypeOf(value).toEqualTypeOf<2 | 3 | 4>()
        return `num:${value}`
      })
      .with(numberSchema, value => `other:${value}`)
      .run()

    expect(result).toBe('num:3')
  })

  it('falls through to later handlers when no schema matches', () => {
    const result = match(9)
      .with(twoSchema, threeSchema, fourSchema, value => `num:${value}`)
      .with(numberSchema, value => `other:${value}`)
      .run()

    expect(result).toBe('other:9')
  })
})
