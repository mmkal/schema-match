# schema-match

Schema-first pattern matching for TypeScript.

`schema-match` lets you use [Standard Schema](https://standardschema.dev) validators as matcher clauses, so validation and branching share one source of truth.

## Install

```sh
pnpm add schema-match
```

## Quick start

```ts
import {match} from 'schema-match'
import {z} from 'zod'

const output = match(input)
  .with(z.string(), s => `hello ${s.slice(1, 3)}`)
  .with(z.array(z.number()), arr => `got ${arr.length} numbers`)
  .with(z.object({msg: z.string()}), obj => obj.msg)
  .otherwise(() => 'unexpected')
```

This works with zod, valibot, arktype, and any other standard-schema compatible library. You can even mix and match libraries:

```ts
import {match} from 'schema-match'
import {z} from 'zod'
import * as v from 'valibot'
import {type} from 'arktype'

const output = match(input)
  .with(z.string(), s => `hello ${s.slice(1, 3)}`)
  .with(v.array(v.number()), arr => `got ${arr.length} numbers`)
  .with(type({msg: 'string'}), obj => obj.msg)
  .otherwise(() => 'unexpected')
```

## Reusable matcher builders

You can prebuild a matcher once and reuse it across many inputs:

```ts
import {match} from 'schema-match'
import {z} from 'zod'
import * as v from 'valibot'
import {type} from 'arktype'

const MyMatcher = match
  .with(z.string(), s => `hello ${s.slice(1, 3)}`)
  .with(v.array(v.number()), arr => `got ${arr.length} numbers`)
  .with(type({msg: 'string'}), obj => obj.msg)
  .otherwise(() => 'unexpected')

MyMatcher('hello')
MyMatcher([1, 2, 3])
MyMatcher({msg: 'yo'})
```

This avoids rebuilding the fluent chain for hot paths.

You can constrain reusable matcher input types up front:

```ts
type Result = {type: 'ok'; value: number} | {type: 'err'; message: string}

const TypedMatcher = match
  .input<Result>()
  .with(z.object({type: z.literal('ok'), value: z.number()}), ({value}) => value)
  .otherwise(() => -1)
```

## Why use this

- Reuse existing runtime schemas for control flow.
- Mix schema libraries in one matcher (via Standard Schema).
- Keep type inference for handler inputs and return unions.
- Avoid duplicating validation logic in `if`/`switch` trees.

## Performance

`schema-match` includes compiled matcher caching and library-specific fast paths (literals, object/tuple/union/discriminator prechecks). Reusable matchers avoid rebuilding the fluent chain entirely, giving an additional speedup on hot paths.

Results from a representative run (ops/sec, higher is better):

**Result-style matching** (3 branches, discriminated union):

<!-- bench:fullName="tests/bench/match-comparison.bench.ts > result-style docs example" -->

| Matcher | ops/sec | vs fastest |
|---|---|---|
| schema-match arktype | 2,904,965 | fastest |
| schema-match zod | 1,596,345 | 1.82x slower |
| schema-match valibot | 1,066,380 | 2.72x slower |
| schema-match zod-mini | 978,484 | 2.97x slower |
| ts-pattern | 920,680 | 3.16x slower |

**Reducer-style matching** (4 branches, tuple state+event):

<!-- bench:fullName="tests/bench/match-comparison.bench.ts > reducer-style docs example" -->

| Matcher | ops/sec | vs fastest |
|---|---|---|
| schema-match arktype | 2,409,996 | fastest |
| schema-match zod | 883,887 | 2.73x slower |
| schema-match valibot | 832,980 | 2.89x slower |
| schema-match zod-mini | 643,606 | 3.74x slower |
| ts-pattern | 398,771 | 6.04x slower |

**Inline vs reusable** (result-style):

<!-- bench:fullName="tests/bench/reusable-matcher.bench.ts > result matcher (inline vs reusable)" -->

| Matcher | ops/sec | vs fastest |
|---|---|---|
| schema-match arktype (reusable) | 3,573,895 | fastest |
| schema-match arktype (inline) | 2,879,777 | 1.24x slower |
| schema-match zod (reusable) | 1,728,896 | 2.07x slower |
| schema-match zod (inline) | 1,565,925 | 2.28x slower |
| schema-match valibot (reusable) | 1,184,713 | 3.02x slower |
| schema-match valibot (inline) | 1,077,273 | 3.32x slower |
| schema-match zod-mini (reusable) | 1,041,923 | 3.43x slower |
| schema-match zod-mini (inline) | 987,417 | 3.62x slower |
| ts-pattern | 932,073 | 3.83x slower |

**Inline vs reusable** (reducer-style):

<!-- bench:fullName="tests/bench/reusable-matcher.bench.ts > reducer matcher (inline vs reusable)" -->

| Matcher | ops/sec | vs fastest |
|---|---|---|
| schema-match arktype (reusable) | 3,245,160 | fastest |
| schema-match arktype (inline) | 2,490,768 | 1.30x slower |
| schema-match zod (reusable) | 1,034,617 | 3.14x slower |
| schema-match zod (inline) | 914,339 | 3.55x slower |
| ts-pattern | 389,377 | 8.33x slower |

**vs arktype native `match`:**

Arktype has its own [`match` API](https://arktype.io/docs/match) that uses set theory to skip unmatched branches. For primitive type discrimination, it's the fastest option. For nested object schemas, `schema-match` is faster because it uses arktype's `.allows()` for zero-allocation boolean checks.

*Primitive type discrimination* (`string | number | boolean | null`, `bigint`, `object`):

<!-- bench:fullName="tests/bench/vs-arktype.bench.ts > vs arktype native: primitive type discrimination" -->

| Matcher | ops/sec | vs fastest |
|---|---|---|
| arktype native match | 10,163,136 | fastest |
| schema-match arktype (reusable) | 3,425,517 | 2.97x slower |
| schema-match zod (reusable) | 2,314,596 | 4.39x slower |
| ts-pattern | 705,811 | 14.40x slower |

*Nested object matching* (3 branches, discriminated union):

<!-- bench:fullName="tests/bench/vs-arktype.bench.ts > vs arktype native: result matching" -->

| Matcher | ops/sec | vs fastest |
|---|---|---|
| schema-match arktype (reusable) | 3,621,461 | fastest |
| schema-match arktype (inline) | 2,945,928 | 1.23x slower |
| arktype native .at("type") | 244,828 | 14.79x slower |
| arktype native .case() | 227,712 | 15.90x slower |

*Nested tuple matching* (4 branches, tuple state+event):

<!-- bench:fullName="tests/bench/vs-arktype.bench.ts > vs arktype native: reducer matching" -->

| Matcher | ops/sec | vs fastest |
|---|---|---|
| schema-match arktype (reusable) | 3,214,693 | fastest |
| schema-match arktype (inline) | 2,567,581 | 1.25x slower |
| arktype native .case() | 119,828 | 26.83x slower |

## Supported ecosystems

- `zod`
- `zod/mini`
- `valibot`
- `arktype`
- Any Standard Schema V1 implementation (`~standard.validate`)

## API

### `match(value)`

Sync matcher builder:

- `.with(schema, handler)`
- `.with(schema, predicate, handler)`
- `.with(schemaA, schemaB, ..., handler)`
- `.when(predicate, handler)`
- `.otherwise(handler)`
- `.exhaustive()`
- `.run()`

`handler` receives `(parsedValue, input)` where `parsedValue` is schema output.

`match` also has a static builder entrypoint:

- `match.with(...).with(...).otherwise(...)`
- `match.with(...).with(...).exhaustive(...)`

These return reusable functions that accept the input later.

### `matchAsync(value)`

Async equivalent for async schemas, guards, and handlers.

`matchAsync.with(...).with(...).otherwise(...)` and `.exhaustive(...)` are also available for reusable async matchers.

### `isMatching(schema, value?)` / `isMatchingAsync(schema, value?)`

Schema-backed type guards.

### `NonExhaustiveError`

Thrown by `.exhaustive()` when no branch matches.

## Type inference

- Handler input type is inferred from schema output type.
- Return types are unioned across branches.
- `isMatching` narrows from `unknown` using schema output.

## Comparison

### vs `ts-pattern`

- `ts-pattern` matches JS patterns directly and is excellent for structural matching.
- `schema-match` matches with runtime schemas you already own.

Use `schema-match` when schema-driven validation is central and you want matching to follow it.

### vs ad-hoc validation + branching

- Ad-hoc approach repeats parse checks and manual narrowing.
- `schema-match` centralizes this in a single typed expression.

## Caveats

- Use `matchAsync`/`isMatchingAsync` for async schema validation.
- `.exhaustive()` is runtime exhaustive, not compile-time algebraic exhaustiveness.

## Exports

- `match`, `matchAsync`
- `isMatching`, `isMatchingAsync`
- `NonExhaustiveError`
- `StandardSchemaV1` and helper types: `InferInput`, `InferOutput`
