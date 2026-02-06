import {describe, expect, it} from 'vitest'

import {match} from '../../src/index.js'

describe('ported/when', () => {
  it('matches when predicate returns truthy', () => {
    expect(
      match(1)
        .when(x => x > 10 && x < 50, () => true)
        .otherwise(() => false)
    ).toBe(false)

    expect(
      match(-2)
        .when(x => x > 10 && x < 50, () => true)
        .otherwise(() => false)
    ).toBe(false)

    expect(
      match(3)
        .when(x => x > 10 && x < 50, () => true)
        .otherwise(() => false)
    ).toBe(false)

    expect(
      match(20)
        .when(x => x > 10 && x < 50, () => true)
        .otherwise(() => false)
    ).toBe(true)

    expect(
      match(39)
        .when(x => x > 10 && x < 50, () => true)
        .otherwise(() => false)
    ).toBe(true)

    expect(
      match(100)
        .when(x => x > 10 && x < 50, () => true)
        .otherwise(() => false)
    ).toBe(false)
  })

  it('accepts non-boolean predicate results', () => {
    const result = match('hello')
      .when(() => 'truthy', () => 'matched')
      .otherwise(() => 'fallback')

    expect(result).toBe('matched')
  })
})
