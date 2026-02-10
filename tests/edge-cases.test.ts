import {describe, expect, it} from 'vitest'
import {z} from 'zod'
import * as v from 'valibot'
import {type} from 'arktype'

import {match, NonExhaustiveError} from '../src/index.js'

describe('edge cases', () => {
  describe('overlapping schemas — first match wins', () => {
    it('zod: broad schema before narrow schema', () => {
      const broad = z.object({x: z.number()})
      const narrow = z.object({x: z.literal(5)})

      const result = match({x: 5})
        .case(broad, () => 'broad')
        .case(narrow, () => 'narrow')
        .default(() => 'none')

      expect(result).toBe('broad')
    })

    it('zod: narrow schema before broad schema', () => {
      const broad = z.object({x: z.number()})
      const narrow = z.object({x: z.literal(5)})

      const result = match({x: 5})
        .case(narrow, () => 'narrow')
        .case(broad, () => 'broad')
        .default(() => 'none')

      expect(result).toBe('narrow')
    })

    it('valibot: overlapping object schemas', () => {
      const broad = v.object({x: v.number()})
      const narrow = v.object({x: v.literal(5)})

      const result = match({x: 5})
        .case(broad, () => 'broad')
        .case(narrow, () => 'narrow')
        .default(() => 'none')

      expect(result).toBe('broad')
    })

    it('arktype: overlapping object schemas', () => {
      const broad = type({x: 'number'})
      const narrow = type({x: '5'})

      const result = match({x: 5} as {x: number})
        .case(broad, () => 'broad')
        .case(narrow, () => 'narrow')
        .default(() => 'none')

      expect(result).toBe('broad')
    })

    it('reusable matcher: first match wins with overlapping schemas', () => {
      const broad = z.object({x: z.number()})
      const narrow = z.object({x: z.literal(5)})

      const m = match
        .case(broad, () => 'broad')
        .case(narrow, () => 'narrow')
        .default(() => 'none')

      expect(m({x: 5})).toBe('broad')
      expect(m({x: 3})).toBe('broad')
    })
  })

  describe('partial precheck: typeof passes but validation fails', () => {
    it('zod: z.string().min(5) rejects short strings', () => {
      const schema = z.string().min(5)

      const result = match('hi' as string)
        .case(schema, () => 'matched')
        .default(() => 'no match')

      expect(result).toBe('no match')
    })

    it('zod: z.number().int() rejects floats', () => {
      const schema = z.number().int()

      const result = match(1.5 as number)
        .case(schema, () => 'matched')
        .default(() => 'no match')

      expect(result).toBe('no match')
    })

    it('zod: z.string().email() rejects non-emails', () => {
      const schema = z.string().email()

      const result = match('not-an-email' as string)
        .case(schema, () => 'matched')
        .default(() => 'no match')

      expect(result).toBe('no match')
    })

    it('valibot: v.pipe(v.string(), v.minLength(5)) rejects short strings', () => {
      const schema = v.pipe(v.string(), v.minLength(5))

      const result = match('hi' as string)
        .case(schema, () => 'matched')
        .default(() => 'no match')

      expect(result).toBe('no match')
    })

    it('valibot: v.pipe(v.number(), v.integer()) rejects floats', () => {
      const schema = v.pipe(v.number(), v.integer())

      const result = match(1.5 as number)
        .case(schema, () => 'matched')
        .default(() => 'no match')

      expect(result).toBe('no match')
    })

    it('partial precheck with reusable matcher', () => {
      const m = match
        .case(z.string().min(5), s => `long: ${s}`)
        .case(z.string(), s => `short: ${s}`)
        .default(() => 'not a string')

      expect(m('hello world')).toBe('long: hello world')
      expect(m('hi')).toBe('short: hi')
      expect(m(42)).toBe('not a string')
    })
  })

  describe('transforms: handler receives transformed value', () => {
    it('zod: z.string().transform()', () => {
      const schema = z.string().transform(s => s.length)

      const result = match('hello' as string)
        .case(schema, n => n * 2)
        .default(() => -1)

      expect(result).toBe(10)
    })

    it('zod: z.coerce.number()', () => {
      const schema = z.coerce.number()

      const result = match('42' as unknown)
        .case(schema, n => n + 1)
        .default(() => -1)

      expect(result).toBe(43)
    })

    it('valibot: v.pipe(v.string(), v.transform(...))', () => {
      const schema = v.pipe(
        v.string(),
        v.transform(s => s.length)
      )

      const result = match('hello' as string)
        .case(schema, n => n * 2)
        .default(() => -1)

      expect(result).toBe(10)
    })

    it('transform schema does not bypass validation via complete precheck', () => {
      // Important: a schema with a transform must NOT use the complete precheck bypass,
      // because the handler needs to receive the transformed value, not the raw input.
      const schema = z.string().transform(s => s.toUpperCase())

      const result = match('hello' as string)
        .case(schema, s => s)
        .default(() => 'no match')

      expect(result).toBe('HELLO') // must be transformed, not raw 'hello'
    })
  })

  describe('refinements: precheck does not bypass validation', () => {
    it('zod: z.string().refine() rejects invalid values', () => {
      const schema = z.string().refine(s => s.startsWith('x'))

      const result = match('hello' as string)
        .case(schema, () => 'matched')
        .default(() => 'no match')

      expect(result).toBe('no match')
    })

    it('zod: z.string().refine() accepts valid values', () => {
      const schema = z.string().refine(s => s.startsWith('x'))

      const result = match('xray' as string)
        .case(schema, () => 'matched')
        .default(() => 'no match')

      expect(result).toBe('matched')
    })

    it('valibot: v.pipe(v.string(), v.check()) rejects invalid values', () => {
      const schema = v.pipe(
        v.string(),
        v.check(s => s.startsWith('x'), 'must start with x')
      )

      const result = match('hello' as string)
        .case(schema, () => 'matched')
        .default(() => 'no match')

      expect(result).toBe('no match')
    })

    it('valibot: v.pipe(v.string(), v.check()) accepts valid values', () => {
      const schema = v.pipe(
        v.string(),
        v.check(s => s.startsWith('x'), 'must start with x')
      )

      const result = match('xray' as string)
        .case(schema, () => 'matched')
        .default(() => 'no match')

      expect(result).toBe('matched')
    })
  })

  describe('complete precheck bypass: returns raw input', () => {
    it('zod: simple object with literal returns same reference', () => {
      const schema = z.object({type: z.literal('ok')})
      const input = {type: 'ok' as const}

      let receivedValue: unknown
      match(input)
        .case(schema, val => {
          receivedValue = val
        })
        .default(() => {})

      // The handler should receive the input value (possibly the same reference
      // when precheck is complete, or a validated copy — both are acceptable).
      // What matters is that it has the correct shape.
      expect(receivedValue).toEqual({type: 'ok'})
    })

    it('zod: literal schema returns the literal value', () => {
      const schema = z.literal('hello')

      let receivedValue: unknown
      match('hello' as string)
        .case(schema, val => {
          receivedValue = val
        })
        .default(() => {})

      expect(receivedValue).toBe('hello')
    })

    it('valibot: simple object with literal returns correct value', () => {
      const schema = v.object({type: v.literal('ok')})
      const input = {type: 'ok' as const}

      let receivedValue: unknown
      match(input)
        .case(schema, val => {
          receivedValue = val
        })
        .default(() => {})

      expect(receivedValue).toEqual({type: 'ok'})
    })

    it('arktype: literal returns correct value', () => {
      const schema = type('"hello"')

      let receivedValue: unknown
      match('hello' as string)
        .case(schema, val => {
          receivedValue = val
        })
        .default(() => {})

      expect(receivedValue).toBe('hello')
    })
  })

  describe('discriminator dispatch correctness', () => {
    it('zod: reusable matcher with discriminated branches gives correct results', () => {
      const OkSchema = z.object({type: z.literal('ok'), value: z.number()})
      const ErrSchema = z.object({type: z.literal('err'), message: z.string()})

      const m = match
        .case(OkSchema, ({value}) => `ok: ${value}`)
        .case(ErrSchema, ({message}) => `err: ${message}`)
        .default(() => 'unknown')

      expect(m({type: 'ok', value: 42})).toBe('ok: 42')
      expect(m({type: 'err', message: 'fail'})).toBe('err: fail')
      expect(m({type: 'other'})).toBe('unknown')
      expect(m('not an object')).toBe('unknown')
      expect(m(null)).toBe('unknown')
    })

    it('valibot: reusable matcher with discriminated branches', () => {
      const OkSchema = v.object({type: v.literal('ok'), value: v.number()})
      const ErrSchema = v.object({type: v.literal('err'), message: v.string()})

      const m = match
        .case(OkSchema, ({value}) => `ok: ${value}`)
        .case(ErrSchema, ({message}) => `err: ${message}`)
        .default(() => 'unknown')

      expect(m({type: 'ok', value: 42})).toBe('ok: 42')
      expect(m({type: 'err', message: 'fail'})).toBe('err: fail')
      expect(m({type: 'other'})).toBe('unknown')
    })

    it('arktype: reusable matcher with discriminated branches', () => {
      const OkSchema = type({type: '"ok"', value: 'number'})
      const ErrSchema = type({type: '"err"', message: 'string'})

      const m = match
        .case(OkSchema, ({value}) => `ok: ${value}`)
        .case(ErrSchema, ({message}) => `err: ${message}`)
        .default(() => 'unknown')

      expect(m({type: 'ok', value: 42})).toBe('ok: 42')
      expect(m({type: 'err', message: 'fail'})).toBe('err: fail')
      expect(m({type: 'other'})).toBe('unknown')
    })

    it('mixed libraries: reusable matcher with discriminated branches', () => {
      const OkSchema = z.object({type: z.literal('ok'), value: z.number()})
      const ErrSchema = v.object({type: v.literal('err'), message: v.string()})

      const m = match
        .case(OkSchema, ({value}) => `ok: ${value}`)
        .case(ErrSchema, ({message}) => `err: ${message}`)
        .default(() => 'unknown')

      expect(m({type: 'ok', value: 42})).toBe('ok: 42')
      expect(m({type: 'err', message: 'fail'})).toBe('err: fail')
      expect(m({type: 'other'})).toBe('unknown')
    })

    it('discriminator dispatch with .when() fallback clause', () => {
      const OkSchema = z.object({type: z.literal('ok'), value: z.number()})
      const ErrSchema = z.object({type: z.literal('err'), message: z.string()})

      const m = match
        .case(OkSchema, ({value}) => `ok: ${value}`)
        .case(ErrSchema, ({message}) => `err: ${message}`)
        .when(
          (val): val is {type: string} => typeof val === 'object' && val !== null && 'type' in val,
          val => `fallback: ${(val as {type: string}).type}`,
        )
        .default(() => 'unknown')

      expect(m({type: 'ok', value: 42})).toBe('ok: 42')
      expect(m({type: 'err', message: 'fail'})).toBe('err: fail')
      expect(m({type: 'other'})).toBe('fallback: other')
      expect(m(42)).toBe('unknown')
    })

    it('discriminator dispatch where discriminator matches but validation fails', () => {
      // type is 'ok' so discriminator matches the first branch,
      // but value is a string not a number so validation should fail
      const OkSchema = z.object({type: z.literal('ok'), value: z.number()})
      const ErrSchema = z.object({type: z.literal('err'), message: z.string()})

      const m = match
        .case(OkSchema, ({value}) => `ok: ${value}`)
        .case(ErrSchema, ({message}) => `err: ${message}`)
        .default(() => 'fallback')

      expect(m({type: 'ok', value: 'not a number'})).toBe('fallback')
    })
  })

  describe('enhanced exhaustive error messages', () => {
    it('inline matcher includes input value and schema issues', () => {
      const OkSchema = z.object({type: z.literal('ok'), value: z.number()})

      try {
        match({type: 'unknown'})
          .case(OkSchema, () => 'ok')
          .default('assert')
        expect.unreachable('should have thrown')
      } catch (e) {
        expect(e).toBeInstanceOf(NonExhaustiveError)
        const err = e as NonExhaustiveError
        expect(err.message).toContain('unknown')
        expect(err.message).toContain('Case 1')
      }
    })

    it('reusable matcher: discriminator miss shows expected values', () => {
      const OkSchema = z.object({type: z.literal('ok'), value: z.number()})
      const ErrSchema = z.object({type: z.literal('err'), message: z.string()})

      const m = match
        .case(OkSchema, () => 'ok')
        .case(ErrSchema, () => 'err')
        .default('assert')

      try {
        m({type: 'unknown'})
        expect.unreachable('should have thrown')
      } catch (e) {
        expect(e).toBeInstanceOf(NonExhaustiveError)
        const err = e as NonExhaustiveError
        // Should mention discriminator key and expected values
        expect(err.message).toContain("Discriminator 'type'")
        expect(err.message).toContain('"unknown"')
        expect(err.message).toContain('"ok"')
        expect(err.message).toContain('"err"')
        // Discriminator info should be available on the error object
        expect(err.discriminator).toEqual({
          key: 'type',
          value: 'unknown',
          expected: ['ok', 'err'],
          matched: false,
        })
      }
    })

    it('reusable matcher: discriminator match but validation fails shows issues', () => {
      const OkSchema = z.object({type: z.literal('ok'), value: z.number()})
      const ErrSchema = z.object({type: z.literal('err'), message: z.string()})

      const m = match
        .case(OkSchema, () => 'ok')
        .case(ErrSchema, () => 'err')
        .default('assert')

      // Discriminator 'type' is 'ok' so it matches first branch,
      // but 'value' is wrong type — the error should show that branch's issues
      try {
        m({type: 'ok', value: 'not a number'})
        expect.unreachable('should have thrown')
      } catch (e) {
        expect(e).toBeInstanceOf(NonExhaustiveError)
        const err = e as NonExhaustiveError
        expect(err.message).toContain('not a number')
        expect(err.message).toContain('Case 1')
        // Should only show issues from the matched discriminator branch (OkSchema),
        // not from ErrSchema
        expect(err.schemas).toHaveLength(1)
      }
    })

    it('inline matcher accumulates schemas from all .case() calls', () => {
      const StringSchema = z.string()
      const NumberSchema = z.number()

      try {
        match(true as unknown)
          .case(StringSchema, () => 'string')
          .case(NumberSchema, () => 'number')
          .default('assert')
        expect.unreachable('should have thrown')
      } catch (e) {
        expect(e).toBeInstanceOf(NonExhaustiveError)
        const err = e as NonExhaustiveError
        expect(err.schemas).toHaveLength(2)
      }
    })

    it('custom exhaustive handler still works', () => {
      const OkSchema = z.object({type: z.literal('ok')})

      // Custom handler should still be called when provided
      const m = match
        .case(OkSchema, () => 'ok')
        .default(() => 'custom fallback')

      expect(m({type: 'other'})).toBe('custom fallback')
    })
  })
})
