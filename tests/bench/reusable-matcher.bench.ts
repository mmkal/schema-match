import {bench, describe} from 'vitest'
import {P, match as tsPatternMatch} from 'ts-pattern'
import * as v from 'valibot'
import {z as zm} from 'zod/mini'
import {z} from 'zod'
import {type} from 'arktype'

import {match as schematch} from '../../src/index.js'

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

const schematchZodResultInline = (result: Result) =>
  schematch(result)
    .case(ZodError, () => 'error')
    .case(ZodOkText, ({data}) => data.content)
    .case(ZodOkImg, ({data}) => data.src)
    .default('assert')

const schematchValibotResultInline = (result: Result) =>
  schematch(result)
    .case(ValibotError, () => 'error')
    .case(ValibotOkText, ({data}) => data.content)
    .case(ValibotOkImg, ({data}) => data.src)
    .default('assert')

const schematchZodMiniResultInline = (result: Result) =>
  schematch(result)
    .case(ZodMiniError, () => 'error')
    .case(ZodMiniOkText, ({data}) => data.content)
    .case(ZodMiniOkImg, ({data}) => data.src)
    .default('assert')

const schematchZodResultReusable = schematch
  .case(ZodError, () => 'error')
  .case(ZodOkText, ({data}) => data.content)
  .case(ZodOkImg, ({data}) => data.src)
  .default('assert')

const schematchValibotResultReusable = schematch
  .case(ValibotError, () => 'error')
  .case(ValibotOkText, ({data}) => data.content)
  .case(ValibotOkImg, ({data}) => data.src)
  .default('assert')

const schematchZodMiniResultReusable = schematch
  .case(ZodMiniError, () => 'error')
  .case(ZodMiniOkText, ({data}) => data.content)
  .case(ZodMiniOkImg, ({data}) => data.src)
  .default('assert')

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
  schematch<[State, Event]>([state, event])
    .case(ZodLoadingSuccess, ([, e]) => ({status: 'success', data: e.data} as const))
    .case(ZodLoadingError, ([, e]) => ({status: 'error', error: e.error} as const))
    .case(ZodNotLoadingFetch, () => ({status: 'loading', startTime: Date.now()} as const))
    .case(ZodLoadingCancel, () => ({status: 'idle'} as const))
    .default(() => state)

const reducerZodReusable = schematch
  .case(ZodLoadingSuccess, ([, e]) => ({status: 'success', data: e.data} as const))
  .case(ZodLoadingError, ([, e]) => ({status: 'error', error: e.error} as const))
  .case(ZodNotLoadingFetch, () => ({status: 'loading', startTime: Date.now()} as const))
  .case(ZodLoadingCancel, () => ({status: 'idle'} as const))
  .default(value => (value as [State, Event])[0])

const reducerArktypeInline = (state: State, event: Event): State =>
  schematch<[State, Event]>([state, event])
    .case(ArkLoadingSuccess, ([, e]) => ({status: 'success', data: e.data} as const))
    .case(ArkLoadingError, ([, e]) => ({status: 'error', error: e.error} as const))
    .case(ArkNotLoadingFetch, () => ({status: 'loading', startTime: Date.now()} as const))
    .case(ArkLoadingCancel, () => ({status: 'idle'} as const))
    .default(() => state)

const reducerArktypeReusable = schematch
  .case(ArkLoadingSuccess, ([, e]) => ({status: 'success', data: e.data} as const))
  .case(ArkLoadingError, ([, e]) => ({status: 'error', error: e.error} as const))
  .case(ArkNotLoadingFetch, () => ({status: 'loading', startTime: Date.now()} as const))
  .case(ArkLoadingCancel, () => ({status: 'idle'} as const))
  .default(value => (value as [State, Event])[0])

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
  bench('schematch zod (inline)', () => {
    schematchZodResultInline(resultText)
    schematchZodResultInline(resultImg)
    schematchZodResultInline(resultError)
  })

  bench('schematch zod (reusable)', () => {
    schematchZodResultReusable(resultText)
    schematchZodResultReusable(resultImg)
    schematchZodResultReusable(resultError)
  })

  bench('schematch valibot (inline)', () => {
    schematchValibotResultInline(resultText)
    schematchValibotResultInline(resultImg)
    schematchValibotResultInline(resultError)
  })

  bench('schematch valibot (reusable)', () => {
    schematchValibotResultReusable(resultText)
    schematchValibotResultReusable(resultImg)
    schematchValibotResultReusable(resultError)
  })

  bench('schematch zod-mini (inline)', () => {
    schematchZodMiniResultInline(resultText)
    schematchZodMiniResultInline(resultImg)
    schematchZodMiniResultInline(resultError)
  })

  bench('schematch zod-mini (reusable)', () => {
    schematchZodMiniResultReusable(resultText)
    schematchZodMiniResultReusable(resultImg)
    schematchZodMiniResultReusable(resultError)
  })

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

  bench('ts-pattern', () => {
    tsPatternResult(resultText)
    tsPatternResult(resultImg)
    tsPatternResult(resultError)
  })
})

describe('reducer matcher (inline vs reusable)', () => {
  bench('schematch zod (inline)', () => {
    reducerZodInline(loadingState, successEvent)
    reducerZodInline(loadingState, errorEvent)
    reducerZodInline(idleState, fetchEvent)
  })

  bench('schematch zod (reusable)', () => {
    reducerZodReusable([loadingState, successEvent])
    reducerZodReusable([loadingState, errorEvent])
    reducerZodReusable([idleState, fetchEvent])
  })

  bench('schematch arktype (inline)', () => {
    reducerArktypeInline(loadingState, successEvent)
    reducerArktypeInline(loadingState, errorEvent)
    reducerArktypeInline(idleState, fetchEvent)
  })

  bench('schematch arktype (reusable)', () => {
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
