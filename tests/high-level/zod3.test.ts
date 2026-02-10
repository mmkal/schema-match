import {z} from 'zod/v3'
import {describe, expect, expectTypeOf, it} from 'vitest'

import {isMatching, match} from '../../src/index.js'

describe('zod v3', () => {
  it('matches string schema', () => {
    const result = match('hello')
      .case(z.string(), s => `got: ${s}`)
      .default(() => 'no match')

    expect(result).toBe('got: hello')
  })

  it('matches number schema', () => {
    const result = match(42)
      .case(z.string(), () => 'string')
      .case(z.number(), n => n + 1)
      .default(() => -1)

    expect(result).toBe(43)
  })

  it('matches boolean schema', () => {
    const result = match(true as unknown)
      .case(z.string(), () => 'string')
      .case(z.boolean(), b => (b ? 'yes' : 'no'))
      .default(() => 'other')

    expect(result).toBe('yes')
  })

  it('matches object schema', () => {
    const UserSchema = z.object({name: z.string(), age: z.number()})

    const result = match({name: 'alice', age: 30} as unknown)
      .case(UserSchema, user => `${user.name} is ${user.age}`)
      .default(() => 'not a user')

    expect(result).toBe('alice is 30')
  })

  it('falls through on object mismatch', () => {
    const UserSchema = z.object({name: z.string(), age: z.number()})

    const result = match({name: 'alice'} as unknown)
      .case(UserSchema, user => `${user.name} is ${user.age}`)
      .default(() => 'not a user')

    expect(result).toBe('not a user')
  })

  it('matches array schema', () => {
    const result = match([1, 2, 3] as unknown)
      .case(z.array(z.number()), arr => arr.length)
      .default(() => -1)

    expect(result).toBe(3)
  })

  it('matches union/literal schema', () => {
    const StatusSchema = z.union([z.literal('active'), z.literal('inactive')])

    const result = match('active' as string)
      .case(StatusSchema, status => `status is ${status}`)
      .default(() => 'unknown status')

    expect(result).toBe('status is active')

    const result2 = match('deleted' as string)
      .case(StatusSchema, status => `status is ${status}`)
      .default(() => 'unknown status')

    expect(result2).toBe('unknown status')
  })

  it('matches tuple schema', () => {
    const PairSchema = z.tuple([z.string(), z.number()])

    const result = match(['hello', 42] as unknown)
      .case(PairSchema, ([s, n]) => `${s}:${n}`)
      .default(() => 'not a pair')

    expect(result).toBe('hello:42')
  })

  it('works with multiple zod3 schemas in order', () => {
    const result = match({name: 'bob', age: 25} as unknown)
      .case(z.string(), () => 'string')
      .case(z.array(z.number()), () => 'number array')
      .case(z.object({name: z.string(), age: z.number()}), user => `user: ${user.name}`)
      .default(() => 'unknown')

    expect(result).toBe('user: bob')
  })

  it('works with guard', () => {
    const result = match(10 as unknown)
      .case(
        z.number(),
        n => n > 5,
        n => `big: ${n}`,
      )
      .case(z.number(), n => `small: ${n}`)
      .default(() => 'not a number')

    expect(result).toBe('big: 10')

    const result2 = match(3 as unknown)
      .case(
        z.number(),
        n => n > 5,
        n => `big: ${n}`,
      )
      .case(z.number(), n => `small: ${n}`)
      .default(() => 'not a number')

    expect(result2).toBe('small: 3')
  })

  it('works as reusable matcher', () => {
    const classify = match
      .case(z.string(), s => `string(${s.length})`)
      .case(z.number(), n => `number(${n})`)
      .case(z.boolean(), b => `bool(${b})`)
      .default(() => 'other')

    expect(classify('hi')).toBe('string(2)')
    expect(classify(42)).toBe('number(42)')
    expect(classify(true)).toBe('bool(true)')
    expect(classify(null)).toBe('other')
  })

  it('works with isMatching', () => {
    const isString = isMatching(z.string())
    expect(isString('hello')).toBe(true)
    expect(isString(42)).toBe(false)

    expect(isMatching(z.number(), 5)).toBe(true)
    expect(isMatching(z.number(), 'nope')).toBe(false)
  })

  it('infers correct types', () => {
    const UserSchema = z.object({name: z.string(), age: z.number()})

    match({name: 'alice', age: 30} as unknown)
      .case(UserSchema, user => {
        expectTypeOf(user).toEqualTypeOf<{name: string; age: number}>()
        return user
      })
      .default(() => null)
  })

  it('works with schema transformations', () => {
    const TrimmedString = z.string().transform(s => s.trim())

    const result = match('  hello  ' as unknown)
      .case(TrimmedString, s => `trimmed: ${s}`)
      .default(() => 'not a string')

    expect(result).toBe('trimmed: hello')
  })

  it('works with optional fields', () => {
    const ConfigSchema = z.object({
      host: z.string(),
      port: z.number().optional(),
    })

    const result = match({host: 'localhost'} as unknown)
      .case(ConfigSchema, config => `host: ${config.host}, port: ${config.port ?? 'default'}`)
      .default(() => 'invalid config')

    expect(result).toBe('host: localhost, port: default')

    const result2 = match({host: 'localhost', port: 8080} as unknown)
      .case(ConfigSchema, config => `host: ${config.host}, port: ${config.port ?? 'default'}`)
      .default(() => 'invalid config')

    expect(result2).toBe('host: localhost, port: 8080')
  })
})
