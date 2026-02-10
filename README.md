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
import * as v from 'valibot'
import {type} from 'arktype'

const String = z.string()
const NumberArray = v.array(v.number())
const Message = type({msg: 'string'})

const output = match(input)
  .with(String, s => `hello ${s.slice(1, 3)}`)
  .with(NumberArray, arr => `got ${arr.length} numbers`)
  .with(Message, obj => obj.msg)
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

## Performance

`schema-match` includes compiled matcher caching and library-specific fast paths (literals, object/tuple/union/discriminator prechecks).

For docs-style realistic schema benchmarks in this repo, current runs show `schema-match` competitive with or faster than `ts-pattern` on several scenarios. Always benchmark your own shapes.

Run locally:

```sh
pnpm vitest bench tests/bench/match-comparison.bench.ts --run
```

## Caveats

- Use `matchAsync`/`isMatchingAsync` for async schema validation.
- `.exhaustive()` is runtime exhaustive, not compile-time algebraic exhaustiveness.

## Exports

- `match`, `matchAsync`
- `isMatching`, `isMatchingAsync`
- `NonExhaustiveError`
- `StandardSchemaV1` and helper types: `InferInput`, `InferOutput`
