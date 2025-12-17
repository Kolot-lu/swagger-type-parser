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

  if (schema.nullable) {
    const baseType = schemaToTypeScript({ ...schema, nullable: false }, spec, context);
    return `${baseType} | null`;
  }

  if (schema.oneOf && schema.oneOf.length > 0) {
    const singleRefType = getSingleRefTypeNameIfAllOthersEmpty(schema.oneOf);
    if (singleRefType) {
      return singleRefType;
    }

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

  if (schema.anyOf && schema.anyOf.length > 0) {
    const singleRefType = getSingleRefTypeNameIfAllOthersEmpty(schema.anyOf);
    if (singleRefType) {
      return singleRefType;
    }

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

  if (schema.allOf && schema.allOf.length > 0) {
    const singleRefType = getSingleRefTypeNameIfAllOthersEmpty(schema.allOf);
    if (singleRefType) {
      return singleRefType;
    }

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

  if (schema.type === 'array') {
    if (!schema.items) {
      return 'undefined[]';
    }
    const itemType = isRef(schema.items)
      ? extractTypeNameFromRef(schema.items.$ref)
      : schemaToTypeScript(schema.items, spec, context);
    return `${itemType}[]`;
  }

  if (schema.type === 'object' || (!schema.type && schema.properties)) {
    return generateObjectType(schema, spec, context);
  }

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
  if (!schema.properties || Object.keys(schema.properties).length === 0) {
    if (schema.additionalProperties === false) {
      return 'Record<string, never>';
    }
    if (schema.additionalProperties === true) {
      return 'Record<string, undefined>';
    }
    if (schema.additionalProperties) {
      const valueType = isRef(schema.additionalProperties)
        ? extractTypeNameFromRef(schema.additionalProperties.$ref)
        : schemaToTypeScript(schema.additionalProperties as Schema, spec, context);
      return `Record<string, ${valueType}>`;
    }
    return 'Record<string, undefined>';
  }

  const required = schema.required || [];
  const properties: string[] = [];

  for (const [key, value] of Object.entries(schema.properties)) {
    const isRequired = required.includes(key);
    let propType: string;

    if (isRef(value)) {
      propType = extractTypeNameFromRef(value.$ref);
    } else {
      const inlineSchema = value as Schema;
      const matchedNamedSchema = findNamedSchemaByShape(inlineSchema, spec);

      if (matchedNamedSchema) {
        propType = matchedNamedSchema;
      } else {
        propType = schemaToTypeScript(inlineSchema, spec, context);
      }
    }
    const optional = isRequired ? '' : '?';
    
    const safeKey = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key) ? key : `'${key}'`;
    
    const propSchema = isRef(value) ? null : value;
    const comment = propSchema?.description
      ? `  /** ${propSchema.description} */\n`
      : '';
    
    properties.push(`${comment}  ${safeKey}${optional}: ${propType};`);
  }

  if (schema.additionalProperties !== undefined && schema.additionalProperties !== false) {
    if (schema.additionalProperties === true) {
      properties.push('  [key: string]: undefined;');
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
      return 'undefined';
  }
}

/**
 * Attempts to find a named schema in the specification that has the same
 * "shape" (set of property keys) as the provided inline object schema.
 *
 * This is useful for cases where an OpenAPI spec repeats the same object
 * structure inline instead of referencing a shared component schema. By
 * mapping such inline objects to existing named schemas we:
 * - Avoid duplicated, anonymous types in the generated output
 * - Ensure imports like `UserProfileOut` are actually used
 *
 * Matching is intentionally conservative: we only compare the set of
 * top-level property names. If anything does not match exactly, we do
 * not attempt to reuse a named schema.
 *
 * @param schema - Inline object schema to match
 * @param spec - Full normalized specification
 * @returns Name of the matching schema or null if no match was found
 */
function findNamedSchemaByShape(
  schema: Schema,
  spec: NormalizedSpec
): string | null {
  if (!schema.properties || Object.keys(schema.properties).length === 0) {
    return null;
  }

  const targetKeys = Object.keys(schema.properties).sort();

  for (const [name, candidate] of Object.entries(spec.components.schemas)) {
    if (!candidate || !candidate.properties) {
      continue;
    }

    const candidateKeys = Object.keys(candidate.properties).sort();

    if (candidateKeys.length !== targetKeys.length) {
      continue;
    }

    let allMatch = true;
    for (let i = 0; i < targetKeys.length; i += 1) {
      if (targetKeys[i] !== candidateKeys[i]) {
        allMatch = false;
        break;
      }
    }

    if (allMatch) {
      return name;
    }
  }

  return null;
}

/**
 * Checks if a schema is "empty" – i.e. it does not describe any concrete shape.
 *
 * Empty schemas are often used in OpenAPI specs together with oneOf/anyOf/allOf
 * just to express that a value is optional or may be omitted. In such cases we
 * prefer to collapse the union to the meaningful referenced type.
 */
function isEmptySchema(schema: Schema | Reference): boolean {
  if (isRef(schema)) {
    return false;
  }

  return (
    // Treat explicit "null" type as an "empty" schema variant as well.
    // Many OpenAPI generators express "T | null" as anyOf/oneOf: [T, { type: "null" }]
    // and for our purposes this second branch does not carry additional structure.
    (schema.type === undefined ||
      (typeof (schema as { type?: string }).type === 'string' &&
        (schema as { type?: string }).type === 'null')) &&
    !schema.properties &&
    !schema.items &&
    !schema.enum &&
    !schema.oneOf &&
    !schema.anyOf &&
    !schema.allOf &&
    schema.additionalProperties === undefined
  );
}

/**
 * If a list of schemas (from oneOf/anyOf/allOf) contains exactly one referenced
 * schema and all other entries are empty schemas, return the referenced type name.
 *
 * This pattern is common in real-world OpenAPI specs, e.g.:
 *   anyOf: [ { $ref: '#/components/schemas/UserProfileOut' }, {} ]
 *
 * In such cases we want the generated TypeScript type to be `UserProfileOut`
 * instead of an unnecessary union like `UserProfileOut | undefined` or
 * `UserProfileOut | undefined`.
 */
function getSingleRefTypeNameIfAllOthersEmpty(
  list: Array<Schema | Reference>
): string | null {
  let refTypeName: string | null = null;

  for (const item of list) {
    if (isRef(item)) {
      const typeName = extractTypeNameFromRef(item.$ref);
      if (refTypeName && refTypeName !== typeName) {
        // More than one distinct reference type – do not collapse.
        return null;
      }
      refTypeName = typeName;
    } else if (!isEmptySchema(item)) {
      // Found a non-empty, non-ref schema – cannot safely collapse.
      return null;
    }
  }

  return refTypeName;
}

