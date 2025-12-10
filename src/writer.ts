import { mkdir, writeFile, rm } from 'fs/promises';
import { join, dirname, relative, resolve } from 'path';
import { existsSync } from 'fs';
import type { TypeDefinition, NormalizedSpec } from './types.js';
import { pathToEndpointName } from './generator/index.js';

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
  options: { clean?: boolean; pretty?: boolean; verbose?: boolean; pathPrefixSkip?: number }
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

  // Write endpoint types (grouped by path segments)
  const endpointsByFolder = new Map<string, Map<string, TypeDefinition>>();

  for (const [name, type] of endpointTypes.entries()) {
    // Extract path from endpoint by looking it up in the spec
    const endpointPath = extractPathFromEndpoint(name, spec, options.pathPrefixSkip || 0);
    const folderPath = getEndpointFolderPath(endpointPath, options.pathPrefixSkip || 0);
    
    if (!endpointsByFolder.has(folderPath)) {
      endpointsByFolder.set(folderPath, new Map());
    }
    endpointsByFolder.get(folderPath)!.set(name, type);
  }

  for (const [folderPath, endpoints] of endpointsByFolder.entries()) {
    const folderDir = folderPath === '' ? endpointsDir : join(endpointsDir, folderPath);
    await mkdir(folderDir, { recursive: true });

    for (const [name, type] of endpoints.entries()) {
      const filePath = join(folderDir, `${name}.ts`);
      await writeTypeFile(filePath, type, schemaTypes, outputDir, options);
      if (options.verbose) {
        console.log(`Generated: ${filePath}`);
      }
    }
  }

  // Write index files
  await writeIndexFiles(outputDir, schemasDir, endpointsDir, schemaTypes, endpointsByFolder);
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
 * @param endpointsByFolder - Endpoints grouped by folder path
 */
async function writeIndexFiles(
  outputDir: string,
  schemasDir: string,
  endpointsDir: string,
  schemaTypes: Map<string, TypeDefinition>,
  endpointsByFolder: Map<string, Map<string, TypeDefinition>>
): Promise<void> {
  // Write schemas index
  const schemaExports: string[] = [];
  for (const name of schemaTypes.keys()) {
    schemaExports.push(`export type { ${name} } from './schemas/${name}';`);
  }

  // Write endpoints index
  const endpointExports: string[] = [];
  for (const [folderPath, endpoints] of endpointsByFolder.entries()) {
    for (const name of endpoints.keys()) {
      const relativePath = folderPath === '' ? `./endpoints/${name}` : `./endpoints/${folderPath}/${name}`;
      endpointExports.push(`export type { ${name} } from '${relativePath}';`);
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
 * Extracts path from endpoint name by looking it up in the spec
 * @param endpointName - Endpoint operation ID
 * @param spec - Normalized specification
 * @param pathPrefixSkip - Number of path segments to skip (must match the skip used when generating the name)
 * @returns API path
 */
function extractPathFromEndpoint(endpointName: string, spec: NormalizedSpec, pathPrefixSkip: number = 0): string {
  for (const [path, pathItem] of Object.entries(spec.paths)) {
    const methods = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'] as const;
    for (const method of methods) {
      const operation = pathItem[method];
      if (operation) {
        // Check if this endpoint matches by comparing path-based name with the same skip value
        const pathBasedName = pathToEndpointName(path, pathPrefixSkip);
        if (pathBasedName === endpointName || operation.operationId === endpointName) {
          return path;
        }
      }
    }
  }
  return '/';
}


/**
 * Gets folder path for endpoint based on path segments (all except last)
 * @param path - API path
 * @param pathPrefixSkip - Number of path segments to skip
 * @returns Folder path (e.g., "auth" for "/api/v1/auth/login" with skip=1)
 */
function getEndpointFolderPath(path: string, pathPrefixSkip: number = 0): string {
  if (path === '/' || path.trim() === '' || path.replace(/^\/+|\/+$/g, '') === '') {
    return '';
  }
  
  const segments = path.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
  const filteredSegments = segments.filter(segment => !segment.includes('{') && !segment.includes('}'));
  const skipCount = pathPrefixSkip > 0 ? pathPrefixSkip * 2 : 0;
  const skippedSegments = filteredSegments.slice(skipCount);
  
  // If no segments or only one segment, return empty (no subfolder)
  if (skippedSegments.length <= 1) {
    return '';
  }
  
  // Take all segments except the last one
  const folderSegments = skippedSegments.slice(0, -1);
  const processedSegments = folderSegments.map(segment => segment.replace(/-/g, '_'));
  
  return processedSegments.join('/').toLowerCase();
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

