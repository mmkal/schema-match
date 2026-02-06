import {describe, expect, it} from 'vitest'

import {match} from '../../src/index.js'

describe('ported/when', () => {
  it('matches when predicate returns truthy', () => {
    const values = [
      {value: 1, expected: false},
      {value: -2, expected: false},
      {value: 3, expected: false},
      {value: 20, expected: true},
      {value: 39, expected: true},
      {value: 100, expected: false},
    ]

    values.forEach(({value, expected}) => {
      const result = match(value)
        .when(x => x > 10 && x < 50, () => true)
        .otherwise(() => false)

      expect(result).toBe(expected)
    })
  })

  it('accepts non-boolean predicate results', () => {
    const result = match('hello')
      .when(() => 'truthy', () => 'matched')
      .otherwise(() => 'fallback')

    expect(result).toBe('matched')
  })
})
