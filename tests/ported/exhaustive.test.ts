import {describe, expect, it} from 'vitest'

import {match, NonExhaustiveError} from '../../src/index.js'
import {makeSchema} from '../helpers/standard-schema.js'

describe('ported/exhaustive', () => {
  it('throws when exhaustive is called without a match', () => {
    const twoSchema = makeSchema<2>((value): value is 2 => value === 2)

    expect(() =>
      match(1)
        .with(twoSchema, () => 'two')
        .exhaustive()
    ).toThrow(NonExhaustiveError)
  })
})
