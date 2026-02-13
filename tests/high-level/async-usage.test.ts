import {describe, expect, it} from 'vitest'

import {isMatchingAsync, match, matchAsync} from '../../src/index.js'
import {makeAsyncSchema, makeSchema} from '../helpers/standard-schema.js'

describe('high-level/async-usage', () => {
  const AsyncNumber = makeAsyncSchema<number>(
    (value): value is number => typeof value === 'number'
  )

  it('handles async schema validation with matchAsync', async () => {
    const result = await matchAsync(2)
      .case(AsyncNumber, async value => value + 1)
      .default(() => 0)

    expect(result).toBe(3)
  })

  it('supports isMatchingAsync in both forms', async () => {
    const isNumber = isMatchingAsync(AsyncNumber)
    await expect(isNumber(2)).resolves.toBe(true)
    await expect(isNumber('nope')).resolves.toBe(false)

    await expect(isMatchingAsync(AsyncNumber, 5)).resolves.toBe(true)
    await expect(isMatchingAsync(AsyncNumber, 'nope')).resolves.toBe(false)
  })

  it('throws when sync match sees async schema validation', () => {
    expect(() => {
      match(2).case(AsyncNumber, () => 'nope')
    }).toThrow('Schema validation returned a Promise')
  })

  it('throws when a sync guard returns a promise', () => {
    const Number = makeSchema<number>((value): value is number => typeof value === 'number')

    expect(() => {
      match(2).case(Number, async () => true, () => 'nope')
    }).toThrow('Guard returned a Promise')
  })

  it('supports .at(key) convenience on async reusable matchers', async () => {
    type Event =
      | {type: 'session.status'; sessionId: string}
      | {type: 'message.updated'; properties: {sessionId: string}}

    const matcher = matchAsync
      .input<Event>()
      .at('type')
      .case('session.status', async value => value.sessionId)
      .case('message.updated', async value => value.properties.sessionId)
      .default('assert')

    await expect(matcher({type: 'session.status', sessionId: 'abc'})).resolves.toBe('abc')
    await expect(matcher({type: 'message.updated', properties: {sessionId: 'xyz'}})).resolves.toBe('xyz')
  })
})
