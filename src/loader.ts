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

  const spec = JSON.parse(content) as OpenAPISpec | SwaggerSpec;

  // Basic validation
  if (!isOpenAPI(spec) && !isSwagger(spec)) {
    throw new Error('Invalid OpenAPI/Swagger specification. Missing "openapi" or "swagger" field.');
  }

  return spec;
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

