# schematch

Schema-first pattern matching for TypeScript.

`schematch` lets you use [Standard Schema](https://standardschema.dev) validators (zod, valibot, arktype et. al.) as matcher clauses, so validation and branching share one source of truth.

## Install

```sh
pnpm add schematch
```

## Quick start

```typescript
import {match} from 'schematch'
import {z} from 'zod'

const output = match(input)
  .case(z.string(), s => `hello ${s.slice(1, 3)}`)
  .case(z.array(z.number()), arr => `got ${arr.length} numbers`)
  .case(z.object({msg: z.string()}), obj => obj.msg)
  .otherwise(() => 'unexpected')
```

This works with zod, valibot, arktype, and any other standard-schema compatible library. You can even mix and match libraries:

```typescript
import {match} from 'schematch'
import {z} from 'zod'
import * as v from 'valibot'
import {type} from 'arktype'

const output = match(input)
  .case(z.string(), s => `hello ${s.slice(1, 3)}`)
  .case(v.array(v.number()), arr => `got ${arr.length} numbers`)
  .case(type({msg: 'string'}), obj => obj.msg)
  .otherwise(() => 'unexpected')
```

## Reusable matcher builders

You can prebuild a matcher once into a function, and reuse it across many inputs:

```typescript
import {match} from 'schematch'
import {z} from 'zod'

const myMatcher = match
  .case(z.string(), s => `hello ${s.slice(1, 3)}`)
  .case(z.array(z.number()), arr => `got ${arr.length} numbers`)
  .case(z.object({msg: z.string()}), obj => obj.msg)
  .otherwise(() => 'unexpected')

myMatcher('hello')
myMatcher([1, 2, 3])
myMatcher({msg: 'yo'})
```

This avoids rebuilding the fluent chain for hot paths.

You can constrain reusable matcher input types up front:

```typescript
type Result = {type: 'ok'; value: number} | {type: 'err'; message: string}

const TypedMatcher = match
  .input<Result>()
  .case(z.object({type: z.literal('ok'), value: z.number()}), ({value}) => value)
  .otherwise(() => -1)
```

Similarly, you can constrain the output type with `.output<T>()`:

```typescript
const TypedMatcher = match
  .input<Result>()
  .output<number>()
  .case(z.object({type: z.literal('ok'), value: z.number()}), ({value}) => value)
  .otherwise(() => -1)
```

This also works on inline matchers:

```typescript
const output = match(input)
  .output<string | number>()
  .case(z.number(), n => n + 1)
  .otherwise(() => 'fallback')
```

## Why use this

- 🔁 Reuse existing runtime schemas for control flow.
- 🧩 Mix schema libraries in one matcher (via Standard Schema).
- 🔍 Keep type inference for handler inputs and return unions.
- 🪓 Avoid duplicating validation logic in `if`/`switch` trees.

## Performance

`schematch` includes compiled matcher caching and library-specific fast paths (literals, object/tuple/union/discriminator prechecks). Reusable matchers avoid rebuilding the fluent chain entirely, giving an additional speedup on hot paths.

Results from a representative run (ops/sec, higher is better):

**Result-style matching** (3 branches, discriminated union):

<!-- bench:fullName="tests/bench/match-comparison.bench.ts > result-style docs example" -->

| Matcher | ops/sec | vs fastest |
|---|---|---|
| schematch arktype | 2,889,271 | fastest |
| schematch zod-mini | 2,459,148 | 1.17x slower |
| schematch zod | 2,403,237 | 1.20x slower |
| schematch valibot | 2,395,803 | 1.21x slower |
| ts-pattern | 907,255 | 3.18x slower |

**Reducer-style matching** (4 branches, tuple state+event):

<!-- bench:fullName="tests/bench/match-comparison.bench.ts > reducer-style docs example" -->

| Matcher | ops/sec | vs fastest |
|---|---|---|
| schematch arktype | 2,470,445 | fastest |
| schematch zod | 1,896,102 | 1.30x slower |
| schematch zod-mini | 1,874,122 | 1.32x slower |
| schematch valibot | 1,857,205 | 1.33x slower |
| ts-pattern | 406,453 | 6.08x slower |

**Inline vs reusable** (result-style):

<!-- bench:fullName="tests/bench/reusable-matcher.bench.ts > result matcher (inline vs reusable)" -->

| Matcher | ops/sec | vs fastest |
|---|---|---|
| schematch arktype (reusable) | 3,595,131 | fastest |
| schematch zod (reusable) | 3,406,267 | 1.06x slower |
| schematch zod-mini (reusable) | 3,184,019 | 1.13x slower |
| schematch valibot (reusable) | 2,970,570 | 1.21x slower |
| schematch arktype (inline) | 2,949,246 | 1.22x slower |
| schematch zod (inline) | 2,552,020 | 1.41x slower |
| schematch zod-mini (inline) | 2,513,358 | 1.43x slower |
| schematch valibot (inline) | 2,490,268 | 1.44x slower |
| ts-pattern | 924,386 | 3.89x slower |

**Inline vs reusable** (reducer-style):

<!-- bench:fullName="tests/bench/reusable-matcher.bench.ts > reducer matcher (inline vs reusable)" -->

| Matcher | ops/sec | vs fastest |
|---|---|---|
| schematch arktype (reusable) | 3,152,214 | fastest |
| schematch arktype (inline) | 2,557,790 | 1.23x slower |
| schematch zod (reusable) | 2,280,499 | 1.38x slower |
| schematch zod (inline) | 1,975,361 | 1.60x slower |
| ts-pattern | 406,866 | 7.75x slower |

**vs arktype native `match`:**

Arktype has its own [`match` API](https://arktype.io/docs/match) that uses set theory to skip unmatched branches. For primitive type discrimination, it's the fastest option. For nested object schemas, `schematch` is faster because it uses arktype's `.allows()` for zero-allocation boolean checks.

*Primitive type discrimination* (`string | number | boolean | null`, `bigint`, `object`):

<!-- bench:fullName="tests/bench/vs-arktype.bench.ts > vs arktype native: primitive type discrimination" -->

| Matcher | ops/sec | vs fastest |
|---|---|---|
| arktype native match | 10,390,218 | fastest |
| schematch arktype (reusable) | 3,420,320 | 3.04x slower |
| schematch zod (reusable) | 2,861,642 | 3.63x slower |
| ts-pattern | 668,182 | 15.55x slower |

*Nested object matching* (3 branches, discriminated union):

<!-- bench:fullName="tests/bench/vs-arktype.bench.ts > vs arktype native: result matching" -->

| Matcher | ops/sec | vs fastest |
|---|---|---|
| schematch arktype (reusable) | 3,617,913 | fastest |
| schematch arktype (inline) | 2,994,844 | 1.21x slower |
| arktype native .at("type") | 236,615 | 15.29x slower |
| arktype native .case() | 209,913 | 17.24x slower |

*Nested tuple matching* (4 branches, tuple state+event):

<!-- bench:fullName="tests/bench/vs-arktype.bench.ts > vs arktype native: reducer matching" -->

| Matcher | ops/sec | vs fastest |
|---|---|---|
| schematch arktype (reusable) | 3,233,544 | fastest |
| schematch arktype (inline) | 2,520,186 | 1.28x slower |
| arktype native .case() | 120,772 | 26.77x slower |

## Supported ecosystems

- `zod`
- `zod/mini`
- `valibot`
- `arktype`
- Any Standard Schema V1 implementation (`~standard.validate`)

## API

### `match(value)`

Sync matcher builder:

- `.output<T>()` — constrain the return type of the matcher
- `.case(schema, handler)` — try a schema, run handler if it matches
- `.case(schema, predicate, handler)` — schema + guard
- `.case(schemaA, schemaB, ..., handler)` — multiple schemas, first match wins
- `.when(predicate, handler)` — no schema, just a predicate
- `.otherwise(handler)` — fallback
- `.exhaustive()` — throw if nothing matched
- `.run()` — execute without a fallback (returns `undefined` on no match)

`handler` receives `(parsedValue, input)` where `parsedValue` is schema output.

`match` also has static builder entrypoints:

- `match.input<T>()` — constrain the input type for a reusable matcher
- `match.output<T>()` — constrain the output type for a reusable matcher
- `match.case(...).case(...).otherwise(...)`
- `match.case(...).case(...).exhaustive(...)`

These return reusable functions that accept the input later.

### `matchAsync(value)`

Async equivalent for async schemas, guards, and handlers.

`matchAsync.case(...).case(...).otherwise(...)` and `.exhaustive(...)` are also available for reusable async matchers.

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
- `schematch` matches with runtime schemas you already own.

Use `schematch` when schema-driven validation is central and you want matching to follow it.

### vs ad-hoc validation + branching

- Ad-hoc approach repeats parse checks and manual narrowing.
- `schematch` centralizes this in a single typed expression.

## Caveats

- Use `matchAsync`/`isMatchingAsync` for async schema validation.
- `.exhaustive()` is runtime exhaustive, not compile-time algebraic exhaustiveness.

## Exports

- `match`, `matchAsync`
- `isMatching`, `isMatchingAsync`
- `NonExhaustiveError`
- `StandardSchemaV1` and helper types: `InferInput`, `InferOutput`
