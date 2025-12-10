/**
 * Dependency extraction utilities
 * 
 * This module handles extraction of type dependencies from schemas and endpoints.
 * Dependencies are used to generate proper import statements in generated TypeScript files.
 */

import type { NormalizedSpec, Schema, Reference, EndpointType } from '../types.js';
import { isRef, resolveRef } from '../parser.js';
import { extractTypeNameFromRef } from './path-utils.js';

/**
 * Extracts dependencies from a schema
 * 
 * Recursively traverses a schema to find all $ref references,
 * building a set of type names that this schema depends on.
 * 
 * @param schema - Schema to analyze
 * @param spec - Full specification for resolving references
 * @returns Array of type names this schema depends on
 */
export function extractDependencies(
  schema: Schema | Reference,
  spec: NormalizedSpec
): string[] {
  const deps = new Set<string>();

  /**
   * Recursive function to traverse schema and collect dependencies
   */
  function traverse(s: Schema | Reference): void {
    if (isRef(s)) {
      const typeName = extractTypeNameFromRef(s.$ref);
      deps.add(typeName);
      
      // Resolve and continue traversing to find nested dependencies
      const resolved = resolveRef(s.$ref, spec);
      if (resolved && 'type' in resolved) {
        traverse(resolved as Schema);
      }
    } else {
      // Traverse object properties
      if (s.properties) {
        for (const prop of Object.values(s.properties)) {
          traverse(prop);
        }
      }
      
      // Traverse array items
      if (s.items) {
        traverse(s.items);
      }
      
      // Traverse union types (oneOf)
      if (s.oneOf) {
        for (const item of s.oneOf) {
          traverse(item);
        }
      }
      
      // Traverse union types (anyOf)
      if (s.anyOf) {
        for (const item of s.anyOf) {
          traverse(item);
        }
      }
      
      // Traverse intersection types (allOf)
      if (s.allOf) {
        for (const item of s.allOf) {
          traverse(item);
        }
      }
      
      // Traverse additionalProperties
      if (s.additionalProperties && typeof s.additionalProperties === 'object') {
        traverse(s.additionalProperties);
      }
    }
  }

  traverse(schema);
  return Array.from(deps);
}

/**
 * Extracts dependencies from an endpoint
 * 
 * Collects all type dependencies from:
 * - Request body types
 * - Response types
 * 
 * @param endpoint - Endpoint type definition
 * @returns Array of type names this endpoint depends on
 */
export function extractEndpointDependencies(endpoint: EndpointType): string[] {
  const deps = new Set<string>();

  // Collect dependencies from request body
  if (endpoint.requestBody) {
    for (const dep of endpoint.requestBody.dependencies) {
      deps.add(dep);
    }
  }

  // Collect dependencies from all responses
  for (const response of Object.values(endpoint.responses)) {
    for (const dep of response.dependencies) {
      deps.add(dep);
    }
  }

  return Array.from(deps);
}

