/**
 * Schema type generation utilities
 * 
 * This module handles conversion of JSON Schema definitions to TypeScript types,
 * including support for complex types like unions, intersections, arrays, and objects.
 */

import type { NormalizedSpec, Schema, Reference } from '../types.js';
import { resolveSchema, isRef, resolveRef } from '../parser.js';
import { extractTypeNameFromRef } from './path-utils.js';

/**
 * Generates TypeScript type code for a schema
 * 
 * Creates a complete type definition with JSDoc comments if a description is available.
 * 
 * @param name - Schema name (will be used as the type name)
 * @param schema - Schema definition or reference
 * @param spec - Full specification for resolving references
 * @returns Complete TypeScript type definition code
 */
export function generateSchemaType(
  name: string,
  schema: Schema | Reference,
  spec: NormalizedSpec
): string {
  const resolved = resolveSchema(schema, spec);
  const typeCode = schemaToTypeScript(resolved, spec, name);
  const description = resolved.description;

  // Generate JSDoc comment if description exists
  const comment = description
    ? `/**\n * ${description.split('\n').join('\n * ')}\n */\n`
    : '';

  return `${comment}export type ${name} = ${typeCode};`;
}

/**
 * Converts a JSON Schema to a TypeScript type string
 * 
 * This is the core function that handles all JSON Schema types and converts them
 * to TypeScript equivalents:
 * - Primitives (string, number, boolean)
 * - Arrays
 * - Objects with properties
 * - Unions (oneOf, anyOf)
 * - Intersections (allOf)
 * - Enums
 * - Nullable types
 * - References ($ref)
 * 
 * @param schema - Schema to convert
 * @param spec - Full specification for resolving references
 * @param context - Context name for better error messages and debugging
 * @returns TypeScript type string representation
 */
export function schemaToTypeScript(
  schema: Schema,
  spec: NormalizedSpec,
  context: string
): string {
  // Handle references - resolve them recursively
  if (isRef(schema)) {
    const resolved = resolveRef(schema.$ref, spec);
    if (resolved && 'type' in resolved) {
      return schemaToTypeScript(resolved as Schema, spec, context);
    }
    // Extract type name from ref if resolution failed
    const refParts = schema.$ref.split('/');
    const typeName = refParts[refParts.length - 1];
    return typeName;
  }

  // Handle nullable types - add | null to the base type
  if (schema.nullable) {
    const baseType = schemaToTypeScript({ ...schema, nullable: false }, spec, context);
    return `${baseType} | null`;
  }

  // Handle oneOf - union type
  if (schema.oneOf && schema.oneOf.length > 0) {
    const types = schema.oneOf.map((s) => {
      if (isRef(s)) {
        const resolved = resolveRef(s.$ref, spec);
        if (resolved && 'type' in resolved) {
          return schemaToTypeScript(resolved as Schema, spec, context);
        }
        const refParts = s.$ref.split('/');
        return refParts[refParts.length - 1];
      }
      return schemaToTypeScript(s, spec, context);
    });
    return `(${types.join(' | ')})`;
  }

  // Handle anyOf - union type
  if (schema.anyOf && schema.anyOf.length > 0) {
    const types = schema.anyOf.map((s) => {
      if (isRef(s)) {
        const resolved = resolveRef(s.$ref, spec);
        if (resolved && 'type' in resolved) {
          return schemaToTypeScript(resolved as Schema, spec, context);
        }
        const refParts = s.$ref.split('/');
        return refParts[refParts.length - 1];
      }
      return schemaToTypeScript(s, spec, context);
    });
    return `(${types.join(' | ')})`;
  }

  // Handle allOf - intersection type
  if (schema.allOf && schema.allOf.length > 0) {
    const types = schema.allOf.map((s) => {
      if (isRef(s)) {
        const resolved = resolveRef(s.$ref, spec);
        if (resolved && 'type' in resolved) {
          return schemaToTypeScript(resolved as Schema, spec, context);
        }
        const refParts = s.$ref.split('/');
        return refParts[refParts.length - 1];
      }
      return schemaToTypeScript(s, spec, context);
    });
    return `(${types.join(' & ')})`;
  }

  // Handle enum - union of literal values
  if (schema.enum && schema.enum.length > 0) {
    const enumValues = schema.enum.map((v) => {
      if (typeof v === 'string') {
        // Escape single quotes in string enum values
        return `'${v.replace(/'/g, "\\'")}'`;
      }
      return String(v);
    });
    return enumValues.join(' | ');
  }

  // Handle array type
  if (schema.type === 'array') {
    if (!schema.items) {
      return 'unknown[]';
    }
    const itemType = isRef(schema.items)
      ? extractTypeNameFromRef(schema.items.$ref)
      : schemaToTypeScript(schema.items, spec, context);
    return `${itemType}[]`;
  }

  // Handle object type
  if (schema.type === 'object' || (!schema.type && schema.properties)) {
    return generateObjectType(schema, spec, context);
  }

  // Handle primitive types
  return generatePrimitiveType(schema);
}

/**
 * Generates TypeScript type for an object schema
 * 
 * Handles objects with properties, required fields, and additionalProperties.
 * 
 * @param schema - Object schema
 * @param spec - Full specification
 * @param context - Context name
 * @returns TypeScript object type string
 */
function generateObjectType(
  schema: Schema,
  spec: NormalizedSpec,
  context: string
): string {
  // Handle empty objects or objects without properties
  if (!schema.properties || Object.keys(schema.properties).length === 0) {
    if (schema.additionalProperties === false) {
      return 'Record<string, never>';
    }
    if (schema.additionalProperties === true) {
      return 'Record<string, unknown>';
    }
    if (schema.additionalProperties) {
      const valueType = isRef(schema.additionalProperties)
        ? extractTypeNameFromRef(schema.additionalProperties.$ref)
        : schemaToTypeScript(schema.additionalProperties as Schema, spec, context);
      return `Record<string, ${valueType}>`;
    }
    return 'Record<string, unknown>';
  }

  const required = schema.required || [];
  const properties: string[] = [];

  // Generate properties with optional markers and JSDoc comments
  for (const [key, value] of Object.entries(schema.properties)) {
    const isRequired = required.includes(key);
    const propType = isRef(value)
      ? extractTypeNameFromRef(value.$ref)
      : schemaToTypeScript(value, spec, context);
    const optional = isRequired ? '' : '?';
    
    // Handle property names that need to be quoted (e.g., special characters)
    const safeKey = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key) ? key : `'${key}'`;
    
    // Add JSDoc comment if description exists
    const propSchema = isRef(value) ? null : value;
    const comment = propSchema?.description
      ? `  /** ${propSchema.description} */\n`
      : '';
    
    properties.push(`${comment}  ${safeKey}${optional}: ${propType};`);
  }

  // Handle additionalProperties
  if (schema.additionalProperties !== undefined && schema.additionalProperties !== false) {
    if (schema.additionalProperties === true) {
      properties.push('  [key: string]: unknown;');
    } else {
      const valueType = isRef(schema.additionalProperties)
        ? extractTypeNameFromRef(schema.additionalProperties.$ref)
        : schemaToTypeScript(schema.additionalProperties as Schema, spec, context);
      properties.push(`  [key: string]: ${valueType};`);
    }
  }

  return `{\n${properties.join('\n')}\n}`;
}

/**
 * Generates TypeScript type for primitive schema types
 * 
 * @param schema - Schema with primitive type
 * @returns TypeScript primitive type string
 */
function generatePrimitiveType(schema: Schema): string {
  switch (schema.type) {
    case 'string':
      // Keep date-time and date as strings (users can convert to Date if needed)
      if (schema.format === 'date-time' || schema.format === 'date') {
        return 'string';
      }
      return 'string';
    case 'number':
    case 'integer':
      return 'number';
    case 'boolean':
      return 'boolean';
    default:
      return 'unknown';
  }
}

