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
 * Filters out undefined values from a configuration object
 * @param config - Configuration object to filter
 * @returns Configuration object without undefined values
 */
function filterUndefined(config: Config): Partial<Config> {
  const filtered: Partial<Config> = {};
  
  if (config.input !== undefined) {
    filtered.input = config.input;
  }
  if (config.output !== undefined) {
    filtered.output = config.output;
  }
  if (config.clean !== undefined) {
    filtered.clean = config.clean;
  }
  if (config.pretty !== undefined) {
    filtered.pretty = config.pretty;
  }
  if (config.verbose !== undefined) {
    filtered.verbose = config.verbose;
  }
  if (config.pathPrefixSkip !== undefined) {
    filtered.pathPrefixSkip = config.pathPrefixSkip;
  }
  
  return filtered;
}

/**
 * Merges CLI arguments with config file values (CLI takes precedence)
 * Only non-undefined CLI values override file config values
 * @param cliConfig - Configuration from CLI arguments (may contain undefined values)
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

  // Filter out undefined values from CLI config to avoid overwriting file config
  const filteredCliConfig = filterUndefined(cliConfig);

  // CLI config overrides file config (only non-undefined values)
  return {
    ...(fileConfig || {}),
    ...filteredCliConfig,
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

