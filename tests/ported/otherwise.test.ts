import {describe, expect, it} from 'vitest'

import {match} from '../../src/index.js'
import {makeSchema} from '../helpers/standard-schema.js'

describe('ported/otherwise', () => {
  it('passes the input value to otherwise when no schema matches', () => {
    const Never = makeSchema<never>((_value): _value is never => false)

    const result = match(42)
      .case(Never, () => 0)
      .default(value => value)

    expect(result).toBe(42)
  })
})
