#!/usr/bin/env node

import { Command } from 'commander';
import { loadSpec, isOpenAPI, isSwagger } from './loader.js';
import { normalizeSpec } from './parser.js';
import { generateTypes } from './generator/index.js';
import { writeTypes } from './writer.js';
import { mergeConfig, validateConfig } from './config.js';
import type { Config } from './types.js';

/**
 * Main CLI entry point for swagger-type-parser
 * 
 * This tool:
 * 1. Loads OpenAPI/Swagger specification from URL or file
 * 2. Parses and normalizes the specification
 * 3. Generates TypeScript type definitions
 * 4. Writes types to the output directory in a decomposed structure
 */
async function main(): Promise<void> {
  const program = new Command();

  program
    .name('swagger-type-parser')
    .description('Generate TypeScript types from OpenAPI/Swagger specifications')
    .version('1.0.0')
    .option('-i, --input <url-or-path>', 'URL or path to OpenAPI/Swagger JSON')
    .option('-o, --output <directory>', 'Output directory for generated TypeScript files')
    .option('-c, --config <path>', 'Path to config file (default: swagger-type-parser.config.json)')
    .option('--clean', 'Clean output directory before generation', false)
    .option('--pretty', 'Format generated code with Prettier', false)
    .option('--verbose', 'Log verbose debug information', false)
    .option('--path-prefix-skip <number>', 'Number of path segments to skip from beginning (e.g., 1 = skip first 2 segments: "/api/v1/auth/login" -> "auth_login")', (value) => parseInt(value, 10))
    .option('--generate-api-endpoints', 'Generate API endpoint URL constants for easy access from frontend', false)
    .parse(process.argv);

  const options = program.opts<Config & { config?: string }>();

  try {
    // Merge CLI options with config file
    const config = mergeConfig(
      {
        input: options.input,
        output: options.output,
        clean: options.clean,
        pretty: options.pretty,
        verbose: options.verbose,
        pathPrefixSkip: options.pathPrefixSkip,
        generateApiEndpoints: options.generateApiEndpoints,
      },
      options.config
    );

    // Validate required fields
    validateConfig(config);

    if (config.verbose) {
      console.log('Configuration:', JSON.stringify(config, null, 2));
    }

    // Load specification
    if (config.verbose) {
      console.log(`Loading specification from: ${config.input}`);
    }
    const spec = await loadSpec(config.input!);

    // Normalize specification
    if (config.verbose) {
      const version = isOpenAPI(spec) ? spec.openapi : isSwagger(spec) ? spec.swagger : 'unknown';
      console.log(`Specification version: ${version}`);
      console.log('Normalizing specification...');
    }
    const normalized = normalizeSpec(spec);

    // Generate types
    if (config.verbose) {
      console.log('Generating TypeScript types...');
      console.log(`Found ${Object.keys(normalized.components.schemas).length} schemas`);
      console.log(`Found ${Object.keys(normalized.paths).length} paths`);
    }
    const types = generateTypes(normalized, config);

    if (config.verbose) {
      console.log(`Generated ${types.size} type definitions`);
    }

    // Write types to file system
    if (config.verbose) {
      console.log(`Writing types to: ${config.output}`);
    }
    await writeTypes(config.output!, types, normalized, {
      clean: config.clean,
      pretty: config.pretty,
      verbose: config.verbose,
      pathPrefixSkip: config.pathPrefixSkip,
      generateApiEndpoints: config.generateApiEndpoints,
    });

    console.log(`✅ Successfully generated TypeScript types in ${config.output}`);
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : String(error));
    if (options.verbose && error instanceof Error && error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Run CLI
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

