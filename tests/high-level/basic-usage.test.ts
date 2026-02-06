import {describe, expect, it} from 'vitest'
import {type} from 'arktype'
import * as v from 'valibot'
import {z} from 'zod'

import {match} from '../../src/index.js'
import type {StandardSchemaV1} from '../../src/index.js'

describe('high-level/basic-usage', () => {
  it('matches standard-schema libraries in order', () => {
    const stringSchema = z.string()
    const numberArraySchema = v.array(v.number())
    const messageSchema = type({msg: 'string'})

    const cases = [
      {input: 'hello', expected: 'hello el'},
      {input: [1, 2, 3], expected: 'got 3 numbers'},
      {input: {msg: 'yo'}, expected: 'yo'},
      {input: 42, expected: 'unexpected'},
    ]

    cases.forEach(({input, expected}) => {
      const result = match(input)
        .with(stringSchema, s => `hello ${s.substring(1, 3)}`)
        .with(numberArraySchema, arr => `got ${arr.length} numbers`)
        .with(messageSchema, obj => obj.msg)
        .otherwise(() => 'unexpected')

      expect(result).toBe(expected)
    })
  })

  it('uses schema output values in handlers', () => {
    const parseNumberSchema: StandardSchemaV1<unknown, number> = {
      '~standard': {
        version: 1,
        vendor: 'example',
        validate: value =>
          typeof value === 'string'
            ? {value: Number.parseInt(value, 10)}
            : {issues: [{message: 'Expected a string'}]},
      },
    }

    const result = match('41')
      .with(parseNumberSchema, value => value + 1)
      .otherwise(() => 0)

    expect(result).toBe(42)
  })
})
