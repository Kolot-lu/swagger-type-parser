import { readFileSync } from 'fs';
import { join } from 'path';
import type { Config } from './types.js';

const DEFAULT_CONFIG_FILE = 'swagger-type-parser.config.json';

/**
 * Loads configuration from a JSON file
 * @param configPath - Path to the config file
 * @returns Configuration object or null if file doesn't exist
 */
export function loadConfigFile(configPath: string): Config | null {
  try {
    const content = readFileSync(configPath, 'utf-8');
    const config = JSON.parse(content) as Config;
    return config;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw new Error(`Failed to load config file: ${error}`);
  }
}

/**
 * Merges CLI arguments with config file values (CLI takes precedence)
 * @param cliConfig - Configuration from CLI arguments
 * @param configPath - Optional path to config file
 * @returns Merged configuration
 */
export function mergeConfig(cliConfig: Config, configPath?: string): Config {
  let fileConfig: Config | null = null;

  if (configPath) {
    fileConfig = loadConfigFile(configPath);
    if (!fileConfig) {
      throw new Error(`Config file not found: ${configPath}`);
    }
  } else {
    // Try default config file
    const defaultPath = join(process.cwd(), DEFAULT_CONFIG_FILE);
    fileConfig = loadConfigFile(defaultPath);
  }

  // CLI config overrides file config
  return {
    ...fileConfig,
    ...cliConfig,
  };
}

/**
 * Validates that required configuration fields are present
 * @param config - Configuration to validate
 * @throws Error if required fields are missing
 */
export function validateConfig(config: Config): void {
  if (!config.input) {
    throw new Error('Input is required. Provide --input flag or set "input" in config file.');
  }
  if (!config.output) {
    throw new Error('Output is required. Provide --output flag or set "output" in config file.');
  }
}

