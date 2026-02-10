import {bench, describe} from 'vitest'
import {P, match as tsPatternMatch} from 'ts-pattern'
import {z} from 'zod'
import * as v from 'valibot'
import {type} from 'arktype'

import {match as schematch} from '../../src/index.js'

// ── 15-branch discriminated union with complex-ish schemas ──────────────
// Each branch has a unique `kind` literal plus 2-4 additional typed fields.
// This is designed to stress-test the dispatch table: with 15 branches,
// a late-matching input would need to try 14 schemas sequentially without dispatch.

// --- Zod schemas ---

const zodBranches = {
  userCreated: z.object({
    kind: z.literal('user.created'),
    userId: z.string(),
    email: z.string(),
    createdAt: z.number(),
  }),
  userUpdated: z.object({
    kind: z.literal('user.updated'),
    userId: z.string(),
    changes: z.object({name: z.string().optional(), email: z.string().optional()}),
  }),
  userDeleted: z.object({
    kind: z.literal('user.deleted'),
    userId: z.string(),
    deletedAt: z.number(),
  }),
  orderPlaced: z.object({
    kind: z.literal('order.placed'),
    orderId: z.string(),
    items: z.array(z.object({sku: z.string(), qty: z.number()})),
    total: z.number(),
  }),
  orderShipped: z.object({
    kind: z.literal('order.shipped'),
    orderId: z.string(),
    trackingNumber: z.string(),
    carrier: z.string(),
  }),
  orderDelivered: z.object({
    kind: z.literal('order.delivered'),
    orderId: z.string(),
    deliveredAt: z.number(),
  }),
  orderCancelled: z.object({
    kind: z.literal('order.cancelled'),
    orderId: z.string(),
    reason: z.string(),
  }),
  paymentReceived: z.object({
    kind: z.literal('payment.received'),
    paymentId: z.string(),
    amount: z.number(),
    currency: z.string(),
  }),
  paymentRefunded: z.object({
    kind: z.literal('payment.refunded'),
    paymentId: z.string(),
    amount: z.number(),
    reason: z.string(),
  }),
  paymentFailed: z.object({
    kind: z.literal('payment.failed'),
    paymentId: z.string(),
    errorCode: z.string(),
    retryable: z.boolean(),
  }),
  inventoryLow: z.object({
    kind: z.literal('inventory.low'),
    sku: z.string(),
    remaining: z.number(),
    threshold: z.number(),
  }),
  inventoryRestocked: z.object({
    kind: z.literal('inventory.restocked'),
    sku: z.string(),
    added: z.number(),
    newTotal: z.number(),
  }),
  notificationSent: z.object({
    kind: z.literal('notification.sent'),
    channel: z.string(),
    recipientId: z.string(),
    templateId: z.string(),
  }),
  notificationFailed: z.object({
    kind: z.literal('notification.failed'),
    channel: z.string(),
    recipientId: z.string(),
    error: z.string(),
  }),
  systemHealthcheck: z.object({
    kind: z.literal('system.healthcheck'),
    service: z.string(),
    status: z.string(),
    latencyMs: z.number(),
  }),
} as const

// --- Valibot schemas ---

const valibotBranches = {
  userCreated: v.object({
    kind: v.literal('user.created'),
    userId: v.string(),
    email: v.string(),
    createdAt: v.number(),
  }),
  userUpdated: v.object({
    kind: v.literal('user.updated'),
    userId: v.string(),
    changes: v.object({name: v.optional(v.string()), email: v.optional(v.string())}),
  }),
  userDeleted: v.object({
    kind: v.literal('user.deleted'),
    userId: v.string(),
    deletedAt: v.number(),
  }),
  orderPlaced: v.object({
    kind: v.literal('order.placed'),
    orderId: v.string(),
    items: v.array(v.object({sku: v.string(), qty: v.number()})),
    total: v.number(),
  }),
  orderShipped: v.object({
    kind: v.literal('order.shipped'),
    orderId: v.string(),
    trackingNumber: v.string(),
    carrier: v.string(),
  }),
  orderDelivered: v.object({
    kind: v.literal('order.delivered'),
    orderId: v.string(),
    deliveredAt: v.number(),
  }),
  orderCancelled: v.object({
    kind: v.literal('order.cancelled'),
    orderId: v.string(),
    reason: v.string(),
  }),
  paymentReceived: v.object({
    kind: v.literal('payment.received'),
    paymentId: v.string(),
    amount: v.number(),
    currency: v.string(),
  }),
  paymentRefunded: v.object({
    kind: v.literal('payment.refunded'),
    paymentId: v.string(),
    amount: v.number(),
    reason: v.string(),
  }),
  paymentFailed: v.object({
    kind: v.literal('payment.failed'),
    paymentId: v.string(),
    errorCode: v.string(),
    retryable: v.boolean(),
  }),
  inventoryLow: v.object({
    kind: v.literal('inventory.low'),
    sku: v.string(),
    remaining: v.number(),
    threshold: v.number(),
  }),
  inventoryRestocked: v.object({
    kind: v.literal('inventory.restocked'),
    sku: v.string(),
    added: v.number(),
    newTotal: v.number(),
  }),
  notificationSent: v.object({
    kind: v.literal('notification.sent'),
    channel: v.string(),
    recipientId: v.string(),
    templateId: v.string(),
  }),
  notificationFailed: v.object({
    kind: v.literal('notification.failed'),
    channel: v.string(),
    recipientId: v.string(),
    error: v.string(),
  }),
  systemHealthcheck: v.object({
    kind: v.literal('system.healthcheck'),
    service: v.string(),
    status: v.string(),
    latencyMs: v.number(),
  }),
} as const

// --- Arktype schemas ---

const arktypeBranches = {
  userCreated: type({kind: '"user.created"', userId: 'string', email: 'string', createdAt: 'number'}),
  userUpdated: type({kind: '"user.updated"', userId: 'string', changes: {name: 'string | undefined', email: 'string | undefined'}}),
  userDeleted: type({kind: '"user.deleted"', userId: 'string', deletedAt: 'number'}),
  orderPlaced: type({kind: '"order.placed"', orderId: 'string', items: type({sku: 'string', qty: 'number'}).array(), total: 'number'}),
  orderShipped: type({kind: '"order.shipped"', orderId: 'string', trackingNumber: 'string', carrier: 'string'}),
  orderDelivered: type({kind: '"order.delivered"', orderId: 'string', deliveredAt: 'number'}),
  orderCancelled: type({kind: '"order.cancelled"', orderId: 'string', reason: 'string'}),
  paymentReceived: type({kind: '"payment.received"', paymentId: 'string', amount: 'number', currency: 'string'}),
  paymentRefunded: type({kind: '"payment.refunded"', paymentId: 'string', amount: 'number', reason: 'string'}),
  paymentFailed: type({kind: '"payment.failed"', paymentId: 'string', errorCode: 'string', retryable: 'boolean'}),
  inventoryLow: type({kind: '"inventory.low"', sku: 'string', remaining: 'number', threshold: 'number'}),
  inventoryRestocked: type({kind: '"inventory.restocked"', sku: 'string', added: 'number', newTotal: 'number'}),
  notificationSent: type({kind: '"notification.sent"', channel: 'string', recipientId: 'string', templateId: 'string'}),
  notificationFailed: type({kind: '"notification.failed"', channel: 'string', recipientId: 'string', error: 'string'}),
  systemHealthcheck: type({kind: '"system.healthcheck"', service: 'string', status: 'string', latencyMs: 'number'}),
} as const

// --- Test inputs ---

// Branch 1 (first): hits first clause
const inputFirst = {kind: 'user.created' as const, userId: 'u1', email: 'a@b.com', createdAt: 1}
// Branch 8 (middle): hits 8th clause
const inputMiddle = {kind: 'payment.received' as const, paymentId: 'p1', amount: 99, currency: 'USD'}
// Branch 15 (last): hits last clause
const inputLast = {kind: 'system.healthcheck' as const, service: 'api', status: 'ok', latencyMs: 42}

// --- Handler (same for all) ---

const handler = (input: Record<string, unknown>) => input.kind

// --- Reusable matchers (dispatch table is built once) ---

const zodReusable = schematch
  .case(zodBranches.userCreated, handler)
  .case(zodBranches.userUpdated, handler)
  .case(zodBranches.userDeleted, handler)
  .case(zodBranches.orderPlaced, handler)
  .case(zodBranches.orderShipped, handler)
  .case(zodBranches.orderDelivered, handler)
  .case(zodBranches.orderCancelled, handler)
  .case(zodBranches.paymentReceived, handler)
  .case(zodBranches.paymentRefunded, handler)
  .case(zodBranches.paymentFailed, handler)
  .case(zodBranches.inventoryLow, handler)
  .case(zodBranches.inventoryRestocked, handler)
  .case(zodBranches.notificationSent, handler)
  .case(zodBranches.notificationFailed, handler)
  .case(zodBranches.systemHealthcheck, handler)
  .default('assert')

const valibotReusable = schematch
  .case(valibotBranches.userCreated, handler)
  .case(valibotBranches.userUpdated, handler)
  .case(valibotBranches.userDeleted, handler)
  .case(valibotBranches.orderPlaced, handler)
  .case(valibotBranches.orderShipped, handler)
  .case(valibotBranches.orderDelivered, handler)
  .case(valibotBranches.orderCancelled, handler)
  .case(valibotBranches.paymentReceived, handler)
  .case(valibotBranches.paymentRefunded, handler)
  .case(valibotBranches.paymentFailed, handler)
  .case(valibotBranches.inventoryLow, handler)
  .case(valibotBranches.inventoryRestocked, handler)
  .case(valibotBranches.notificationSent, handler)
  .case(valibotBranches.notificationFailed, handler)
  .case(valibotBranches.systemHealthcheck, handler)
  .default('assert')

const arktypeReusable = schematch
  .case(arktypeBranches.userCreated, handler)
  .case(arktypeBranches.userUpdated, handler)
  .case(arktypeBranches.userDeleted, handler)
  .case(arktypeBranches.orderPlaced, handler)
  .case(arktypeBranches.orderShipped, handler)
  .case(arktypeBranches.orderDelivered, handler)
  .case(arktypeBranches.orderCancelled, handler)
  .case(arktypeBranches.paymentReceived, handler)
  .case(arktypeBranches.paymentRefunded, handler)
  .case(arktypeBranches.paymentFailed, handler)
  .case(arktypeBranches.inventoryLow, handler)
  .case(arktypeBranches.inventoryRestocked, handler)
  .case(arktypeBranches.notificationSent, handler)
  .case(arktypeBranches.notificationFailed, handler)
  .case(arktypeBranches.systemHealthcheck, handler)
  .default('assert')

// --- Inline matchers (no dispatch table, rebuilt each call) ---

const zodInline = (input: Record<string, unknown>) =>
  schematch(input)
    .case(zodBranches.userCreated, handler)
    .case(zodBranches.userUpdated, handler)
    .case(zodBranches.userDeleted, handler)
    .case(zodBranches.orderPlaced, handler)
    .case(zodBranches.orderShipped, handler)
    .case(zodBranches.orderDelivered, handler)
    .case(zodBranches.orderCancelled, handler)
    .case(zodBranches.paymentReceived, handler)
    .case(zodBranches.paymentRefunded, handler)
    .case(zodBranches.paymentFailed, handler)
    .case(zodBranches.inventoryLow, handler)
    .case(zodBranches.inventoryRestocked, handler)
    .case(zodBranches.notificationSent, handler)
    .case(zodBranches.notificationFailed, handler)
    .case(zodBranches.systemHealthcheck, handler)
    .default('assert')

// --- ts-pattern (baseline) ---

const tsPattern = (input: Record<string, unknown>) =>
  tsPatternMatch(input)
    .with({kind: 'user.created'}, handler)
    .with({kind: 'user.updated'}, handler)
    .with({kind: 'user.deleted'}, handler)
    .with({kind: 'order.placed'}, handler)
    .with({kind: 'order.shipped'}, handler)
    .with({kind: 'order.delivered'}, handler)
    .with({kind: 'order.cancelled'}, handler)
    .with({kind: 'payment.received'}, handler)
    .with({kind: 'payment.refunded'}, handler)
    .with({kind: 'payment.failed'}, handler)
    .with({kind: 'inventory.low'}, handler)
    .with({kind: 'inventory.restocked'}, handler)
    .with({kind: 'notification.sent'}, handler)
    .with({kind: 'notification.failed'}, handler)
    .with({kind: 'system.healthcheck'}, handler)
    .otherwise(() => {
      throw new Error('no match')
    })

// ── Benchmarks ──────────────────────────────────────────────────────────

describe('15-branch discriminated: first branch (best case)', () => {
  bench('schematch zod (reusable + dispatch)', () => {
    zodReusable(inputFirst)
  })

  bench('schematch zod (inline)', () => {
    zodInline(inputFirst)
  })

  bench('schematch valibot (reusable + dispatch)', () => {
    valibotReusable(inputFirst)
  })

  bench('schematch arktype (reusable + dispatch)', () => {
    arktypeReusable(inputFirst)
  })

  bench('ts-pattern', () => {
    tsPattern(inputFirst)
  })
})

describe('15-branch discriminated: middle branch (8th of 15)', () => {
  bench('schematch zod (reusable + dispatch)', () => {
    zodReusable(inputMiddle)
  })

  bench('schematch zod (inline)', () => {
    zodInline(inputMiddle)
  })

  bench('schematch valibot (reusable + dispatch)', () => {
    valibotReusable(inputMiddle)
  })

  bench('schematch arktype (reusable + dispatch)', () => {
    arktypeReusable(inputMiddle)
  })

  bench('ts-pattern', () => {
    tsPattern(inputMiddle)
  })
})

describe('15-branch discriminated: last branch (worst case)', () => {
  bench('schematch zod (reusable + dispatch)', () => {
    zodReusable(inputLast)
  })

  bench('schematch zod (inline)', () => {
    zodInline(inputLast)
  })

  bench('schematch valibot (reusable + dispatch)', () => {
    valibotReusable(inputLast)
  })

  bench('schematch arktype (reusable + dispatch)', () => {
    arktypeReusable(inputLast)
  })

  bench('ts-pattern', () => {
    tsPattern(inputLast)
  })
})

describe('15-branch discriminated: mixed inputs (realistic)', () => {
  bench('schematch zod (reusable + dispatch)', () => {
    zodReusable(inputFirst)
    zodReusable(inputMiddle)
    zodReusable(inputLast)
  })

  bench('schematch zod (inline)', () => {
    zodInline(inputFirst)
    zodInline(inputMiddle)
    zodInline(inputLast)
  })

  bench('schematch valibot (reusable + dispatch)', () => {
    valibotReusable(inputFirst)
    valibotReusable(inputMiddle)
    valibotReusable(inputLast)
  })

  bench('schematch arktype (reusable + dispatch)', () => {
    arktypeReusable(inputFirst)
    arktypeReusable(inputMiddle)
    arktypeReusable(inputLast)
  })

  bench('ts-pattern', () => {
    tsPattern(inputFirst)
    tsPattern(inputMiddle)
    tsPattern(inputLast)
  })
})
