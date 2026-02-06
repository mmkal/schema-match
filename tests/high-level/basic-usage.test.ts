import {describe, expect, it} from 'vitest'
import {type} from 'arktype'
import * as v from 'valibot'
import {z} from 'zod'

import {match} from '../../src/index.js'
import type {StandardSchemaV1} from '../../src/index.js'

describe('high-level/basic-usage', () => {
  it('matches standard-schema libraries in order', () => {
    const String = z.string()
    const NumberArray = v.array(v.number())
    const Message = type({msg: 'string'})

    const stringResult = match('hello')
      .with(String, s => `hello ${s.substring(1, 3)}`)
      .with(NumberArray, arr => `got ${arr.length} numbers`)
      .with(Message, obj => obj.msg)
      .otherwise(() => 'unexpected')

    expect(stringResult).toBe('hello el')

    const arrayResult = match([1, 2, 3])
      .with(String, s => `hello ${s.substring(1, 3)}`)
      .with(NumberArray, arr => `got ${arr.length} numbers`)
      .with(Message, obj => obj.msg)
      .otherwise(() => 'unexpected')

    expect(arrayResult).toBe('got 3 numbers')

    const objectResult = match({msg: 'yo'})
      .with(String, s => `hello ${s.substring(1, 3)}`)
      .with(NumberArray, arr => `got ${arr.length} numbers`)
      .with(Message, obj => obj.msg)
      .otherwise(() => 'unexpected')

    expect(objectResult).toBe('yo')

    const fallbackResult = match(42)
      .with(String, s => `hello ${s.substring(1, 3)}`)
      .with(NumberArray, arr => `got ${arr.length} numbers`)
      .with(Message, obj => obj.msg)
      .otherwise(() => 'unexpected')

    expect(fallbackResult).toBe('unexpected')
  })

  it('uses schema output values in handlers', () => {
    const ParseNumber: StandardSchemaV1<unknown, number> = {
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
      .with(ParseNumber, value => value + 1)
      .otherwise(() => 0)

    expect(result).toBe(42)
  })
})
