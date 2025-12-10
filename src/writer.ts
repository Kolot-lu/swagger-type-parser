import { mkdir, writeFile, rm } from 'fs/promises';
import { join, dirname, relative, resolve } from 'path';
import { existsSync } from 'fs';
import type { TypeDefinition, NormalizedSpec } from './types.js';

/**
 * Writes generated TypeScript types to the file system
 * @param outputDir - Output directory
 * @param types - Map of type definitions
 * @param spec - Normalized specification
 * @param options - Writer options
 */
export async function writeTypes(
  outputDir: string,
  types: Map<string, TypeDefinition>,
  spec: NormalizedSpec,
  options: { clean?: boolean; pretty?: boolean; verbose?: boolean }
): Promise<void> {
  // Clean output directory if requested
  if (options.clean && existsSync(outputDir)) {
    if (options.verbose) {
      console.log(`Cleaning output directory: ${outputDir}`);
    }
    await rm(outputDir, { recursive: true, force: true });
  }

  // Create directory structure
  const schemasDir = join(outputDir, 'schemas');
  const endpointsDir = join(outputDir, 'endpoints');
  const commonDir = join(outputDir, 'common');

  await mkdir(schemasDir, { recursive: true });
  await mkdir(endpointsDir, { recursive: true });
  await mkdir(commonDir, { recursive: true });

  // Write common types
  await writeCommonTypes(commonDir);

  // Separate schema types from endpoint types
  const schemaTypes = new Map<string, TypeDefinition>();
  const endpointTypes = new Map<string, TypeDefinition>();

  for (const [key, type] of types.entries()) {
    if (key.startsWith('endpoint:')) {
      endpointTypes.set(key.replace('endpoint:', ''), type);
    } else {
      schemaTypes.set(key, type);
    }
  }

  // Write schema types
  for (const [name, type] of schemaTypes.entries()) {
    const filePath = join(schemasDir, `${name}.ts`);
    await writeTypeFile(filePath, type, schemaTypes, outputDir, options);
    if (options.verbose) {
      console.log(`Generated: ${filePath}`);
    }
  }

  // Write endpoint types (grouped by tag)
  const endpointsByTag = new Map<string, Map<string, TypeDefinition>>();

  for (const [name, type] of endpointTypes.entries()) {
    // Extract tag from endpoint (we need to get it from the spec)
    const tag = extractTagFromEndpoint(name, spec);
    if (!endpointsByTag.has(tag)) {
      endpointsByTag.set(tag, new Map());
    }
    endpointsByTag.get(tag)!.set(name, type);
  }

  for (const [tag, endpoints] of endpointsByTag.entries()) {
    const tagDir = join(endpointsDir, tag);
    await mkdir(tagDir, { recursive: true });

    for (const [name, type] of endpoints.entries()) {
      const filePath = join(tagDir, `${name}.ts`);
      await writeTypeFile(filePath, type, schemaTypes, outputDir, options);
      if (options.verbose) {
        console.log(`Generated: ${filePath}`);
      }
    }
  }

  // Write index files
  await writeIndexFiles(outputDir, schemasDir, endpointsDir, schemaTypes, endpointsByTag);
}

/**
 * Writes a type file with imports for dependencies
 * @param filePath - Path to write to
 * @param type - Type definition
 * @param allSchemas - All available schema types for imports
 * @param options - Writer options
 */
async function writeTypeFile(
  filePath: string,
  type: TypeDefinition,
  allSchemas: Map<string, TypeDefinition>,
  outputDir: string,
  options: { pretty?: boolean }
): Promise<void> {
  // Collect imports
  const imports: string[] = [];
  for (const dep of type.dependencies) {
    if (allSchemas.has(dep)) {
      // Calculate relative path
      const relativePath = getRelativePath(filePath, `schemas/${dep}`, outputDir);
      imports.push(`import type { ${dep} } from '${relativePath}';`);
    }
  }

  // Combine imports and type code
  const content = imports.length > 0 ? `${imports.join('\n')}\n\n${type.code}` : type.code;

  // Format with Prettier if requested
  let finalContent = content;
  if (options.pretty) {
    try {
      // Try to use prettier if available
      const prettier = await import('prettier');
      finalContent = await prettier.format(content, {
        parser: 'typescript',
        singleQuote: true,
        semi: true,
        trailingComma: 'es5',
        printWidth: 100,
      });
    } catch {
      // Prettier not available, use as-is
      finalContent = content;
    }
  }

  await writeFile(filePath, finalContent, 'utf-8');
}

/**
 * Writes common utility types
 * @param commonDir - Common directory path
 */
async function writeCommonTypes(commonDir: string): Promise<void> {
  const httpTypes = `export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

export interface RequestConfig {
  method: HttpMethod;
  path: string;
  pathParams?: Record<string, string | number>;
  queryParams?: Record<string, string | number | boolean | (string | number | boolean)[]>;
  headers?: Record<string, string>;
  body?: unknown;
}
`;

  await writeFile(join(commonDir, 'Http.ts'), httpTypes, 'utf-8');
}

/**
 * Writes index files for easy imports
 * @param outputDir - Root output directory
 * @param schemasDir - Schemas directory
 * @param endpointsDir - Endpoints directory
 * @param schemaTypes - All schema types
 * @param endpointsByTag - Endpoints grouped by tag
 */
async function writeIndexFiles(
  outputDir: string,
  schemasDir: string,
  endpointsDir: string,
  schemaTypes: Map<string, TypeDefinition>,
  endpointsByTag: Map<string, Map<string, TypeDefinition>>
): Promise<void> {
  // Write schemas index
  const schemaExports: string[] = [];
  for (const name of schemaTypes.keys()) {
    schemaExports.push(`export type { ${name} } from './schemas/${name}';`);
  }

  // Write endpoints index
  const endpointExports: string[] = [];
  for (const [tag, endpoints] of endpointsByTag.entries()) {
    for (const name of endpoints.keys()) {
      endpointExports.push(`export type { ${name} } from './endpoints/${tag}/${name}';`);
    }
  }

  // Write main index
  const mainIndex = [
    "// Common types",
    "export * from './common/Http';",
    "",
    "// Schema types",
    ...schemaExports,
    "",
    "// Endpoint types",
    ...endpointExports,
  ].join('\n');

  await writeFile(join(outputDir, 'index.ts'), mainIndex, 'utf-8');
}

/**
 * Extracts tag from endpoint name by looking it up in the spec
 * @param endpointName - Endpoint operation ID
 * @param spec - Normalized specification
 * @returns Tag name
 */
function extractTagFromEndpoint(endpointName: string, spec: NormalizedSpec): string {
  for (const [path, pathItem] of Object.entries(spec.paths)) {
    const methods = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'] as const;
    for (const method of methods) {
      const operation = pathItem[method];
      if (operation && (operation.operationId === endpointName || generateOperationId(method, path) === endpointName)) {
        return operation.tags?.[0] || 'default';
      }
    }
  }
  return 'default';
}

/**
 * Generates operation ID from method and path (same logic as in generator)
 * @param method - HTTP method
 * @param path - API path
 * @returns Operation ID
 */
function generateOperationId(method: string, path: string): string {
  const pathParts = path
    .split('/')
    .filter((p) => p && !p.startsWith('{'))
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1));
  const methodCapitalized = method.charAt(0).toUpperCase() + method.slice(1);
  return methodCapitalized + pathParts.join('');
}

/**
 * Calculates relative path from one file to another
 * @param from - Source file path (absolute or relative to cwd)
 * @param to - Target file path (relative to output directory)
 * @param outputDir - Output directory base path
 * @returns Relative import path
 */
function getRelativePath(from: string, to: string, outputDir: string): string {
  // Resolve absolute paths
  const fromAbsolute = resolve(from);
  const fromDir = dirname(fromAbsolute);
  const toAbsolute = resolve(outputDir, to.replace(/\.ts$/, ''));
  
  // Calculate relative path
  let relativePath = relative(fromDir, toAbsolute).replace(/\\/g, '/');
  
  // Ensure it starts with ./ for same directory or parent
  if (!relativePath.startsWith('.')) {
    relativePath = './' + relativePath;
  }
  
  // Remove .ts extension if present
  relativePath = relativePath.replace(/\.ts$/, '');
  
  return relativePath;
}

