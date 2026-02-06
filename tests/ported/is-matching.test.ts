import {describe, expect, expectTypeOf, it} from 'vitest'
import {z} from 'zod'

import {isMatching} from '../../src/index.js'

describe('ported/is-matching', () => {
  const blogSchema = z.object({
    title: z.string(),
    author: z.object({name: z.string(), age: z.number()}),
  })

  it('builds a type guard function when given one argument', () => {
    const something: unknown = {
      title: 'Hello',
      author: {name: 'Gabriel', age: 27},
    }

    const isBlogPost = isMatching(blogSchema)

    if (isBlogPost(something)) {
      expectTypeOf(something).toEqualTypeOf<{
        title: string
        author: {name: string; age: number}
      }>()
    } else {
      throw new Error('Expected blog post to match schema.')
    }
  })

  it('acts as a type guard when given two arguments', () => {
    const something: unknown = {
      title: 'Hello',
      author: {name: 'Gabriel', age: 27},
    }

    if (isMatching(blogSchema, something)) {
      expectTypeOf(something).toEqualTypeOf<{
        title: string
        author: {name: string; age: number}
      }>()
    } else {
      throw new Error('Expected blog post to match schema.')
    }
  })

  it('returns false when value does not match', () => {
    expect(isMatching(blogSchema, {title: 'Oops', author: {name: 'Gabriel'}})).toBe(false)
  })
})
