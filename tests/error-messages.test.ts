import {describe, expect, it} from 'vitest'
import {z} from 'zod'
import * as v from 'valibot'
import {type} from 'arktype'

import {match, matchAsync, NonExhaustiveError} from '../src/index.js'

/** Helper: extract the error message from a throwing function */
function getError(fn: () => unknown): NonExhaustiveError {
  try {
    fn()
    throw new Error('Expected function to throw')
  } catch (e) {
    if (e instanceof NonExhaustiveError) return e
    throw e
  }
}

async function getAsyncError(fn: () => Promise<unknown>): Promise<NonExhaustiveError> {
  try {
    await fn()
    throw new Error('Expected function to throw')
  } catch (e) {
    if (e instanceof NonExhaustiveError) return e
    throw e
  }
}

describe('error message snapshots', () => {
  describe('inline matcher', () => {
    it('simple type mismatch', () => {
      const err = getError(() =>
        match(42)
          .case(z.string(), () => 'string')
          .default('assert')
      )
      expect(err.message).toMatchInlineSnapshot(`
        "Schema matching error: no schema matches value 42
          Case 1:
            ✖ Invalid input: expected string, received number"
      `)
    })

    it('object with wrong field type', () => {
      const err = getError(() =>
        match({name: 123})
          .case(z.object({name: z.string()}), () => 'ok')
          .default('assert')
      )
      expect(err.message).toMatchInlineSnapshot(`
        "Schema matching error: no schema matches value {"name":123}
          Case 1:
            ✖ Invalid input: expected string, received number → at name"
      `)
    })

    it('multiple schemas, none match', () => {
      const err = getError(() =>
        match(true as unknown)
          .case(z.string(), () => 'string')
          .case(z.number(), () => 'number')
          .case(z.object({x: z.number()}), () => 'object')
          .default('assert')
      )
      expect(err.message).toMatchInlineSnapshot(`
        "Schema matching error: no schema matches value true
          Case 1:
            ✖ Invalid input: expected string, received boolean
          Case 2:
            ✖ Invalid input: expected number, received boolean
          Case 3:
            ✖ Invalid input: expected object, received boolean"
      `)
    })

    it('valibot schemas', () => {
      const err = getError(() =>
        match('hello')
          .case(v.number(), () => 'number')
          .case(v.boolean(), () => 'boolean')
          .default('assert')
      )
      expect(err.message).toMatchInlineSnapshot(`
        "Schema matching error: no schema matches value "hello"
          Case 1:
            ✖ Invalid type: Expected number but received "hello"
          Case 2:
            ✖ Invalid type: Expected boolean but received "hello""
      `)
    })

    it('arktype schemas', () => {
      const err = getError(() =>
        match('hello')
          .case(type('number'), () => 'number')
          .default('assert')
      )
      expect(err.message).toMatchInlineSnapshot(`
        "Schema matching error: no schema matches value "hello"
          Case 1:
            ✖ must be a number (was a string) → at [0]"
      `)
    })
  })

  describe('reusable matcher — discriminator miss', () => {
    it('zod: unknown discriminator value', () => {
      const m = match
        .case(z.object({type: z.literal('ok'), value: z.number()}), () => 'ok')
        .case(z.object({type: z.literal('err'), message: z.string()}), () => 'err')
        .default('assert')

      const err = getError(() => m({type: 'unknown'}))
      expect(err.message).toMatchInlineSnapshot(`
        "Schema matching error: no schema matches value {"type":"unknown"}
          Discriminator 'type' has value "unknown" but expected one of: "ok", "err""
      `)
    })

    it('valibot: unknown discriminator value', () => {
      const m = match
        .case(v.object({kind: v.literal('a'), x: v.number()}), () => 'a')
        .case(v.object({kind: v.literal('b'), y: v.string()}), () => 'b')
        .case(v.object({kind: v.literal('c'), z: v.boolean()}), () => 'c')
        .default('assert')

      const err = getError(() => m({kind: 'z'}))
      expect(err.message).toMatchInlineSnapshot(`
        "Schema matching error: no schema matches value {"kind":"z"}
          Discriminator 'kind' has value "z" but expected one of: "a", "b", "c""
      `)
    })

    it('arktype: unknown discriminator value', () => {
      const m = match
        .case(type({status: '"active"', id: 'number'}), () => 'active')
        .case(type({status: '"inactive"', reason: 'string'}), () => 'inactive')
        .default('assert')

      const err = getError(() => m({status: 'pending'}))
      expect(err.message).toMatchInlineSnapshot(`
        "Schema matching error: no schema matches value {"status":"pending"}
          Discriminator 'status' has value "pending" but expected one of: "active", "inactive""
      `)
    })
  })

  describe('reusable matcher — discriminator match but validation fails', () => {
    it('zod: right discriminator, wrong field type', () => {
      const m = match
        .case(z.object({type: z.literal('ok'), value: z.number()}), () => 'ok')
        .case(z.object({type: z.literal('err'), message: z.string()}), () => 'err')
        .default('assert')

      const err = getError(() => m({type: 'ok', value: 'not-a-number'}))
      expect(err.message).toMatchInlineSnapshot(`
        "Schema matching error: no schema matches value {"type":"ok","value":"not-a-number"}
          Discriminator 'type' matched "ok" (options: "ok", "err") but failed validation:
          Case 1:
            ✖ Invalid input: expected number, received string → at value"
      `)
    })

    it('zod: right discriminator, missing required field', () => {
      const m = match
        .case(z.object({type: z.literal('ok'), value: z.number()}), () => 'ok')
        .case(z.object({type: z.literal('err'), message: z.string()}), () => 'err')
        .default('assert')

      const err = getError(() => m({type: 'err'}))
      expect(err.message).toMatchInlineSnapshot(`
        "Schema matching error: no schema matches value {"type":"err"}
          Discriminator 'type' matched "err" (options: "ok", "err") but failed validation:
          Case 1:
            ✖ Invalid input: expected string, received undefined → at message"
      `)
    })
  })

  describe('reusable matcher — no discriminator', () => {
    it('non-object schemas have no dispatch table', () => {
      const m = match
        .case(z.string(), () => 'string')
        .case(z.number(), () => 'number')
        .default('assert')

      const err = getError(() => m(true))
      expect(err.message).toMatchInlineSnapshot(`
        "Schema matching error: no schema matches value true
          Case 1:
            ✖ Invalid input: expected string, received boolean
          Case 2:
            ✖ Invalid input: expected number, received boolean"
      `)
    })
  })

  describe('non-serializable input', () => {
    it('circular reference in input', () => {
      const circular: any = {a: 1}
      circular.self = circular

      const m = match
        .case(z.string(), () => 'string')
        .default('assert')

      const err = getError(() => m(circular))
      // Should not throw during error construction, should fall back to String()
      expect(err.message).toMatchInlineSnapshot(`
        "Schema matching error: no schema matches value [object Object]
          Case 1:
            ✖ Invalid input: expected string, received object"
      `)
    })
  })

  describe('async matcher', () => {
    it('includes schemas in error', async () => {
      const err = await getAsyncError(() =>
        matchAsync({type: 'unknown'})
          .case(z.object({type: z.literal('ok')}), () => 'ok')
          .default('assert')
      )
      expect(err.message).toMatchInlineSnapshot(`
        "Schema matching error: no schema matches value {"type":"unknown"}
          Case 1:
            ✖ Invalid input: expected "ok" → at type"
      `)
    })
  })
})
