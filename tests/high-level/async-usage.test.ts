import {describe, expect, it} from 'vitest'

import {isMatchingAsync, match, matchAsync} from '../../src/index.js'
import {makeAsyncSchema, makeSchema} from '../helpers/standard-schema.js'

describe('high-level/async-usage', () => {
  const asyncNumberSchema = makeAsyncSchema<number>(
    (value): value is number => typeof value === 'number'
  )

  it('handles async schema validation with matchAsync', async () => {
    const result = await matchAsync(2)
      .with(asyncNumberSchema, async value => value + 1)
      .otherwise(() => 0)

    expect(result).toBe(3)
  })

  it('supports isMatchingAsync in both forms', async () => {
    const isNumber = isMatchingAsync(asyncNumberSchema)
    await expect(isNumber(2)).resolves.toBe(true)
    await expect(isNumber('nope')).resolves.toBe(false)

    await expect(isMatchingAsync(asyncNumberSchema, 5)).resolves.toBe(true)
    await expect(isMatchingAsync(asyncNumberSchema, 'nope')).resolves.toBe(false)
  })

  it('throws when sync match sees async schema validation', () => {
    expect(() => {
      match(2).with(asyncNumberSchema, () => 'nope')
    }).toThrow('Schema validation returned a Promise')
  })

  it('throws when a sync guard returns a promise', () => {
    const numberSchema = makeSchema<number>((value): value is number => typeof value === 'number')

    expect(() => {
      match(2).with(numberSchema, async () => true, () => 'nope')
    }).toThrow('Guard returned a Promise')
  })
})
