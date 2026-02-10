import {Schema} from 'effect'
import {describe, expect, expectTypeOf, it} from 'vitest'

import {isMatching, match} from '../../src/index.js'

describe('effect schema', () => {
  it('matches string schema', () => {
    const result = match('hello')
      .case(Schema.standardSchemaV1(Schema.String), s => `got: ${s}`)
      .otherwise(() => 'no match')

    expect(result).toBe('got: hello')
  })

  it('matches number schema', () => {
    const result = match(42)
      .case(Schema.standardSchemaV1(Schema.String), () => 'string')
      .case(Schema.standardSchemaV1(Schema.Number), n => n + 1)
      .otherwise(() => -1)

    expect(result).toBe(43)
  })

  it('matches boolean schema', () => {
    const result = match(true as unknown)
      .case(Schema.standardSchemaV1(Schema.String), () => 'string')
      .case(Schema.standardSchemaV1(Schema.Boolean), b => (b ? 'yes' : 'no'))
      .otherwise(() => 'other')

    expect(result).toBe('yes')
  })

  it('matches struct schema', () => {
    const UserSchema = Schema.standardSchemaV1(
      Schema.Struct({name: Schema.String, age: Schema.Number}),
    )

    const result = match({name: 'alice', age: 30} as unknown)
      .case(UserSchema, user => `${user.name} is ${user.age}`)
      .otherwise(() => 'not a user')

    expect(result).toBe('alice is 30')
  })

  it('falls through on struct mismatch', () => {
    const UserSchema = Schema.standardSchemaV1(
      Schema.Struct({name: Schema.String, age: Schema.Number}),
    )

    const result = match({name: 'alice'} as unknown)
      .case(UserSchema, user => `${user.name} is ${user.age}`)
      .otherwise(() => 'not a user')

    expect(result).toBe('not a user')
  })

  it('matches array schema', () => {
    const result = match([1, 2, 3] as unknown)
      .case(Schema.standardSchemaV1(Schema.Array(Schema.Number)), arr => arr.length)
      .otherwise(() => -1)

    expect(result).toBe(3)
  })

  it('matches union/literal schema', () => {
    const StatusSchema = Schema.standardSchemaV1(
      Schema.Union(Schema.Literal('active'), Schema.Literal('inactive')),
    )

    const result = match('active' as string)
      .case(StatusSchema, status => `status is ${status}`)
      .otherwise(() => 'unknown status')

    expect(result).toBe('status is active')

    const result2 = match('deleted' as string)
      .case(StatusSchema, status => `status is ${status}`)
      .otherwise(() => 'unknown status')

    expect(result2).toBe('unknown status')
  })

  it('matches tuple schema', () => {
    const PairSchema = Schema.standardSchemaV1(Schema.Tuple(Schema.String, Schema.Number))

    const result = match(['hello', 42] as unknown)
      .case(PairSchema, ([s, n]) => `${s}:${n}`)
      .otherwise(() => 'not a pair')

    expect(result).toBe('hello:42')
  })

  it('works with multiple effect schemas in order', () => {
    const result = match({name: 'bob', age: 25} as unknown)
      .case(Schema.standardSchemaV1(Schema.String), () => 'string')
      .case(Schema.standardSchemaV1(Schema.Array(Schema.Number)), () => 'number array')
      .case(
        Schema.standardSchemaV1(Schema.Struct({name: Schema.String, age: Schema.Number})),
        user => `user: ${user.name}`,
      )
      .otherwise(() => 'unknown')

    expect(result).toBe('user: bob')
  })

  it('works with guard', () => {
    const result = match(10 as unknown)
      .case(
        Schema.standardSchemaV1(Schema.Number),
        n => n > 5,
        n => `big: ${n}`,
      )
      .case(Schema.standardSchemaV1(Schema.Number), n => `small: ${n}`)
      .otherwise(() => 'not a number')

    expect(result).toBe('big: 10')

    const result2 = match(3 as unknown)
      .case(
        Schema.standardSchemaV1(Schema.Number),
        n => n > 5,
        n => `big: ${n}`,
      )
      .case(Schema.standardSchemaV1(Schema.Number), n => `small: ${n}`)
      .otherwise(() => 'not a number')

    expect(result2).toBe('small: 3')
  })

  it('works as reusable matcher', () => {
    const classify = match
      .case(Schema.standardSchemaV1(Schema.String), s => `string(${s.length})`)
      .case(Schema.standardSchemaV1(Schema.Number), n => `number(${n})`)
      .case(Schema.standardSchemaV1(Schema.Boolean), b => `bool(${b})`)
      .otherwise(() => 'other')

    expect(classify('hi')).toBe('string(2)')
    expect(classify(42)).toBe('number(42)')
    expect(classify(true)).toBe('bool(true)')
    expect(classify(null)).toBe('other')
  })

  it('works with isMatching', () => {
    const isString = isMatching(Schema.standardSchemaV1(Schema.String))
    expect(isString('hello')).toBe(true)
    expect(isString(42)).toBe(false)

    expect(isMatching(Schema.standardSchemaV1(Schema.Number), 5)).toBe(true)
    expect(isMatching(Schema.standardSchemaV1(Schema.Number), 'nope')).toBe(false)
  })

  it('infers correct types', () => {
    const UserSchema = Schema.standardSchemaV1(
      Schema.Struct({name: Schema.String, age: Schema.Number}),
    )

    match({name: 'alice', age: 30} as unknown)
      .case(UserSchema, user => {
        expectTypeOf(user).toEqualTypeOf<{readonly name: string; readonly age: number}>()
        return user
      })
      .otherwise(() => null)
  })

  it('works with schema transformations', () => {
    const TrimmedString = Schema.standardSchemaV1(Schema.Trim)

    const result = match('  hello  ' as unknown)
      .case(TrimmedString, s => `trimmed: ${s}`)
      .otherwise(() => 'not a string')

    expect(result).toBe('trimmed: hello')
  })

  it('works with optional fields', () => {
    const ConfigSchema = Schema.standardSchemaV1(
      Schema.Struct({
        host: Schema.String,
        port: Schema.optional(Schema.Number),
      }),
    )

    const result = match({host: 'localhost'} as unknown)
      .case(ConfigSchema, config => `host: ${config.host}, port: ${config.port ?? 'default'}`)
      .otherwise(() => 'invalid config')

    expect(result).toBe('host: localhost, port: default')

    const result2 = match({host: 'localhost', port: 8080} as unknown)
      .case(ConfigSchema, config => `host: ${config.host}, port: ${config.port ?? 'default'}`)
      .otherwise(() => 'invalid config')

    expect(result2).toBe('host: localhost, port: 8080')
  })
})
