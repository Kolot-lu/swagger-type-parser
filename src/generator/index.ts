/**
 * Main type generator module
 * 
 * This is the entry point for generating TypeScript types from OpenAPI specifications.
 * It orchestrates the generation of schema types and endpoint types.
 */

import type { NormalizedSpec, TypeDefinition, Config } from '../types.js';
import { generateSchemaType } from './schema-generator.js';
import { generateEndpointTypes, generateEndpointTypeCode } from './endpoint-generator.js';
import { extractDependencies } from './dependencies.js';
import { extractEndpointDependencies } from './dependencies.js';

/**
 * Generates TypeScript types from a normalized OpenAPI specification
 * 
 * This is the main entry point for type generation. It processes:
 * 1. Component schemas - generates types for all schemas in components.schemas
 * 2. Endpoint types - generates types for all API endpoints with their parameters,
 *    request bodies, and responses
 * 
 * @param spec - Normalized OpenAPI specification
 * @param config - Configuration options (including pathPrefixSkip for endpoint naming)
 * @returns Map of type names to TypeScript type definitions
 * 
 * @example
 * ```typescript
 * const types = generateTypes(normalizedSpec, { pathPrefixSkip: 1 });
 * // Returns Map with keys like "User", "Order", "endpoint:auth_login", etc.
 * ```
 */
export function generateTypes(
  spec: NormalizedSpec,
  config: Config = {}
): Map<string, TypeDefinition> {
  const types = new Map<string, TypeDefinition>();

  // Generate schema types from components.schemas
  for (const [name, schema] of Object.entries(spec.components.schemas)) {
    const code = generateSchemaType(name, schema, spec);
    const dependencies = extractDependencies(schema, spec);
    types.set(name, { name, code, dependencies });
  }

  // Generate endpoint types from paths
  const endpointTypes = generateEndpointTypes(spec, config);
  for (const endpoint of endpointTypes) {
    const fileName = endpoint.fileName;
    const endpointFilePath =
      endpoint.folderPath === '' ? fileName : `${endpoint.folderPath}/${fileName}`;
    const code = generateEndpointTypeCode(endpoint, spec, config);
    const dependencies = extractEndpointDependencies(endpoint);
    types.set(`endpoint:${endpoint.path}:${endpoint.method}`, {
      name: fileName,
      code,
      dependencies,
      filePath: endpointFilePath,
      exportedTypes: extractExportedTypeNames(code),
    });
  }

  return types;
}

function extractExportedTypeNames(code: string): string[] {
  const matches = code.matchAll(/^export type ([A-Za-z0-9_]+)\s*=/gm);
  return Array.from(matches, (match) => match[1]);
}

// Re-export utilities that might be needed by other modules
export { pathToEndpointName, extractTypeNameFromRef } from './path-utils.js';
export { generateSchemaType, schemaToTypeScript } from './schema-generator.js';
export { generateParameterType } from './parameter-generator.js';
export { generateEndpointTypes, generateEndpointTypeCode } from './endpoint-generator.js';
export { extractDependencies, extractEndpointDependencies } from './dependencies.js';

