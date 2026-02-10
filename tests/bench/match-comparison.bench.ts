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

const ZodMiniError = zm.object({type: zm.literal('error'), error: zm.instanceof(Error)})
const ZodMiniOkText = zm.object({
  type: zm.literal('ok'),
  data: zm.object({type: zm.literal('text'), content: zm.string()}),
})
const ZodMiniOkImg = zm.object({
  type: zm.literal('ok'),
  data: zm.object({type: zm.literal('img'), src: zm.string()}),
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

const ArkError = type({type: '"error"', error: type.instanceOf(Error)})
const ArkOkText = type({type: '"ok"', data: {type: '"text"', content: 'string'}})
const ArkOkImg = type({type: '"ok"', data: {type: '"img"', src: 'string'}})

const resultText: Result = {type: 'ok', data: {type: 'text', content: 'hello'}}
const resultImg: Result = {type: 'ok', data: {type: 'img', src: '/hero.png'}}
const resultError: Result = {type: 'error', error: new Error('boom')}

const schematchZodResult = (result: Result) =>
  schematch(result)
    .case(ZodError, () => 'error')
    .case(ZodOkText, ({data}) => data.content)
    .case(ZodOkImg, ({data}) => data.src)
    .default('assert')

const schematchValibotResult = (result: Result) =>
  schematch(result)
    .case(ValibotError, () => 'error')
    .case(ValibotOkText, ({data}) => data.content)
    .case(ValibotOkImg, ({data}) => data.src)
    .default('assert')

const schematchZodMiniResult = (result: Result) =>
  schematch(result)
    .case(ZodMiniError, () => 'error')
    .case(ZodMiniOkText, ({data}) => data.content)
    .case(ZodMiniOkImg, ({data}) => data.src)
    .default('assert')

const schematchArktypeResult = (result: Result) =>
  schematch(result)
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

const ZodMiniIdle = zm.object({status: zm.literal('idle')})
const ZodMiniLoading = zm.object({status: zm.literal('loading'), startTime: zm.number()})
const ZodMiniSuccessState = zm.object({status: zm.literal('success'), data: zm.string()})
const ZodMiniErrorState = zm.object({status: zm.literal('error'), error: zm.instanceof(Error)})

const ZodMiniFetch = zm.object({type: zm.literal('fetch')})
const ZodMiniSuccessEvent = zm.object({type: zm.literal('success'), data: zm.string()})
const ZodMiniErrorEvent = zm.object({type: zm.literal('error'), error: zm.instanceof(Error)})
const ZodMiniCancel = zm.object({type: zm.literal('cancel')})

const ZodMiniLoadingSuccess = zm.tuple([ZodMiniLoading, ZodMiniSuccessEvent])
const ZodMiniLoadingError = zm.tuple([ZodMiniLoading, ZodMiniErrorEvent])
const ZodMiniNotLoadingFetch = zm.tuple([
  zm.union([ZodMiniIdle, ZodMiniSuccessState, ZodMiniErrorState]),
  ZodMiniFetch,
])
const ZodMiniLoadingCancel = zm.tuple([ZodMiniLoading, ZodMiniCancel])

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

const ValibotIdle = v.object({status: v.literal('idle')})
const ValibotLoading = v.object({status: v.literal('loading'), startTime: v.number()})
const ValibotSuccessState = v.object({status: v.literal('success'), data: v.string()})
const ValibotErrorState = v.object({status: v.literal('error'), error: v.instance(Error)})

const ValibotFetch = v.object({type: v.literal('fetch')})
const ValibotSuccessEvent = v.object({type: v.literal('success'), data: v.string()})
const ValibotErrorEvent = v.object({type: v.literal('error'), error: v.instance(Error)})
const ValibotCancel = v.object({type: v.literal('cancel')})

const ValibotLoadingSuccess = v.tuple([ValibotLoading, ValibotSuccessEvent])
const ValibotLoadingError = v.tuple([ValibotLoading, ValibotErrorEvent])
const ValibotNotLoadingFetch = v.tuple([
  v.union([ValibotIdle, ValibotSuccessState, ValibotErrorState]),
  ValibotFetch,
])
const ValibotLoadingCancel = v.tuple([ValibotLoading, ValibotCancel])

const reducerZod = (state: State, event: Event): State =>
  schematch<[State, Event]>([state, event])
    .case(ZodLoadingSuccess, ([, e]) => ({status: 'success', data: e.data} as const))
    .case(ZodLoadingError, ([, e]) => ({status: 'error', error: e.error} as const))
    .case(ZodNotLoadingFetch, () => ({status: 'loading', startTime: Date.now()} as const))
    .case(ZodLoadingCancel, () => ({status: 'idle'} as const))
    .default(() => state)

const reducerValibot = (state: State, event: Event): State =>
  schematch<[State, Event]>([state, event])
    .case(ValibotLoadingSuccess, ([, e]) => ({status: 'success', data: e.data} as const))
    .case(ValibotLoadingError, ([, e]) => ({status: 'error', error: e.error} as const))
    .case(ValibotNotLoadingFetch, () => ({status: 'loading', startTime: Date.now()} as const))
    .case(ValibotLoadingCancel, () => ({status: 'idle'} as const))
    .default(() => state)

const reducerZodMini = (state: State, event: Event): State =>
  schematch<[State, Event]>([state, event])
    .case(ZodMiniLoadingSuccess, ([, e]) => ({status: 'success', data: e.data} as const))
    .case(ZodMiniLoadingError, ([, e]) => ({status: 'error', error: e.error} as const))
    .case(ZodMiniNotLoadingFetch, () => ({status: 'loading', startTime: Date.now()} as const))
    .case(ZodMiniLoadingCancel, () => ({status: 'idle'} as const))
    .default(() => state)

const reducerArktype = (state: State, event: Event): State =>
  schematch<[State, Event]>([state, event])
    .case(ArkLoadingSuccess, ([, e]) => ({status: 'success', data: e.data} as const))
    .case(ArkLoadingError, ([, e]) => ({status: 'error', error: e.error} as const))
    .case(ArkNotLoadingFetch, () => ({status: 'loading', startTime: Date.now()} as const))
    .case(ArkLoadingCancel, () => ({status: 'idle'} as const))
    .default(() => state)

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

describe('result-style docs example', () => {
  bench('schematch zod', () => {
    schematchZodResult(resultText)
    schematchZodResult(resultImg)
    schematchZodResult(resultError)
  })

  bench('schematch valibot', () => {
    schematchValibotResult(resultText)
    schematchValibotResult(resultImg)
    schematchValibotResult(resultError)
  })

  bench('schematch zod-mini', () => {
    schematchZodMiniResult(resultText)
    schematchZodMiniResult(resultImg)
    schematchZodMiniResult(resultError)
  })

  bench('schematch arktype', () => {
    schematchArktypeResult(resultText)
    schematchArktypeResult(resultImg)
    schematchArktypeResult(resultError)
  })

  bench('ts-pattern', () => {
    tsPatternResult(resultText)
    tsPatternResult(resultImg)
    tsPatternResult(resultError)
  })
})

describe('reducer-style docs example', () => {
  bench('schematch zod', () => {
    reducerZod(loadingState, successEvent)
    reducerZod(loadingState, errorEvent)
    reducerZod(idleState, fetchEvent)
  })

  bench('schematch valibot', () => {
    reducerValibot(loadingState, successEvent)
    reducerValibot(loadingState, errorEvent)
    reducerValibot(idleState, fetchEvent)
  })

  bench('schematch zod-mini', () => {
    reducerZodMini(loadingState, successEvent)
    reducerZodMini(loadingState, errorEvent)
    reducerZodMini(idleState, fetchEvent)
  })

  bench('schematch arktype', () => {
    reducerArktype(loadingState, successEvent)
    reducerArktype(loadingState, errorEvent)
    reducerArktype(idleState, fetchEvent)
  })

  bench('ts-pattern', () => {
    reducerTsPattern(loadingState, successEvent)
    reducerTsPattern(loadingState, errorEvent)
    reducerTsPattern(idleState, fetchEvent)
  })
})
