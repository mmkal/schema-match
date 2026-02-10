import {bench, describe} from 'vitest'
import {P, match as tsPatternMatch} from 'ts-pattern'
import * as v from 'valibot'
import {z as zm} from 'zod/mini'
import {z} from 'zod'
import {type} from 'arktype'

import {match as schemaMatch} from '../../src/index.js'

type Data =
  | {type: 'text'; content: string}
  | {type: 'img'; src: string}

type Result =
  | {type: 'ok'; data: Data}
  | {type: 'error'; error: Error}

const ZodError = z.object({type: z.literal('error'), error: z.instanceof(Error)})
const ZodOkText = z.object({
  type: z.literal('ok'),
  data: z.object({type: z.literal('text'), content: z.string()}),
})
const ZodOkImg = z.object({
  type: z.literal('ok'),
  data: z.object({type: z.literal('img'), src: z.string()}),
})

const ValibotError = v.object({type: v.literal('error'), error: v.instance(Error)})
const ValibotOkText = v.object({
  type: v.literal('ok'),
  data: v.object({type: v.literal('text'), content: v.string()}),
})
const ValibotOkImg = v.object({
  type: v.literal('ok'),
  data: v.object({type: v.literal('img'), src: v.string()}),
})

const ZodMiniError = zm.object({type: zm.literal('error'), error: zm.instanceof(Error)})
const ZodMiniOkText = zm.object({
  type: zm.literal('ok'),
  data: zm.object({type: zm.literal('text'), content: zm.string()}),
})
const ZodMiniOkImg = zm.object({
  type: zm.literal('ok'),
  data: zm.object({type: zm.literal('img'), src: zm.string()}),
})

const ArkError = type({type: '"error"', error: type.instanceOf(Error)})
const ArkOkText = type({type: '"ok"', data: {type: '"text"', content: 'string'}})
const ArkOkImg = type({type: '"ok"', data: {type: '"img"', src: 'string'}})

const resultText: Result = {type: 'ok', data: {type: 'text', content: 'hello'}}
const resultImg: Result = {type: 'ok', data: {type: 'img', src: '/hero.png'}}
const resultError: Result = {type: 'error', error: new Error('boom')}

const schemaMatchZodResultInline = (result: Result) =>
  schemaMatch(result)
    .with(ZodError, () => 'error')
    .with(ZodOkText, ({data}) => data.content)
    .with(ZodOkImg, ({data}) => data.src)
    .exhaustive()

const schemaMatchValibotResultInline = (result: Result) =>
  schemaMatch(result)
    .with(ValibotError, () => 'error')
    .with(ValibotOkText, ({data}) => data.content)
    .with(ValibotOkImg, ({data}) => data.src)
    .exhaustive()

const schemaMatchZodMiniResultInline = (result: Result) =>
  schemaMatch(result)
    .with(ZodMiniError, () => 'error')
    .with(ZodMiniOkText, ({data}) => data.content)
    .with(ZodMiniOkImg, ({data}) => data.src)
    .exhaustive()

const schemaMatchZodResultReusable = schemaMatch
  .with(ZodError, () => 'error')
  .with(ZodOkText, ({data}) => data.content)
  .with(ZodOkImg, ({data}) => data.src)
  .exhaustive()

const schemaMatchValibotResultReusable = schemaMatch
  .with(ValibotError, () => 'error')
  .with(ValibotOkText, ({data}) => data.content)
  .with(ValibotOkImg, ({data}) => data.src)
  .exhaustive()

const schemaMatchZodMiniResultReusable = schemaMatch
  .with(ZodMiniError, () => 'error')
  .with(ZodMiniOkText, ({data}) => data.content)
  .with(ZodMiniOkImg, ({data}) => data.src)
  .exhaustive()

const schemaMatchArktypeResultInline = (result: Result) =>
  schemaMatch(result)
    .with(ArkError, () => 'error')
    .with(ArkOkText, ({data}) => data.content)
    .with(ArkOkImg, ({data}) => data.src)
    .exhaustive()

const schemaMatchArktypeResultReusable = schemaMatch
  .with(ArkError, () => 'error')
  .with(ArkOkText, ({data}) => data.content)
  .with(ArkOkImg, ({data}) => data.src)
  .exhaustive()

const tsPatternResult = (result: Result) =>
  tsPatternMatch(result)
    .with({type: 'error'}, () => 'error')
    .with({type: 'ok', data: {type: 'text'}}, ({data}) => data.content)
    .with({type: 'ok', data: {type: 'img'}}, ({data}) => data.src)
    .exhaustive()

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

const ZodIdle = z.object({status: z.literal('idle')})
const ZodLoading = z.object({status: z.literal('loading'), startTime: z.number()})
const ZodSuccessState = z.object({status: z.literal('success'), data: z.string()})
const ZodErrorState = z.object({status: z.literal('error'), error: z.instanceof(Error)})

const ZodFetch = z.object({type: z.literal('fetch')})
const ZodSuccessEvent = z.object({type: z.literal('success'), data: z.string()})
const ZodErrorEvent = z.object({type: z.literal('error'), error: z.instanceof(Error)})
const ZodCancel = z.object({type: z.literal('cancel')})

const ZodLoadingSuccess = z.tuple([ZodLoading, ZodSuccessEvent])
const ZodLoadingError = z.tuple([ZodLoading, ZodErrorEvent])
const ZodNotLoadingFetch = z.tuple([z.union([ZodIdle, ZodSuccessState, ZodErrorState]), ZodFetch])
const ZodLoadingCancel = z.tuple([ZodLoading, ZodCancel])

const ArkIdle = type({status: '"idle"'})
const ArkLoading = type({status: '"loading"', startTime: 'number'})
const ArkSuccessState = type({status: '"success"', data: 'string'})
const ArkErrorState = type({status: '"error"', error: type.instanceOf(Error)})

const ArkFetch = type({type: '"fetch"'})
const ArkSuccessEvent = type({type: '"success"', data: 'string'})
const ArkErrorEvent = type({type: '"error"', error: type.instanceOf(Error)})
const ArkCancel = type({type: '"cancel"'})

const ArkLoadingSuccess = type([ArkLoading, ArkSuccessEvent])
const ArkLoadingError = type([ArkLoading, ArkErrorEvent])
const ArkNotLoadingFetch = type([ArkIdle.or(ArkSuccessState).or(ArkErrorState), ArkFetch])
const ArkLoadingCancel = type([ArkLoading, ArkCancel])

const reducerZodInline = (state: State, event: Event): State =>
  schemaMatch<[State, Event]>([state, event])
    .with(ZodLoadingSuccess, ([, e]) => ({status: 'success', data: e.data} as const))
    .with(ZodLoadingError, ([, e]) => ({status: 'error', error: e.error} as const))
    .with(ZodNotLoadingFetch, () => ({status: 'loading', startTime: Date.now()} as const))
    .with(ZodLoadingCancel, () => ({status: 'idle'} as const))
    .otherwise(() => state)

const reducerZodReusable = schemaMatch
  .with(ZodLoadingSuccess, ([, e]) => ({status: 'success', data: e.data} as const))
  .with(ZodLoadingError, ([, e]) => ({status: 'error', error: e.error} as const))
  .with(ZodNotLoadingFetch, () => ({status: 'loading', startTime: Date.now()} as const))
  .with(ZodLoadingCancel, () => ({status: 'idle'} as const))
  .otherwise(value => (value as [State, Event])[0])

const reducerArktypeInline = (state: State, event: Event): State =>
  schemaMatch<[State, Event]>([state, event])
    .with(ArkLoadingSuccess, ([, e]) => ({status: 'success', data: e.data} as const))
    .with(ArkLoadingError, ([, e]) => ({status: 'error', error: e.error} as const))
    .with(ArkNotLoadingFetch, () => ({status: 'loading', startTime: Date.now()} as const))
    .with(ArkLoadingCancel, () => ({status: 'idle'} as const))
    .otherwise(() => state)

const reducerArktypeReusable = schemaMatch
  .with(ArkLoadingSuccess, ([, e]) => ({status: 'success', data: e.data} as const))
  .with(ArkLoadingError, ([, e]) => ({status: 'error', error: e.error} as const))
  .with(ArkNotLoadingFetch, () => ({status: 'loading', startTime: Date.now()} as const))
  .with(ArkLoadingCancel, () => ({status: 'idle'} as const))
  .otherwise(value => (value as [State, Event])[0])

const reducerTsPattern = (state: State, event: Event): State =>
  tsPatternMatch<[State, Event]>([state, event])
    .with([{status: 'loading'}, {type: 'success'}], ([, e]) => ({status: 'success', data: e.data} as const))
    .with([{status: 'loading'}, {type: 'error'}], ([, e]) => ({status: 'error', error: e.error} as const))
    .with([{status: P.not('loading')}, {type: 'fetch'}], () => ({
      status: 'loading',
      startTime: Date.now(),
    } as const))
    .with([{status: 'loading'}, {type: 'cancel'}], () => ({status: 'idle'} as const))
    .otherwise(() => state)

const loadingState: State = {status: 'loading', startTime: 1}
const successEvent: Event = {type: 'success', data: 'done'}
const errorEvent: Event = {type: 'error', error: new Error('nope')}
const idleState: State = {status: 'idle'}
const fetchEvent: Event = {type: 'fetch'}

describe('result matcher (inline vs reusable)', () => {
  bench('schema-match zod (inline)', () => {
    schemaMatchZodResultInline(resultText)
    schemaMatchZodResultInline(resultImg)
    schemaMatchZodResultInline(resultError)
  })

  bench('schema-match zod (reusable)', () => {
    schemaMatchZodResultReusable(resultText)
    schemaMatchZodResultReusable(resultImg)
    schemaMatchZodResultReusable(resultError)
  })

  bench('schema-match valibot (inline)', () => {
    schemaMatchValibotResultInline(resultText)
    schemaMatchValibotResultInline(resultImg)
    schemaMatchValibotResultInline(resultError)
  })

  bench('schema-match valibot (reusable)', () => {
    schemaMatchValibotResultReusable(resultText)
    schemaMatchValibotResultReusable(resultImg)
    schemaMatchValibotResultReusable(resultError)
  })

  bench('schema-match zod-mini (inline)', () => {
    schemaMatchZodMiniResultInline(resultText)
    schemaMatchZodMiniResultInline(resultImg)
    schemaMatchZodMiniResultInline(resultError)
  })

  bench('schema-match zod-mini (reusable)', () => {
    schemaMatchZodMiniResultReusable(resultText)
    schemaMatchZodMiniResultReusable(resultImg)
    schemaMatchZodMiniResultReusable(resultError)
  })

  bench('schema-match arktype (inline)', () => {
    schemaMatchArktypeResultInline(resultText)
    schemaMatchArktypeResultInline(resultImg)
    schemaMatchArktypeResultInline(resultError)
  })

  bench('schema-match arktype (reusable)', () => {
    schemaMatchArktypeResultReusable(resultText)
    schemaMatchArktypeResultReusable(resultImg)
    schemaMatchArktypeResultReusable(resultError)
  })

  bench('ts-pattern', () => {
    tsPatternResult(resultText)
    tsPatternResult(resultImg)
    tsPatternResult(resultError)
  })
})

describe('reducer matcher (inline vs reusable)', () => {
  bench('schema-match zod (inline)', () => {
    reducerZodInline(loadingState, successEvent)
    reducerZodInline(loadingState, errorEvent)
    reducerZodInline(idleState, fetchEvent)
  })

  bench('schema-match zod (reusable)', () => {
    reducerZodReusable([loadingState, successEvent])
    reducerZodReusable([loadingState, errorEvent])
    reducerZodReusable([idleState, fetchEvent])
  })

  bench('schema-match arktype (inline)', () => {
    reducerArktypeInline(loadingState, successEvent)
    reducerArktypeInline(loadingState, errorEvent)
    reducerArktypeInline(idleState, fetchEvent)
  })

  bench('schema-match arktype (reusable)', () => {
    reducerArktypeReusable([loadingState, successEvent])
    reducerArktypeReusable([loadingState, errorEvent])
    reducerArktypeReusable([idleState, fetchEvent])
  })

  bench('ts-pattern', () => {
    reducerTsPattern(loadingState, successEvent)
    reducerTsPattern(loadingState, errorEvent)
    reducerTsPattern(idleState, fetchEvent)
  })
})
