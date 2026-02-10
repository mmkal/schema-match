import {describe, expect, it} from 'vitest'
import {z} from 'zod'
import * as v from 'valibot'

import {match, matchAsync, NonExhaustiveError} from '../../src/index.js'
import type {StandardSchemaV1} from '../../src/index.js'
import {makeAsyncSchema} from '../helpers/standard-schema.js'

describe('matcher as StandardSchema', () => {
  describe('sync ReusableMatcher', () => {
    it('has a ~standard property with version 1 and vendor schematch', () => {
      const m = match.case(z.string(), s => s.length)

      expect(m['~standard'].version).toBe(1)
      expect(m['~standard'].vendor).toBe('schematch')
      expect(typeof m['~standard'].validate).toBe('function')
    })

    it('validate returns success result on match', () => {
      const m = match
        .case(z.string(), s => s.split(','))
        .case(z.number(), n => Array.from({length: n}, () => 'hi'))

      const result = m['~standard'].validate('a,b,c')
      expect(result).toEqual({value: ['a', 'b', 'c']})

      const result2 = m['~standard'].validate(3)
      expect(result2).toEqual({value: ['hi', 'hi', 'hi']})
    })

    it('validate returns failure result with issues on no match', () => {
      const m = match
        .case(z.string(), s => s.length)
        .case(z.number(), n => n + 1)

      const result = m['~standard'].validate(true) as StandardSchemaV1.FailureResult
      expect(result.issues).toBeDefined()
      expect(result.issues.length).toBeGreaterThan(0)
      expect(result.issues[0].message).toContain('Case 1')
    })

    it('validate returns failure with descriptive message for null input', () => {
      const m = match.case(z.string(), s => s.length)

      const result = m['~standard'].validate(null) as StandardSchemaV1.FailureResult
      expect(result.issues).toBeDefined()
      expect(result.issues.length).toBeGreaterThan(0)
    })

    it('can be used as a schema in another match expression', () => {
      const Inner = match
        .case(z.string(), s => s.length)
        .case(z.number(), n => n)

      // Use Inner as a schema inside match(value)
      const result = match('hello')
        .case(Inner, n => n * 2)
        .default(() => -1)

      expect(result).toBe(10) // 'hello'.length === 5, 5 * 2 === 10
    })

    it('can be used as a schema in a reusable matcher', () => {
      const StringToLength = match
        .case(z.string(), s => s.length)

      const outer = match
        .case(StringToLength, n => `length: ${n}`)
        .case(z.boolean(), b => `bool: ${b}`)
        .default(() => 'unknown')

      expect(outer('hello')).toBe('length: 5')
      expect(outer(true)).toBe('bool: true')
      expect(outer(42)).toBe('unknown')
    })

    it('rejects non-matching input when composed', () => {
      const NumberOnly = match
        .case(z.number(), n => n * 2)

      const result = match('hello')
        .case(NumberOnly, n => `doubled: ${n}`)
        .default(() => 'not a number')

      expect(result).toBe('not a number')
    })

    it('transforms are applied when used as schema', () => {
      const Transformer = match
        .case(z.string(), s => s.toUpperCase())
        .case(z.number(), n => String(n))

      // The outer match should receive the *transformed* value
      const result = match('hello')
        .case(Transformer, upper => `got: ${upper}`)
        .default(() => 'nope')

      expect(result).toBe('got: HELLO')
    })

    it('works with discriminated objects', () => {
      const Handler = match
        .case(z.object({type: z.literal('ok'), value: z.number()}), ({value}) => value)
        .case(z.object({type: z.literal('err'), message: z.string()}), ({message}) => message)

      const okResult = Handler['~standard'].validate({type: 'ok', value: 42})
      expect(okResult).toEqual({value: 42})

      const errResult = Handler['~standard'].validate({type: 'err', message: 'fail'})
      expect(errResult).toEqual({value: 'fail'})

      const failResult = Handler['~standard'].validate({type: 'unknown'}) as StandardSchemaV1.FailureResult
      expect(failResult.issues).toBeDefined()
      expect(failResult.issues.length).toBeGreaterThan(0)
    })

    it('.default() still works alongside ~standard', () => {
      const m = match
        .case(z.string(), s => s.length)
        .case(z.number(), n => n + 1)

      // Use as schema
      const schemaResult = m['~standard'].validate('hello')
      expect(schemaResult).toEqual({value: 5})

      // Use as function via .default()
      const fn = m.default('assert')
      expect(fn('hello')).toBe(5)
      expect(fn(42)).toBe(43)
    })
  })

  describe('async ReusableMatcherAsync', () => {
    it('has a ~standard property with version 1 and vendor schematch', () => {
      const m = matchAsync.case(z.string(), s => s.length)

      expect(m['~standard'].version).toBe(1)
      expect(m['~standard'].vendor).toBe('schematch')
      expect(typeof m['~standard'].validate).toBe('function')
    })

    it('validate returns promise of success result on match', async () => {
      const m = matchAsync
        .case(z.string(), s => s.length)
        .case(z.number(), n => n + 1)

      const result = await m['~standard'].validate('hello')
      expect(result).toEqual({value: 5})
    })

    it('validate returns promise of failure result on no match', async () => {
      const m = matchAsync
        .case(z.string(), s => s.length)

      const result = await m['~standard'].validate(42) as StandardSchemaV1.FailureResult
      expect(result.issues).toBeDefined()
      expect(result.issues.length).toBeGreaterThan(0)
    })

    it('works with async schemas', async () => {
      const AsyncNumber = makeAsyncSchema<number>(
        (value): value is number => typeof value === 'number'
      )

      const m = matchAsync
        .case(AsyncNumber, n => n * 2)

      const result = await m['~standard'].validate(5)
      expect(result).toEqual({value: 10})

      const fail = await m['~standard'].validate('nope') as StandardSchemaV1.FailureResult
      expect(fail.issues).toBeDefined()
    })
  })

  describe('NonExhaustiveError as FailureResult', () => {
    it('NonExhaustiveError has .issues conforming to StandardSchemaV1.FailureResult', () => {
      const m = match
        .case(z.string(), s => s.length)
        .default('reject')

      const result = m(42)
      expect(result).toBeInstanceOf(NonExhaustiveError)

      const err = result as NonExhaustiveError
      expect(err.issues).toBeDefined()
      expect(Array.isArray(err.issues)).toBe(true)
      expect(err.issues.length).toBeGreaterThan(0)
      expect(err.issues[0]).toHaveProperty('message')
    })

    it('NonExhaustiveError from .default("assert") also has .issues', () => {
      try {
        match(42).case(z.string(), () => 'str').default('assert')
        expect.unreachable('should throw')
      } catch (e) {
        expect(e).toBeInstanceOf(NonExhaustiveError)
        const err = e as NonExhaustiveError
        expect(err.issues).toBeDefined()
        expect(err.issues.length).toBeGreaterThan(0)
      }
    })
  })
})
