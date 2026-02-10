import {describe, expect, it} from 'vitest'
import {type} from 'arktype'
import * as v from 'valibot'
import {z} from 'zod'

import {match} from '../../src/index.js'
import type {StandardSchemaV1} from '../../src/index.js'

describe('high-level/basic-usage', () => {
  it('matches standard-schema libraries in order', () => {
    const stringResult = match('hello')
      .case(z.string(), s => `hello ${s.substring(1, 3)}`)
      .case(v.array(v.number()), arr => `got ${arr.length} numbers`)
      .case(type({msg: 'string'}), obj => obj.msg)
      .default(() => 'unexpected')

    expect(stringResult).toBe('hello el')

    const arrayResult = match([1, 2, 3])
      .case(z.string(), s => `hello ${s.substring(1, 3)}`)
      .case(v.array(v.number()), arr => `got ${arr.length} numbers`)
      .case(type({msg: 'string'}), obj => obj.msg)
      .default(() => 'unexpected')

    expect(arrayResult).toBe('got 3 numbers')

    const objectResult = match({msg: 'yo'})
      .case(z.string(), s => `hello ${s.substring(1, 3)}`)
      .case(v.array(v.number()), arr => `got ${arr.length} numbers`)
      .case(type({msg: 'string'}), obj => obj.msg)
      .default(() => 'unexpected')

    expect(objectResult).toBe('yo')

    const fallbackResult = match(42)
      .case(z.string(), s => `hello ${s.substring(1, 3)}`)
      .case(v.array(v.number()), arr => `got ${arr.length} numbers`)
      .case(type({msg: 'string'}), obj => obj.msg)
      .default(() => 'unexpected')

    expect(fallbackResult).toBe('unexpected')
  })

  it("rahul idea", () => {
    const myMatcher = match
      .case(z.string(), s => `hello ${s.substring(1, 3)}`)
      .case(v.array(v.number()), arr => `got ${arr.length} numbers`)
      .case(type({msg: 'string'}), obj => obj.msg)
      .default(() => 'unexpected')

    // type exhaustiveness via .default('never'):
    // const myMatcher2 = match
    //   .case(z.string(), s => `hello ${s.substring(1, 3)}`)
    //   .case(v.array(v.number()), arr => `got ${arr.length} numbers`)
    //   .case(type({msg: 'string'}), obj => obj.msg)
    //   .default('never')
    // => (input: string | number[] | {msg: string}) => string

    expect(myMatcher('hello')).toBe('hello el')
    expect(myMatcher([1, 2, 3])).toBe('got 3 numbers')
    expect(myMatcher({msg: 'yo'})).toBe('yo')
    expect(myMatcher(42)).toBe('unexpected')
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
      .case(ParseNumber, value => value + 1)
      .default(() => 0)

    expect(result).toBe(42)
  })
})
