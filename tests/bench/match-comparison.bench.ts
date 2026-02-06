import {bench, describe} from 'vitest'
import {match as arkMatch} from 'arktype'
import {match as tsPatternMatch} from 'ts-pattern'

import {match as schemaMatch} from '../../src/index.js'
import {makeSchema} from '../helpers/standard-schema.js'

const S31 = makeSchema<31>((value): value is 31 => value === 31)
const S32 = makeSchema<32>((value): value is 32 => value === 32)
const S33 = makeSchema<33>((value): value is 33 => value === 33)

const S0 = makeSchema<0n>((value): value is 0n => value === 0n)
const S1 = makeSchema<1n>((value): value is 1n => value === 1n)
const S2 = makeSchema<2n>((value): value is 2n => value === 2n)
const S3 = makeSchema<3n>((value): value is 3n => value === 3n)
const S4 = makeSchema<4n>((value): value is 4n => value === 4n)
const S5 = makeSchema<5n>((value): value is 5n => value === 5n)
const S6 = makeSchema<6n>((value): value is 6n => value === 6n)
const S7 = makeSchema<7n>((value): value is 7n => value === 7n)
const S8 = makeSchema<8n>((value): value is 8n => value === 8n)
const S9 = makeSchema<9n>((value): value is 9n => value === 9n)

const schemaMatch3 = (n: 31 | 32 | 33) =>
  schemaMatch(n)
    .with(S31, n => `${n}`)
    .with(S32, n => `${n}`)
    .with(S33, n => `${n}`)
    .exhaustive()

const tsPattern3 = (n: 31 | 32 | 33) =>
  tsPatternMatch(n)
    .with(31, n => `${n}`)
    .with(32, n => `${n}`)
    .with(33, n => `${n}`)
    .exhaustive()

const ark3 = arkMatch
  .case('31', n => `${n}`)
  .case('32', n => `${n}`)
  .case('33', n => `${n}`)
  .default('assert')

const schemaMatch10 = (n: 0n | 1n | 2n | 3n | 4n | 5n | 6n | 7n | 8n | 9n) =>
  schemaMatch(n)
    .with(S0, n => `${n}`)
    .with(S1, n => `${n}`)
    .with(S2, n => `${n}`)
    .with(S3, n => `${n}`)
    .with(S4, n => `${n}`)
    .with(S5, n => `${n}`)
    .with(S6, n => `${n}`)
    .with(S7, n => `${n}`)
    .with(S8, n => `${n}`)
    .with(S9, n => `${n}`)
    .exhaustive()

const tsPattern10 = (n: 0n | 1n | 2n | 3n | 4n | 5n | 6n | 7n | 8n | 9n) =>
  tsPatternMatch(n)
    .with(0n, n => `${n}`)
    .with(1n, n => `${n}`)
    .with(2n, n => `${n}`)
    .with(3n, n => `${n}`)
    .with(4n, n => `${n}`)
    .with(5n, n => `${n}`)
    .with(6n, n => `${n}`)
    .with(7n, n => `${n}`)
    .with(8n, n => `${n}`)
    .with(9n, n => `${n}`)
    .exhaustive()

const ark10 = arkMatch
  .case('0n', n => `${n}`)
  .case('1n', n => `${n}`)
  .case('2n', n => `${n}`)
  .case('3n', n => `${n}`)
  .case('4n', n => `${n}`)
  .case('5n', n => `${n}`)
  .case('6n', n => `${n}`)
  .case('7n', n => `${n}`)
  .case('8n', n => `${n}`)
  .case('9n', n => `${n}`)
  .default('assert')

describe('match comparison', () => {
  bench('schema-match case(3, invoke)', () => {
    schemaMatch3(31)
    schemaMatch3(32)
    schemaMatch3(33)
  })

  bench('arktype case(3, invoke)', () => {
    ark3(31)
    ark3(32)
    ark3(33)
  })

  bench('ts-pattern case(3, invoke)', () => {
    tsPattern3(31)
    tsPattern3(32)
    tsPattern3(33)
  })

  bench('schema-match case(10, invoke first)', () => {
    schemaMatch10(0n)
    schemaMatch10(1n)
    schemaMatch10(2n)
  })

  bench('arktype case(10, invoke first)', () => {
    ark10(0n)
    ark10(1n)
    ark10(2n)
  })

  bench('ts-pattern case(10, invoke first)', () => {
    tsPattern10(0n)
    tsPattern10(1n)
    tsPattern10(2n)
  })

  bench('schema-match case(10, invoke last)', () => {
    schemaMatch10(7n)
    schemaMatch10(8n)
    schemaMatch10(9n)
  })

  bench('arktype case(10, invoke last)', () => {
    ark10(7n)
    ark10(8n)
    ark10(9n)
  })

  bench('ts-pattern case(10, invoke last)', () => {
    tsPattern10(7n)
    tsPattern10(8n)
    tsPattern10(9n)
  })
})
