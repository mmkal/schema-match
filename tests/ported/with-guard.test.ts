import {describe, expect, it} from 'vitest'

import {match} from '../../src/index.js'
import {makeSchema} from '../helpers/standard-schema.js'

describe('ported/with-guard', () => {
  const numberSchema = makeSchema<number>((value): value is number => typeof value === 'number')

  it('uses the guard to refine matches', () => {
    const result = match(12)
      .with(numberSchema, value => value > 10, () => 'big')
      .with(numberSchema, () => 'small')
      .exhaustive()

    expect(result).toBe('big')
  })

  it('falls through when guard returns false', () => {
    const result = match(4)
      .with(numberSchema, value => value > 10, () => 'big')
      .with(numberSchema, () => 'small')
      .exhaustive()

    expect(result).toBe('small')
  })
})
