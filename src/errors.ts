import type {StandardSchemaV1} from './standard-schema/contract.js'
import {prettifyStandardSchemaError} from './standard-schema/errors.js'
import {validateSync} from './standard-schema/validation.js'

export type MatchErrorOptions = {
  /** Schemas that were attempted during matching */
  schemas?: StandardSchemaV1[]
  /** Discriminator info if a dispatch table was available */
  discriminator?: {key: string; value: unknown; expected: unknown[]; matched: boolean}
}

/**
 * Error thrown (or returned) when no case in a match expression matched the input.
 *
 * Implements {@link StandardSchemaV1.FailureResult} so it can be used directly as a
 * standard-schema failure result — the `.issues` array contains per-case validation details.
 */
export class MatchError extends Error implements StandardSchemaV1.FailureResult {
  /** Standard-schema failure issues describing why each case failed to match. */
  readonly issues: ReadonlyArray<StandardSchemaV1.Issue>
  /** The schemas that were tried (if available) */
  schemas?: StandardSchemaV1[]
  /** Discriminator info (if a dispatch table was available) */
  discriminator?: MatchErrorOptions['discriminator']

  constructor(public input: unknown, options?: MatchErrorOptions) {
    const analysis = analyzeFailure(input, options)
    super(buildErrorMessage(input, analysis, options))
    this.issues = analysis.issues
    this.schemas = options?.schemas
    this.discriminator = options?.discriminator
  }

  static summarizeInput(input: unknown): string {
    if (input === null) return 'null'
  
    const kind = typeof input
    if (kind !== 'object') return kind
  
    if (Array.isArray(input)) return `array(length: ${input.length})`
  
    const keys = Object.keys(input as Record<string, unknown>)
    if (keys.length === 0) return 'object'
    const preview = keys.slice(0, 5).join(', ')
    const suffix = keys.length > 5 ? ', ...' : ''
    return `object(keys: ${preview}${suffix})`
  }
}

type FailureAnalysis = {
  issues: StandardSchemaV1.Issue[]
  prettyCases: Array<{caseNumber: number; pretty: string}>
}

/**
 * Build issues and pretty diagnostics in one validation pass.
 * This avoids validating each schema twice when constructing MatchError.
 */
function analyzeFailure(input: unknown, options?: MatchErrorOptions): FailureAnalysis {
  const issues: StandardSchemaV1.Issue[] = []
  const prettyCases: FailureAnalysis['prettyCases'] = []
  const schemas = options?.schemas

  if (!schemas || schemas.length === 0) {
    issues.push({message: formatNoMatchMessage(input)})
    return {issues, prettyCases}
  }

  const disc = options?.discriminator
  if (disc && !disc.matched) {
    issues.push({
      message: `Discriminator '${disc.key}' has value ${displayValue(disc.value)} but expected one of: ${displayValues(disc.expected)}`,
      path: [disc.key],
    })
    return {issues, prettyCases}
  }

  for (let i = 0; i < schemas.length; i += 1) {
    try {
      const result = validateSync(schemas[i], input)
      if ('issues' in result && result.issues) {
        for (const issue of result.issues) {
          issues.push({
            message: `Case ${i + 1}: ${issue.message}`,
            path: issue.path,
          })
        }

        const pretty = prettifyStandardSchemaError(result)
        if (pretty) {
          prettyCases.push({caseNumber: i + 1, pretty})
        }
      }
    } catch {
      // Validation threw (e.g. async schema used in sync context) — skip
    }
  }

  if (issues.length === 0) {
    issues.push({message: formatNoMatchMessage(input)})
  }

  return {issues, prettyCases}
}

function formatNoMatchMessage(input: unknown): string {
  return `No schema matches input (${MatchError.summarizeInput(input)})`
}

function buildErrorMessage(
  input: unknown,
  analysis: FailureAnalysis,
  options?: MatchErrorOptions,
): string {
  const lines: string[] = [`Schema matching error: no schema matches input (${MatchError.summarizeInput(input)})`]

  const disc = options?.discriminator
  if (disc) {
    const discValueStr = displayValue(disc.value)
    const expectedStr = displayValues(disc.expected)

    if (disc.matched) {
      lines.push(`  Discriminator '${disc.key}' matched ${discValueStr} (options: ${expectedStr}) but failed validation:`)
      appendPrettyCases(lines, analysis.prettyCases)
    } else {
      lines.push(`  Discriminator '${disc.key}' has value ${discValueStr} but expected one of: ${expectedStr}`)
    }
  } else {
    appendPrettyCases(lines, analysis.prettyCases)
  }

  return lines.join('\n')
}

function appendPrettyCases(lines: string[], prettyCases: FailureAnalysis['prettyCases']): void {
  for (const {caseNumber, pretty} of prettyCases) {
    lines.push(`  Case ${caseNumber}:`)
    for (const line of pretty.split('\n')) {
      lines.push(`    ${line}`)
    }
  }
}

function displayValue(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function displayValues(values: unknown[]): string {
  return values.map(displayValue).join(', ')
}
