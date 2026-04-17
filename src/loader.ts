import { readFileSync } from 'fs';
import { existsSync } from 'fs';
import type { OpenAPISpec, SwaggerSpec } from './types.js';

/**
 * Loads OpenAPI/Swagger specification from a URL or local file
 * @param input - URL or file path
 * @returns Parsed OpenAPI/Swagger specification
 */
export async function loadSpec(input: string): Promise<OpenAPISpec | SwaggerSpec> {
  let content: string;

  if (isUrl(input)) {
    content = await fetchSpec(input);
  } else {
    content = loadLocalFile(input);
  }

  const rawSpec = JSON.parse(content) as OpenAPISpec | SwaggerSpec;
  const spec = sanitizeSpecForParser(rawSpec);

  // Basic validation
  if (!isOpenAPI(spec) && !isSwagger(spec)) {
    throw new Error('Invalid OpenAPI/Swagger specification. Missing "openapi" or "swagger" field.');
  }

  return spec;
}

/**
 * Sanitizes schema refs so parser can keep type names without recursively
 * expanding every reference branch in large specs.
 */
export function sanitizeSpecForParser(spec: OpenAPISpec | SwaggerSpec): OpenAPISpec | SwaggerSpec {
  const sanitized = structuredClone(spec) as OpenAPISpec | SwaggerSpec;
  const schemas =
    isOpenAPI(sanitized) ? sanitized.components?.schemas : sanitized.definitions;

  if (!schemas || typeof schemas !== 'object') {
    return sanitized;
  }

  for (const [schemaName, schemaValue] of Object.entries(schemas)) {
    if (isRefObject(schemaValue)) {
      schemas[schemaName] = wrapRef(schemaValue.$ref);
      continue;
    }
    schemas[schemaName] = sanitizeSchemaNode(schemaValue) as typeof schemas[string];
  }

  return sanitized;
}

/**
 * Checks if a string is a URL
 * @param str - String to check
 * @returns True if string is a URL
 */
function isUrl(str: string): boolean {
  try {
    new URL(str);
    return true;
  } catch {
    return false;
  }
}

/**
 * Fetches OpenAPI specification from a URL
 * @param url - URL to fetch from
 * @returns JSON content as string
 */
async function fetchSpec(url: string): Promise<string> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
    }
    return await response.text();
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to fetch OpenAPI spec from ${url}: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Loads OpenAPI specification from a local file
 * @param filePath - Path to the file
 * @returns File content as string
 */
function loadLocalFile(filePath: string): string {
  if (!existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  try {
    return readFileSync(filePath, 'utf-8');
  } catch (error) {
    throw new Error(`Failed to read file ${filePath}: ${error}`);
  }
}

/**
 * Checks if a spec is OpenAPI 3.x
 * @param spec - Specification to check
 * @returns True if spec is OpenAPI 3.x
 */
export function isOpenAPI(spec: unknown): spec is OpenAPISpec {
  return (
    typeof spec === 'object' &&
    spec !== null &&
    'openapi' in spec &&
    typeof (spec as { openapi: unknown }).openapi === 'string'
  );
}

/**
 * Checks if a spec is Swagger 2.0
 * @param spec - Specification to check
 * @returns True if spec is Swagger 2.0
 */
export function isSwagger(spec: unknown): spec is SwaggerSpec {
  return (
    typeof spec === 'object' &&
    spec !== null &&
    'swagger' in spec &&
    typeof (spec as { swagger: unknown }).swagger === 'string'
  );
}

function sanitizeSchemaNode(node: unknown): unknown {
  if (Array.isArray(node)) {
    return node.map((item) => sanitizeSchemaNode(item));
  }
  if (!node || typeof node !== 'object') {
    return node;
  }
  if (isRefObject(node)) {
    return { $ref: toNonResolvableSchemaRef(node.$ref) };
  }

  const clone: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    if ((key === 'oneOf' || key === 'anyOf' || key === 'allOf') && Array.isArray(value)) {
      clone[key] = value.map((item) =>
        isRefObject(item) ? wrapRef(item.$ref) : sanitizeSchemaNode(item)
      );
      continue;
    }
    clone[key] = sanitizeSchemaNode(value);
  }

  return clone;
}

function isRefObject(value: unknown): value is { $ref: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    '$ref' in value &&
    typeof (value as { $ref: unknown }).$ref === 'string'
  );
}

function toNonResolvableSchemaRef(ref: string): string {
  return `schema:///${extractRefTypeName(ref)}`;
}

function wrapRef(ref: string): { allOf: Array<{ $ref: string }> } {
  return { allOf: [{ $ref: toNonResolvableSchemaRef(ref) }] };
}

function extractRefTypeName(ref: string): string {
  const parts = ref.split('/').filter(Boolean);
  return parts[parts.length - 1] || ref;
}

