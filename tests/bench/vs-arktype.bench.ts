import {bench, describe} from 'vitest'
import {type, match as arktypeMatch} from 'arktype'
import {z} from 'zod'
import {P, match as tsPatternMatch} from 'ts-pattern'

import {match as schematch} from '../../src/index.js'

// --- Primitive type discrimination (arktype's strength) ---

const ArkStringOrPrimitive = type('string | number | boolean | null')
const ArkBigint = type('bigint')
const ArkObject = type('object')

const ZodStringOrPrimitive = z.union([z.string(), z.number(), z.boolean(), z.null()])
const ZodBigint = z.bigint()
const ZodObject = z.object({}).passthrough()

const arktypeNativePrimitive = arktypeMatch({
  'string | number | boolean | null': (v: string | number | boolean | null) => v,
  bigint: (b: bigint) => `${b}n`,
  object: (o: object) => JSON.stringify(o),
  default: 'assert',
})

const schematchArktypePrimitive = schematch
  .case(ArkStringOrPrimitive, v => v)
  .case(ArkBigint, (b: bigint) => `${b}n`)
  .case(ArkObject, (o: object) => JSON.stringify(o))
  .default('assert')

const schematchZodPrimitive = schematch
  .case(ZodStringOrPrimitive, v => v)
  .case(ZodBigint, (b: bigint) => `${b}n`)
  .case(ZodObject, (o: object) => JSON.stringify(o))
  .default('assert')

const tsPatternPrimitive = (value: unknown) =>
  tsPatternMatch(value)
    .with(P.union(P.string, P.number, P.boolean, null), v => v)
    .with(P.bigint, v => `${v}n`)
    .with({}, o => JSON.stringify(o))
    .otherwise(() => {
      throw new Error('unexpected')
    })

// --- Nested object matching (schematch's strength) ---

type Data =
  | {type: 'text'; content: string}
  | {type: 'img'; src: string}

type Result =
  | {type: 'ok'; data: Data}
  | {type: 'error'; error: Error}

const ArkError = type({type: '"error"', error: type.instanceOf(Error)})
const ArkOkText = type({type: '"ok"', data: {type: '"text"', content: 'string'}})
const ArkOkImg = type({type: '"ok"', data: {type: '"img"', src: 'string'}})

const resultText: Result = {type: 'ok', data: {type: 'text', content: 'hello'}}
const resultImg: Result = {type: 'ok', data: {type: 'img', src: '/hero.png'}}
const resultError: Result = {type: 'error', error: new Error('boom')}

const schematchArktypeResultInline = (result: Result) =>
  schematch(result)
    .case(ArkError, () => 'error')
    .case(ArkOkText, ({data}) => data.content)
    .case(ArkOkImg, ({data}) => data.src)
    .default('assert')

const schematchArktypeResultReusable = schematch
  .case(ArkError, () => 'error')
  .case(ArkOkText, ({data}) => data.content)
  .case(ArkOkImg, ({data}) => data.src)
  .default('assert')

// arktype .case() with pre-built type references (avoids re-parsing definitions)
const arktypeNativeResultCase = arktypeMatch
  .case(ArkError, () => 'error')
  .case(ArkOkText, ({data}) => data.content)
  .case(ArkOkImg, ({data}) => data.src)
  .default('assert')

// arktype .at() discriminated matching (fastest path for single-key discrimination)
const arktypeNativeResultAt = arktypeMatch
  .at('type')
  .match({
    '"error"': () => 'error',
    '"ok"': (v: {type: 'ok'}) => {
      const data = (v as Result & {type: 'ok'}).data
      return data.type === 'text' ? data.content : data.src
    },
    default: 'assert',
  })

type State =
  | {status: 'idle'}
  | {status: 'loading'; startTime: number}
  | {status: 'success'; data: string}
  | {status: 'error'; error: Error}

type Event =
  | {type: 'fetch'}
  | {type: 'success'; data: string}
  | {type: 'error'; error: Error}
  | {type: 'cancel'}

const ArkLoading = type({status: '"loading"', startTime: 'number'})
const ArkSuccessEvent = type({type: '"success"', data: 'string'})
const ArkErrorEvent = type({type: '"error"', error: type.instanceOf(Error)})
const ArkIdle = type({status: '"idle"'})
const ArkSuccessState = type({status: '"success"', data: 'string'})
const ArkErrorState = type({status: '"error"', error: type.instanceOf(Error)})
const ArkFetch = type({type: '"fetch"'})
const ArkCancel = type({type: '"cancel"'})

const ArkLoadingSuccess = type([ArkLoading, ArkSuccessEvent])
const ArkLoadingError = type([ArkLoading, ArkErrorEvent])
const ArkNotLoadingFetch = type([ArkIdle.or(ArkSuccessState).or(ArkErrorState), ArkFetch])
const ArkLoadingCancel = type([ArkLoading, ArkCancel])

const reducerSchematchInline = (state: State, event: Event): State =>
  schematch<[State, Event]>([state, event])
    .case(ArkLoadingSuccess, ([, e]) => ({status: 'success', data: e.data} as const))
    .case(ArkLoadingError, ([, e]) => ({status: 'error', error: e.error} as const))
    .case(ArkNotLoadingFetch, () => ({status: 'loading', startTime: Date.now()} as const))
    .case(ArkLoadingCancel, () => ({status: 'idle'} as const))
    .default(() => state)

const reducerSchematchReusable = schematch
  .case(ArkLoadingSuccess, ([, e]) => ({status: 'success', data: e.data} as const))
  .case(ArkLoadingError, ([, e]) => ({status: 'error', error: e.error} as const))
  .case(ArkNotLoadingFetch, () => ({status: 'loading', startTime: Date.now()} as const))
  .case(ArkLoadingCancel, () => ({status: 'idle'} as const))
  .default(value => (value as [State, Event])[0])

// arktype .case() with pre-built type references
const reducerArktypeNativeCase = arktypeMatch
  .case(ArkLoadingSuccess, ([, e]) => ({status: 'success', data: e.data} as const))
  .case(ArkLoadingError, ([, e]) => ({status: 'error', error: e.error} as const))
  .case(ArkNotLoadingFetch, () => ({status: 'loading', startTime: Date.now()} as const))
  .case(ArkLoadingCancel, () => ({status: 'idle'} as const))
  .default(v => v as State)

const loadingState: State = {status: 'loading', startTime: 1}
const successEvent: Event = {type: 'success', data: 'done'}
const errorEvent: Event = {type: 'error', error: new Error('nope')}
const idleState: State = {status: 'idle'}
const fetchEvent: Event = {type: 'fetch'}

describe('vs arktype native: primitive type discrimination', () => {
  bench('arktype native match', () => {
    arktypeNativePrimitive('foo')
    arktypeNativePrimitive(5n)
    arktypeNativePrimitive({a: 1})
  })

  bench('schematch arktype (reusable)', () => {
    schematchArktypePrimitive('foo')
    schematchArktypePrimitive(5n)
    schematchArktypePrimitive({a: 1})
  })

  bench('schematch zod (reusable)', () => {
    schematchZodPrimitive('foo')
    schematchZodPrimitive(5n)
    schematchZodPrimitive({a: 1})
  })

  bench('ts-pattern', () => {
    tsPatternPrimitive('foo')
    tsPatternPrimitive(5n)
    tsPatternPrimitive({a: 1})
  })
})

describe('vs arktype native: result matching', () => {
  bench('schematch arktype (inline)', () => {
    schematchArktypeResultInline(resultText)
    schematchArktypeResultInline(resultImg)
    schematchArktypeResultInline(resultError)
  })

  bench('schematch arktype (reusable)', () => {
    schematchArktypeResultReusable(resultText)
    schematchArktypeResultReusable(resultImg)
    schematchArktypeResultReusable(resultError)
  })

  bench('arktype native .case()', () => {
    arktypeNativeResultCase(resultText)
    arktypeNativeResultCase(resultImg)
    arktypeNativeResultCase(resultError)
  })

  bench('arktype native .at("type")', () => {
    arktypeNativeResultAt(resultText)
    arktypeNativeResultAt(resultImg)
    arktypeNativeResultAt(resultError)
  })
})

describe('vs arktype native: reducer matching', () => {
  bench('schematch arktype (inline)', () => {
    reducerSchematchInline(loadingState, successEvent)
    reducerSchematchInline(loadingState, errorEvent)
    reducerSchematchInline(idleState, fetchEvent)
  })

  bench('schematch arktype (reusable)', () => {
    reducerSchematchReusable([loadingState, successEvent])
    reducerSchematchReusable([loadingState, errorEvent])
    reducerSchematchReusable([idleState, fetchEvent])
  })

  bench('arktype native .case()', () => {
    reducerArktypeNativeCase([loadingState, successEvent])
    reducerArktypeNativeCase([loadingState, errorEvent])
    reducerArktypeNativeCase([idleState, fetchEvent])
  })
})
