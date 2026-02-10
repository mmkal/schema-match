import type {StandardSchemaV1} from './standard-schema/contract.js'
import {prettifyStandardSchemaError} from './standard-schema/errors.js'
import {validateSync} from './standard-schema/validation.js'

export type NonExhaustiveErrorOptions = {
  /** Schemas that were attempted during matching */
  schemas?: StandardSchemaV1[]
  /** Discriminator info if a dispatch table was available */
  discriminator?: {key: string; value: unknown; expected: unknown[]}
}

export class NonExhaustiveError extends Error {
  /** The schemas that were tried (if available) */
  schemas?: StandardSchemaV1[]
  /** Discriminator info (if a dispatch table was available) */
  discriminator?: NonExhaustiveErrorOptions['discriminator']

  constructor(public input: unknown, options?: NonExhaustiveErrorOptions) {
    const message = buildErrorMessage(input, options)
    super(message)
    this.schemas = options?.schemas
    this.discriminator = options?.discriminator
  }
}

function buildErrorMessage(input: unknown, options?: NonExhaustiveErrorOptions): string {
  let displayedValue: string
  try {
    displayedValue = JSON.stringify(input)
  } catch {
    displayedValue = String(input)
  }

  const lines: string[] = [`Schema matching error: no schema matches value ${displayedValue}`]

  const disc = options?.discriminator
  if (disc) {
    let discValueStr: string
    try {
      discValueStr = JSON.stringify(disc.value)
    } catch {
      discValueStr = String(disc.value)
    }
    const expectedStr = disc.expected.map(v => {
      try {
        return JSON.stringify(v)
      } catch {
        return String(v)
      }
    }).join(', ')
    lines.push(`  Discriminator '${disc.key}' has value ${discValueStr} but expected one of: ${expectedStr}`)
  }

  const schemas = options?.schemas
  if (schemas && schemas.length > 0) {
    // Re-validate input against each schema to collect per-schema issues.
    // This is the error path so performance doesn't matter.
    for (let i = 0; i < schemas.length; i += 1) {
      try {
        const result = validateSync(schemas[i], input)
        if ('issues' in result && result.issues) {
          const pretty = prettifyStandardSchemaError(result)
          if (pretty) {
            lines.push(`  Case ${i + 1}:`)
            for (const line of pretty.split('\n')) {
              lines.push(`    ${line}`)
            }
          }
        }
      } catch {
        // Validation threw (e.g. async schema used in sync context) — skip
      }
    }
  }

  return lines.join('\n')
}
