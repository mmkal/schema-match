# schematch

Pattern matching for TypeScript.

`schematch` lets you use [Standard Schema](https://standardschema.dev) validators (zod, valibot, arktype et. al.) as matcher clauses in pattern-matching expressions.

## Do it

```sh
pnpm add schematch
```

```typescript
import {match} from 'schematch'
import {z} from 'zod'

const output = match(input)
  .case(z.string(), s => `hello ${s.slice(1, 3)}`)
  .case(z.array(z.number()), arr => `got ${arr.length} numbers`)
  .case(z.object({msg: z.string()}), obj => obj.msg)
  .default(() => 'unexpected')
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
  .default(() => 'unexpected')

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
  .default(() => -1)
```

Similarly, you can constrain the output type with `.output<T>()`:

```typescript
const TypedMatcher = match
  .input<Result>()
  .output<number>()
  .case(z.object({type: z.literal('ok'), value: z.number()}), ({value}) => value)
  .default(() => -1)
```

This also works on inline matchers:

```typescript
const output = match(input)
  .output<string | number>()
  .case(z.number(), n => n + 1)
  .default(() => 'fallback')
```

This all works with zod, valibot, arktype, and any other standard-schema compatible library. You could even mix and match libraries (but maybe don't?):

```typescript
import {match} from 'schematch'
import {z} from 'zod'
import * as v from 'valibot'
import {type} from 'arktype'

const output = match(input)
  .case(z.string(), s => `hello ${s.slice(1, 3)}`)
  .case(v.array(v.number()), arr => `got ${arr.length} numbers`)
  .case(type({msg: 'string'}), obj => obj.msg)
  .default(() => 'unexpected')
```

## `.default(mode)` - terminating a match

The `.default()` method terminates a match expression. It accepts a handler function or one of three string modes, inspired by [ArkType's `match` API](https://arktype.io/docs/match):

| Mode | Input type | On no match | Return type | Penny for my thoughts |
|---|---|---|---|---|
| `.default(handler)` | `unknown` (or `.input<T>()`) | Calls handler | `Output \| HandlerReturn` | Sure |
| `.default('never')` | Union of case inputs | Throws `NonExhaustiveError` | `Output` | The best one |
| `.default('assert')` | `unknown` | Throws `NonExhaustiveError` | `Output` | I guess so |
| `.default('reject')` | `unknown` | Returns `NonExhaustiveError` | `Output \| NonExhaustiveError` | Sometimes |

### `.default(handler)`

A fallback handler, called with the raw input when no case matched:

```typescript
match(input)
  .case(z.string(), s => s.length)
  .default(() => -1) // -1 when no case matches
```

### `.default('never')`

Throws a `NonExhaustiveError` at runtime if no case matched (like `'assert'`), and **constrains the input type** at compile time to the union of all case schema input types. If you like types which I think you do, this is best when you know the input will always be one of the declared cases:

```typescript
const fn = match
  .case(z.string(), s => s.length)
  .case(z.number(), n => n + 1)
  .default('never')

// fn has type: (input: string | number) => number
fn('hello') // 5
fn(42)      // 43
fn(true)    // compile-time type error
```

For inline matchers, `'never'` produces a compile-time error if the input value doesn't extend the case union:

```typescript
match(42 as number)
  .case(z.number(), n => n + 1)
  .default('never') // ok: number extends number

match('hello' as unknown)
  .case(z.number(), n => n + 1)
  .default('never') // type error: unknown doesn't extend number
```

### `.default('assert')`

Like `'never'`, throws a `NonExhaustiveError` at runtime if no case matched. The input type is unconstrained (`unknown` for reusable matchers):

```typescript
const fn = match
  .case(z.string(), s => s.length)
  .case(z.number(), n => n + 1)
  .default('assert')

fn('hello') // 5
fn(42)      // 43
fn(true)    // throws NonExhaustiveError
```

### `.default('reject')`

Returns a `NonExhaustiveError` instance instead of throwing. Useful in pipelines where you don't want try/catch:

```typescript
const fn = match
  .case(z.string(), s => s.length)
  .default('reject')

const result = fn(42)
// result has type: number | NonExhaustiveError

if (result instanceof NonExhaustiveError) {
  console.log(result.issues) // standard-schema failure issues
}
```

## Matchers as Standard Schemas

> "wow! *another* standard-schema is produced from compose schemas via schematch!" - Winston Churchill

Reusable matchers (built with `match.case(...)`) are valid [Standard Schema V1](https://standardschema.dev) implementations. They expose a `'~standard'` property with `version: 1`, `vendor: 'schematch'`, and a `validate` function.

This means a matcher can be used anywhere a standard-schema is expected, INCLUDING as a case schema inside another matcher:

```typescript
import {match} from 'schematch'
import {z} from 'zod'
import type {StandardSchemaV1} from 'schematch'

// Build a matcher. It's also a StandardSchema, if you can believe such a thing
const Stringify = match
  .case(z.string(), s => s.split(','))
  .case(z.number(), n => Array.from({length: n}, () => 'hi'))

Stringify satisfies StandardSchemaV1<string | number, string[]>

// Use validate() directly
Stringify['~standard'].validate('a,b,c')  // { value: ['a', 'b', 'c'] }
Stringify['~standard'].validate(3)        // { value: ['hi', 'hi', 'hi'] }
Stringify['~standard'].validate(null)     // { issues: [...] }

// Compose: use a matcher as a case schema inside another matcher
const outer = match
  .case(Stringify, arr => arr.length)     // Stringify is the schema here
  .case(z.boolean(), () => -1)
  .default('assert')

outer('a,b,c')  // 3
outer(5)         // 5
outer(true)      // -1
```

Type inference works through composition: `StandardSchemaV1.InferInput` gives the union of case input types, and `StandardSchemaV1.InferOutput` gives the union of handler return types.

Async matchers (`matchAsync.case(...)`) work the same way. Their `validate` function returns a `Promise`.

**Note:** Calling `.default()` terminates the matcher and returns a plain function. The returned function is not a StandardSchema. The schema interface lives on the matcher *before* `.default()` is called.

## Why use this

- 🔁 Reuse existing runtime schemas for control flow.
- 🧩 Support any standard-schema libraries, even mixed libraries in one matcher.
- 👷 It's type safe and runtime-y safe
- 🥰 It looks nicer than `if`/`switch` trees

## When use this

- When you want to pattern-match
- When you don't want to learn ts-pattern's special matching/selection rules
- This section is kind of the same as why use this

## How use this

- `npm install schematch`
- See [README.md](./README.md)

## Where use this

- At your... computer?

## Performance

`schematch` if fast. It includes compiled matcher caching and library-specific fast paths (literals, object/tuple/union/discriminator prechecks). Reusable matchers avoid rebuilding the fluent chain entirely, giving an additional speedup on hot paths.

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

**Discriminator dispatch** (15 branches, reusable matcher with dispatch table):

This benchmark uses 15 object schemas with a shared `kind` discriminator key and 2-4 additional typed fields each. Roughly simulating an event-sourcing or webhook scenario. It shows how the dispatch table helps as the branch count grows, especially for late-matching inputs.

<!-- bench:fullName="tests/bench/discriminator-dispatch.bench.ts > 15-branch discriminated: mixed inputs (realistic)" -->

| Matcher | ops/sec | vs fastest |
|---|---|---|
| schematch arktype (reusable + dispatch) | 2,940,143 | fastest |
| schematch valibot (reusable + dispatch) | 2,485,785 | 1.18x slower |
| schematch zod (reusable + dispatch) | 2,420,443 | 1.21x slower |
| schematch zod (inline) | 808,357 | 3.64x slower |
| ts-pattern | 358,838 | 8.19x slower |

The dispatch advantage grows with branch position. For the last branch (worst case for sequential scan):

<!-- bench:fullName="tests/bench/discriminator-dispatch.bench.ts > 15-branch discriminated: last branch (worst case)" -->

| Matcher | ops/sec | vs fastest |
|---|---|---|
| schematch arktype (reusable + dispatch) | 6,959,113 | fastest |
| schematch zod (reusable + dispatch) | 5,970,836 | 1.17x slower |
| schematch valibot (reusable + dispatch) | 5,910,174 | 1.18x slower |
| schematch zod (inline) | 1,460,279 | 4.77x slower |
| ts-pattern | 632,622 | 11.00x slower |

## How it works

Calling `match(value).case(schema, handler)` or building a reusable matcher looks simple, but under the hood schematch compiles each schema into a specialised matcher the first time it's seen, caches it, and then applies a layered series of fast paths before ever falling back to the schema library's own `validate` call. The layers are described below, roughly in the order they're tried.

### Compiled matcher caching

Every schema object is compiled into a `{ sync, async }` pair of functions exactly once. The compiled matcher is stored directly on the schema object via a well-known symbol (`Symbol.for('schematch.compiled-matcher')`). If the object is frozen or non-extensible, a `WeakMap` fallback is used instead. Subsequent calls with the same schema instance hit one of these caches and skip compilation entirely.

**Tradeoff:** Caching on the schema object itself is the fastest lookup (property access), but mutates the schema. The WeakMap fallback avoids that at the cost of a hash lookup. Both are per-instance, so structurally identical but distinct schema objects compile independently.

### Literal fast path

Before trying any library-specific path, the compiler checks whether the schema represents a single literal value (e.g. `z.literal('ok')`, `v.literal(42)`, `type('ok')`). If so, the compiled matcher is a single `Object.is()` comparison with no allocation or validation overhead.

Detection is duck-typed across libraries: arktype's `unit` property, valibot's `type === 'literal'` with a `.literal` field, and zod's `_def.type === 'literal'` with a single-element `values` array.

**Tradeoff:** Relies on internal schema structure rather than a public API. This is fragile across library major versions but turns what would be a full validation call into a single comparison.

### Library-specific compiled matchers

When the literal fast path doesn't apply, the compiler detects which library produced the schema by looking for internal properties (`_zod`, `~run`, `.allows`) and generates a tailored matcher:

**Zod** (`_zod.run`): Calls zod's internal `run` method directly instead of going through `~standard.validate`. Pre-allocates payload (`{value, issues}`) and context (`{async: false}`) objects and reuses them across calls by mutating `.value` and setting `.issues.length = 0`. This avoids allocating new objects on every match attempt.

**Valibot** (`~run`): Similar approach: calls valibot's internal `~run` directly. Pre-allocates a shared `config` object.

**Arktype** (`.allows`): Uses arktype's `.allows(value)` method, which returns a boolean without creating result objects or issue arrays, so no allocation per call. When the schema has no transforms, the input value is returned directly without calling the full validation pipeline.

**Generic fallback**: For any other Standard Schema V1 implementation, calls `~standard.validate` and inspects the result.

**Tradeoff:** Duck-typing library internals provides significant speedups (the zod/valibot paths avoid result object allocation; the arktype path avoids validation entirely for non-transform schemas) but couples schematch to implementation details. A new major version of any library could break detection. The generic fallback ensures correctness regardless.

### Recursive prechecks

For zod and valibot, the compiler recursively walks the schema definition tree and builds a lightweight boolean predicate (a "precheck") that can reject non-matching values cheaply before invoking the library's validation.

The precheck handles: literals (`Object.is`), primitives (`typeof`), objects (per-key checks), tuples (per-item checks with length bounds), unions (any-of), discriminated unions/variants (Map lookup on discriminator key), `null`/`undefined`/`Date`/`instanceof`.

Each precheck node is classified as **complete** or **partial**:

- **Complete**: The precheck fully covers the schema's type constraint (no transforms, refinements, `.pipe()`, `.checks`, or unhandled schema types in the tree). When a precheck is complete, the library's validation is skipped entirely. The precheck result alone determines match/no-match, and the raw input value is returned.
- **Partial**: The precheck can fast-reject values that definitely don't match (e.g. wrong `typeof`, missing discriminator) but a passing precheck still requires full validation to confirm. This is the common case for schemas with `.min()`, `.regex()`, `.refine()`, etc.

For valibot's `variant` type (discriminated union), the precheck builds a `Map<discriminatorValue, check>` for O(1) dispatch on the discriminator field, rather than iterating through union options.

**Tradeoff:** Complete prechecks give the biggest speedup (full validation bypass) but return the input value as-is, so they cannot be used with schemas that apply transforms. Partial prechecks still help by avoiding expensive validation calls for obvious mismatches, at the cost of the precheck function call overhead on values that do match. The recursive walk happens once at compile time, not per match.

### Reusable matchers

When you write `match.case(...).case(...).default(...)` (without an input value), schematch builds a `ReusableMatcher` that stores the clause list as a plain array at construction time. The returned function iterates the pre-built array on each call: no `new MatchExpression()`, no fluent chain, no per-call allocation of clause structures. Benchmarks show a ~20-40% throughput increase over inline matching.

Reusable matchers are also valid Standard Schema V1 implementations (see [Matchers as Standard Schemas](#matchers-as-standard-schemas)), so they can be composed with other matchers or used anywhere a standard-schema is expected.

**Tradeoff:** The reusable matcher's clause array is allocated once and shared across calls. This is faster but means the matcher is fixed after construction. You can't add branches dynamically.

### Cross-branch discriminator dispatch

When a reusable matcher's `.case()` branches are all object schemas sharing a common literal-typed key (e.g. `type`, `kind`, `status`), schematch automatically builds a dispatch table at construction time. On each match attempt, instead of trying every branch sequentially, it reads the discriminator value from the input and jumps directly to the candidate branch(es).

Discriminator extraction is library-specific:

- **Zod/zod-mini**: Inspects `_def.shape` for keys whose sub-def has `type === 'literal'` with a single value.
- **Valibot**: Inspects `schema.entries` for keys where `entry.type === 'literal'`.
- **Arktype**: Inspects `schema.json.required` for entries where `value.unit` exists.

When multiple keys are literal-typed, preferred discriminator names (`type`, `kind`, `status`, `_tag`, `tag`) take priority. Clauses without an extractable discriminator (e.g. `.when()` predicates, non-object schemas) go into a fallback set that's always checked. Original clause ordering is preserved: first-match-wins semantics are maintained.

**Tradeoff:** Only applies to reusable matchers (not inline), only works for object schemas with shared literal keys, and adds a small construction-time cost for schema introspection. For non-discriminated schemas or non-object inputs, the dispatch table is skipped and matching falls back to the linear scan.

### Enhanced error messages

When `.default('assert')` throws because no branch matched, the error message includes:

- **Discriminator info** (reusable matchers): If a dispatch table exists, the error reports the discriminator key, the actual value, and the expected values. For example: `Discriminator 'type' has value "unknown" but expected one of: "ok", "err"`.
- **Per-schema validation issues**: The error re-validates the input against each candidate schema (or all schemas if no dispatch table exists) and formats the issues. For example: `Case 1: ✖ Expected number → at value`.

Re-validation only happens on the error path, so there is no performance impact on successful matches. The `NonExhaustiveError` object also exposes `.schemas`, `.discriminator`, and `.issues` properties for programmatic access.

`NonExhaustiveError` implements `StandardSchemaV1.FailureResult`, so its `.issues` array conforms to the standard-schema spec.

### Micro-optimisations

A few smaller techniques contribute to throughput:

- **Sentinel symbols** (`NO_MATCH`, `ASYNC_REQUIRED`): Using symbols as return values avoids wrapping match results in `{matched: false}` objects. Control flow is a simple reference equality check.
- **Early short-circuit**: Once a branch matches, all subsequent `.case()` calls are no-ops (`if (this.matched) return this`).
- **Singleton unmatched state**: A single frozen `{matched: false, value: undefined}` object is shared across all unmatched branches.
- **Indexed for-loops**: All inner loops use `for (let i = 0; i < n; i += 1)` rather than `for...of` or `.forEach()`, avoiding iterator protocol overhead.
- **2-argument fast path**: The common `.case(schema, handler)` call skips guard detection, argument slicing, and inner-loop setup.

### Summary

| Layer | When it helps | What it skips | Cost |
|---|---|---|---|
| Compiled matcher cache | Every call after the first | Recompilation | One symbol/WeakMap lookup |
| Literal fast path | `z.literal()`, `v.literal()`, `type('x')` | All validation | One `Object.is()` call |
| Library-specific matcher | zod, valibot, arktype schemas | Generic `~standard.validate` | Duck-typing on internals |
| Complete precheck | Simple schemas (no transforms/refinements) | Library `run()` entirely | Lightweight boolean function |
| Partial precheck | Any compiled schema | Full validation on mismatches | Precheck call + full validation on match |
| Reusable matcher | Hot paths with repeated matching | Fluent chain rebuild | Fixed clause array |
| Discriminator dispatch | Reusable matchers with shared literal key | Non-matching branches | One property read + Map lookup |
| Enhanced error messages | `.default('assert')` failures | - | Re-validation on error path only |

## Supported ecosystems

- `zod`
- `zod/mini`
- `valibot`
- `arktype`
- Any Standard Schema V1 implementation (`~standard.validate`)

## API

### `match(value)`

Sync matcher builder:

- `.output<T>()` - constrain the return type of the matcher
- `.case(schema, handler)` - try a schema, run handler if it matches
- `.case(schema, predicate, handler)` - schema + guard
- `.case(schemaA, schemaB, ..., handler)` - multiple schemas, first match wins
- `.when(predicate, handler)` - no schema, just a predicate
- `.default(handler)` - fallback handler for unmatched inputs
- `.default('assert')` - throw `NonExhaustiveError` if nothing matched
- `.default('never')` - throw if nothing matched; type error if input doesn't extend case union
- `.default('reject')` - return `NonExhaustiveError` instead of throwing

`handler` receives `(parsedValue, input)`. For transforming schemas, `parsedValue` is transformed output; for non-transforming schemas, fast paths may pass through the input value.

### `match.case(...)` - reusable matchers

Static builder entrypoints that return reusable functions:

- `match.input<T>()` - constrain the input type for a reusable matcher
- `match.output<T>()` - constrain the output type for a reusable matcher
- `.at(key)` - switch to discriminator-value cases (`.case(value, handler)`)
- `match.case(...).case(...).default(...)` - build a reusable matcher function

Reusable matchers are also valid Standard Schema V1 implementations. Before `.default()` is called, they expose a `'~standard'` property with `validate`, allowing them to be used as schemas in other matchers or any standard-schema consumer.

### Narrowing unions

For trusted union-typed values, there are two ways to narrow to a member inside reusable matchers.

- If your union has a discriminator key (`type`, `kind`, etc.), use `.at(key)`.
- If it does not, use the second handler arg `input` - the input type, narrowed to the input of the schema specified using `.case`.

For untrusted/external data, prefer full schema `.case(...)` validation over discriminator-only checks.

#### Option 1: `.at(key)` for discriminated unions

```typescript
type OpencodeEvent =
  | {type: 'session.status'; sessionId: string}
  | {type: 'message.updated'; properties: {sessionId: string}}

const getSessionId = match
  .input<OpencodeEvent>()
  .at('type')
  .case('session.status', value => value.sessionId)
  .case('message.updated', value => value.properties.sessionId)
  .default('assert')
```

`at().case()` checks `input[key] === value` and narrows the handler type. It does not run full branch schema validation.

#### Option 2: `input` as second handler arg for non-discriminated unions

When you use `.case`, you are specify a way of parsing data, so the first argument *only* contains data which has been successfully parsed. So it can't be used to narrow a union type to include additional properties (because they *haven't* been parsed).

```typescript
type Lead =
  | {email: string; campaignId: string; submittedAtIso: string}
  | {phone: string; country: string; submittedAtIso: string}

const routeLead = match
  .input<Lead>()
  .case(z.object({email: z.string().email()}), parsed => parsed.campaignId) // tsc error: Property 'campaignId' does not exist on type '{ email: string }'
  .default(() => 'fallback')
```

But if you're working with trusted input, you may be fine with unvalidated properties. In those cases, you can explicitly ignore the parsed input and use the second argument passed to the handler function:

```typescript
const routeLead = match
  .input<Lead>()
  .case(z.object({email: z.string().email()}), (_parsed, input) => `email:${input.campaignId}`)
  .case(z.object({phone: z.string()}), (_parsed, input) => `sms:${input.country}`)
  .default('assert')
```

### `matchAsync(value)` / `matchAsync.case(...)`

Async equivalents for async schemas, guards, and handlers. Same API as sync variants, but `.default()` returns `Promise<...>` (inline) or `(input) => Promise<...>` (reusable).

### `isMatching(schema, value?)` / `isMatchingAsync(schema, value?)`

Schema-backed type guards.

### `NonExhaustiveError`

Thrown by `.default('assert')` / `.default('never')`, or returned by `.default('reject')`.

Implements `StandardSchemaV1.FailureResult`. The `.issues` array contains per-case validation details conforming to the standard-schema spec. Also exposes `.input`, `.schemas`, and `.discriminator` for programmatic access.

## Type inference

- First handler arg (`parsed`) is inferred from schema output type.
- Second handler arg (`input`) is for input-oriented logic and narrows in common non-transforming union cases.
- Return types are unioned across branches.
- `.default('never')` constrains the reusable matcher's input to the union of case schema input types.
- `StandardSchemaV1.InferInput<typeof matcher>` gives the case input union; `StandardSchemaV1.InferOutput<typeof matcher>` gives the handler return union.
- `isMatching` narrows from `unknown` using schema output.

## Other fun stuff

schematch also exports a `prettifyStandardSchemaError` which works on any standard-schema error object and makes it more human-readable (and less token-wasteful for LLMs). That's not an official part of the API surface though so it might move around.

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
- `.default('assert')` and `.default('never')` provide runtime exhaustiveness, not compile-time algebraic exhaustiveness. TypeScript cannot verify that your case schemas cover every member of a union at the type level.
- `.when()` clauses don't contribute to `CaseInputs` for `.default('never')`. Use `.input<T>()` for full control when mixing `.when()` with input constraints.

## Exports

- `match`, `matchAsync`
- `isMatching`, `isMatchingAsync`
- `NonExhaustiveError`
- `StandardSchemaV1` and helper types: `InferInput`, `InferOutput`
