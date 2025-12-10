/**
 * Parameter type generation utilities
 * 
 * This module handles generation of TypeScript types for API endpoint parameters,
 * including path, query, and header parameters.
 */

import type { NormalizedSpec, Parameter } from '../types.js';
import { isRef } from '../parser.js';
import { extractTypeNameFromRef } from './path-utils.js';
import { schemaToTypeScript } from './schema-generator.js';

/**
 * Generates a TypeScript type definition from an array of parameters
 * 
 * Creates a type with properties for each parameter, handling:
 * - Required vs optional parameters
 * - Type inference from schema or primitive types
 * - Array types
 * - JSDoc comments from parameter descriptions
 * 
 * @param params - Array of parameters to convert
 * @param spec - Full specification for resolving references
 * @param typeName - Name for the generated type
 * @returns Complete TypeScript type definition code
 */
export function generateParameterType(
  params: Parameter[],
  spec: NormalizedSpec,
  typeName: string
): string {
  const properties: string[] = [];

  for (const param of params) {
    const isRequired = param.required !== false;
    
    // Determine parameter type
    const paramType = determineParameterType(param, spec, typeName);

    // Mark as optional if not required
    const optional = isRequired ? '' : '?';
    
    // Handle property names that need to be quoted
    const safeKey = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(param.name)
      ? param.name
      : `'${param.name}'`;
    
    // Add JSDoc comment if description exists
    const comment = param.description
      ? `  /** ${param.description} */\n`
      : '';
    
    properties.push(`${comment}  ${safeKey}${optional}: ${paramType};`);
  }

  return `export type ${typeName} = {\n${properties.join('\n')}\n};`;
}

/**
 * Determines the TypeScript type for a parameter
 * 
 * Handles different parameter type scenarios:
 * - Schema-based types (with $ref or inline schema)
 * - Primitive types (string, number, boolean)
 * - Array types with items
 * 
 * @param param - Parameter definition
 * @param spec - Full specification
 * @param context - Context name for type generation
 * @returns TypeScript type string
 */
function determineParameterType(
  param: Parameter,
  spec: NormalizedSpec,
  context: string
): string {
  // If parameter has a schema, use it
  if (param.schema) {
    if (isRef(param.schema)) {
      return extractTypeNameFromRef(param.schema.$ref);
    }
    return schemaToTypeScript(param.schema, spec, context);
  }

  // Handle array type with items
  if (param.type === 'array' && param.items) {
    if (isRef(param.items)) {
      return `${extractTypeNameFromRef(param.items.$ref)}[]`;
    }
    return `${schemaToTypeScript(param.items, spec, context)}[]`;
  }

  // Handle primitive types
  if (param.type === 'integer' || param.type === 'number') {
    return 'number';
  }
  if (param.type === 'boolean') {
    return 'boolean';
  }

  // Default to string for all other cases
  return 'string';
}

