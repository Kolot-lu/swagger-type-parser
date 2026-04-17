import { mkdir, writeFile, rm } from 'fs/promises';
import { join, dirname, relative, resolve } from 'path';
import { existsSync } from 'fs';
import type { TypeDefinition, NormalizedSpec } from './types.js';
import { generateApiEndpointsFile } from './generator/api-endpoints-generator.js';

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
  options: { clean?: boolean; pretty?: boolean; verbose?: boolean; pathPrefixSkip?: number; generateApiEndpoints?: boolean }
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
  const apiDir = join(outputDir, 'api');

  await mkdir(schemasDir, { recursive: true });
  await mkdir(endpointsDir, { recursive: true });
  await mkdir(commonDir, { recursive: true });
  
  // Create API directory if endpoints generation is enabled
  if (options.generateApiEndpoints) {
    await mkdir(apiDir, { recursive: true });
  }

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
  const endpointIndexEntries: Array<{ filePath: string; exportedTypes: string[] }> = [];

  for (const [legacyName, type] of endpointTypes.entries()) {
    const endpointFilePath = type.filePath || legacyName;
    const pathSegments = endpointFilePath.split('/');
    const name = pathSegments[pathSegments.length - 1];
    const folderPath =
      pathSegments.length > 1 ? pathSegments.slice(0, -1).join('/') : '';
    
    if (!endpointsByFolder.has(folderPath)) {
      endpointsByFolder.set(folderPath, new Map());
    }
    endpointsByFolder.get(folderPath)!.set(name, type);
    endpointIndexEntries.push({
      filePath: endpointFilePath,
      exportedTypes: type.exportedTypes || [],
    });
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

  // Write API endpoints if enabled
  if (options.generateApiEndpoints) {
    await writeApiEndpoints(apiDir, spec, options);
    if (options.verbose) {
      console.log(`Generated: ${join(apiDir, 'index.ts')}`);
    }
  }

  // Write index files
  await validateEndpointExports(endpointIndexEntries);
  await writeIndexFiles(outputDir, schemaTypes, endpointIndexEntries, options.generateApiEndpoints);
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
 * Writes API endpoints constants file
 * @param apiDir - API directory path
 * @param spec - Normalized specification
 * @param options - Writer options
 */
async function writeApiEndpoints(
  apiDir: string,
  spec: NormalizedSpec,
  options: { pretty?: boolean; pathPrefixSkip?: number }
): Promise<void> {
  const content = generateApiEndpointsFile(spec, {
    pathPrefixSkip: options.pathPrefixSkip,
  });

  // Format with Prettier if requested
  let finalContent = content;
  if (options.pretty) {
    try {
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

  await writeFile(join(apiDir, 'index.ts'), finalContent, 'utf-8');
}

/**
 * Writes index files for easy imports
 * @param outputDir - Root output directory
 * @param schemasDir - Schemas directory
 * @param endpointsDir - Endpoints directory
 * @param schemaTypes - All schema types
 * @param endpointsByFolder - Endpoints grouped by folder path
 * @param generateApiEndpoints - Whether API endpoints were generated
 */
async function writeIndexFiles(
  outputDir: string,
  schemaTypes: Map<string, TypeDefinition>,
  endpointIndexEntries: Array<{ filePath: string; exportedTypes: string[] }>,
  generateApiEndpoints?: boolean
): Promise<void> {
  // Write schemas index
  const schemaExports: string[] = [];
  for (const name of schemaTypes.keys()) {
    schemaExports.push(`export type { ${name} } from './schemas/${name}';`);
  }

  // Write endpoints index
  const endpointExports: string[] = [];
  for (const endpointEntry of endpointIndexEntries) {
    endpointExports.push(`export * from './endpoints/${endpointEntry.filePath}';`);
  }

  // Write main index
  const mainIndexLines = [
    "// Common types",
    "export * from './common/Http';",
    "",
    "// Schema types",
    ...schemaExports,
    "",
    "// Endpoint types",
    ...endpointExports,
  ];
  
  // Add API endpoints export if generated
  if (generateApiEndpoints) {
    mainIndexLines.push("");
    mainIndexLines.push("// API endpoint URL constants");
    mainIndexLines.push("export * from './api';");
  }
  
  const mainIndex = mainIndexLines.join('\n');

  await writeFile(join(outputDir, 'index.ts'), mainIndex, 'utf-8');
}

/**
 * Validates that generated endpoint files export at least one type.
 * This is a safety guard that catches regressions in code generation before writing barrel exports.
 */
async function validateEndpointExports(
  endpointIndexEntries: Array<{ filePath: string; exportedTypes: string[] }>
): Promise<void> {
  const emptyExports = endpointIndexEntries.filter((entry) => entry.exportedTypes.length === 0);
  if (emptyExports.length > 0) {
    const files = emptyExports.map((entry) => entry.filePath).join(', ');
    throw new Error(`Generated endpoint files without exports detected: ${files}`);
  }
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

