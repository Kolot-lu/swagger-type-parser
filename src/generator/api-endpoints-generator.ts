/**
 * API endpoints URL constants generator
 * 
 * This module generates TypeScript constants for API endpoint URLs,
 * organized in a nested object structure matching the endpoint folder hierarchy.
 * This allows frontend developers to use typed endpoint paths instead of
 * manually writing URL strings.
 */

import type { NormalizedSpec, Config } from '../types.js';
import { generateEndpointTypes } from './endpoint-generator.js';

/**
 * Represents the structure of API endpoints organized by folder hierarchy
 */
interface ApiEndpointsStructure {
  [key: string]: string | ApiEndpointsStructure;
}

/**
 * Generates API endpoint URL constants from OpenAPI specification
 * 
 * Creates a nested object structure where endpoints are organized by their
 * folder paths (excluding the last segment), matching the endpoint type structure.
 * 
 * @param spec - Normalized OpenAPI specification
 * @param config - Configuration options (including pathPrefixSkip)
 * @returns TypeScript code for API endpoints constants
 * 
 * @example
 * ```typescript
 * // Generated structure:
 * export const apiEndpoints = {
 *   auth: {
 *     auth_login: '/api/v1/auth/login',
 *     auth_register: '/api/v1/auth/register',
 *   },
 *   users: {
 *     users_list: '/api/v1/users',
 *   },
 * };
 * ```
 */
export function generateApiEndpoints(spec: NormalizedSpec, config: Config = {}): string {
  const pathPrefixSkip = config.pathPrefixSkip || 0;
  const endpoints = generateEndpointTypes(spec, config);
  
  // Build nested structure organized by folder paths
  const structure: ApiEndpointsStructure = {};
  
  for (const endpoint of endpoints) {
    const folderPath = getEndpointFolderPath(endpoint.path, pathPrefixSkip);
    const endpointName = endpoint.operationId;
    const endpointPath = endpoint.path;
    
    // Navigate/create nested structure
    let current = structure;
    
    if (folderPath) {
      // Split folder path into segments
      const folderSegments = folderPath.split('/').filter(Boolean);
      
      // Create nested objects for each folder segment
      for (const segment of folderSegments) {
        if (!current[segment] || typeof current[segment] === 'string') {
          current[segment] = {};
        }
        current = current[segment] as ApiEndpointsStructure;
      }
    }
    
    // Add endpoint path to the current level
    current[endpointName] = endpointPath;
  }
  
  // Generate TypeScript code from structure
  return generateTypeScriptCode(structure);
}

/**
 * Gets folder path for endpoint based on path segments (all except last)
 * This matches the logic used in writer.ts for endpoint folder organization
 * 
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
 * Generates TypeScript code from nested structure
 * 
 * @param structure - Nested object structure
 * @param indent - Current indentation level
 * @returns TypeScript code string
 */
function generateTypeScriptCode(structure: ApiEndpointsStructure, indent: number = 0): string {
  const nextIndent = indent + 1;
  const nextIndentStr = '  '.repeat(nextIndent);
  
  const lines: string[] = [];
  const entries = Object.entries(structure).sort(([a], [b]) => a.localeCompare(b));
  
  for (let i = 0; i < entries.length; i++) {
    const [key, value] = entries[i];
    const isLast = i === entries.length - 1;
    
    if (typeof value === 'string') {
      // Leaf node - endpoint path
      const comma = isLast ? '' : ',';
      lines.push(`${nextIndentStr}${key}: ${JSON.stringify(value)}${comma}`);
    } else {
      // Nested object - folder
      const comma = isLast ? '' : ',';
      lines.push(`${nextIndentStr}${key}: {`);
      lines.push(generateTypeScriptCode(value, nextIndent));
      lines.push(`${nextIndentStr}}${comma}`);
    }
  }
  
  return lines.join('\n');
}

/**
 * Generates the complete API endpoints file content
 * 
 * @param spec - Normalized OpenAPI specification
 * @param config - Configuration options
 * @returns Complete TypeScript file content
 */
export function generateApiEndpointsFile(spec: NormalizedSpec, config: Config = {}): string {
  const structureCode = generateApiEndpoints(spec, config);
  
  return `/**
 * API Endpoint URL Constants
 * 
 * This file contains all API endpoint URLs organized by their folder structure.
 * Use these constants instead of manually writing URL strings for type safety and maintainability.
 * 
 * @example
 * \`\`\`typescript
 * import { apiEndpoints } from './api';
 * 
 * await apiClient.post<AuthResponse>(
 *   apiEndpoints.auth.auth_login,
 *   payload,
 *   { skipAuth: true }
 * );
 * \`\`\`
 */

export const apiEndpoints = {
${structureCode}
} as const;

/**
 * Type helper for API endpoints structure
 */
export type ApiEndpoints = typeof apiEndpoints;

/**
 * Replaces path parameters in a URL template with actual values
 * 
 * This utility function helps build complete URLs from endpoint templates
 * that contain path parameters (e.g., '/api/v1/users/{user_id}').
 * 
 * @param urlTemplate - URL template with parameters in curly braces (e.g., '/api/v1/users/{user_id}')
 * @param params - Object with parameter values (e.g., { user_id: '123' })
 * @returns Complete URL with parameters replaced (e.g., '/api/v1/users/123')
 * 
 * @example
 * \`\`\`typescript
 * import { apiEndpoints, buildUrl } from './api';
 * 
 * // Simple single parameter
 * const url = buildUrl(apiEndpoints.users.users_profile, { user_id: '123' });
 * // Returns: '/api/v1/users/profile/123'
 * 
 * // Multiple parameters
 * const url2 = buildUrl(
 *   apiEndpoints.dynamic_fields.dynamic_fields_entities,
 *   { entity_type: 'user_profile', entity_id: '456' }
 * );
 * // Returns: '/api/v1/dynamic-fields/entities/user_profile/456'
 * 
 * // No parameters (returns as-is)
 * const url3 = buildUrl(apiEndpoints.auth.auth_login, {});
 * // Returns: '/api/v1/auth/login'
 * \`\`\`
 */
export function buildUrl<T extends Record<string, string | number>>(
  urlTemplate: string,
  params: T
): string {
  let url = urlTemplate;
  
  // Replace each parameter in the template
  for (const [key, value] of Object.entries(params)) {
    // Replace all occurrences of {key} with the value
    const regex = new RegExp('\\\\{' + key + '\\\\}', 'g');
    url = url.replace(regex, String(value));
  }
  
  // Check if there are any remaining placeholders
  const remainingPlaceholders = url.match(/\\{[^}]+\\}/g);
  if (remainingPlaceholders && remainingPlaceholders.length > 0) {
    const missing = remainingPlaceholders.map(p => p.slice(1, -1)).join(', ');
    throw new Error(
      'Missing required path parameters: ' + missing + '. ' +
      'Provided params: ' + Object.keys(params).join(', ')
    );
  }
  
  return url;
}
`;
}

