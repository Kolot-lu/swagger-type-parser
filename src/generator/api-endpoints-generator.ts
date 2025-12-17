/**
 * API endpoints URL constants generator
 * 
 * This module generates TypeScript constants for API endpoint URLs,
 * organized in a nested object structure matching the endpoint folder hierarchy.
 * This allows frontend developers to use typed endpoint paths instead of
 * manually writing URL strings.
 */

import type { NormalizedSpec, Config, EndpointType } from '../types.js';
import { generateEndpointTypes } from './endpoint-generator.js';

/**
 * Represents the structure of API endpoints organized by folder hierarchy
 */
interface ApiEndpointsStructure {
  [key: string]: string | ApiEndpointsStructure;
}

/**
 * Internal representation of an endpoint used during name resolution.
 * It keeps track of the folder path, base endpoint name and HTTP method
 * so we can generate stable and collision‑free keys.
 */
interface EndpointMeta {
  folderPath: string;
  baseName: string;
  method: EndpointType['method'];
  path: string;
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

  // Prepare metadata for all endpoints (folder path, base name, method, path)
  const metas: EndpointMeta[] = endpoints.map((endpoint) => ({
    folderPath: getEndpointFolderPath(endpoint.path, pathPrefixSkip),
    baseName: endpoint.operationId,
    method: endpoint.method,
    path: endpoint.path,
  }));

  // Resolve final, collision‑free keys for each endpoint within its folder
  const resolvedNames = resolveEndpointNames(metas);

  // Build nested structure organized by folder paths
  const structure: ApiEndpointsStructure = {};
  
  for (let i = 0; i < metas.length; i += 1) {
    const meta = metas[i];
    const endpointName = resolvedNames[i];
    const endpointPath = meta.path;
    const folderPath = meta.folderPath;
    
    // Navigate/create nested structure
    let current = structure;
    
    if (folderPath) {
      // Split folder path into segments
      const folderSegments = folderPath.split('/').filter(Boolean);

      // Create nested objects for each folder segment.
      // If we encounter an existing string value (previously used as a leaf),
      // we convert it into an object and preserve the original path under `_self`.
      for (const segment of folderSegments) {
        const existing = current[segment];

        if (!existing) {
          current[segment] = {};
        } else if (typeof existing === 'string') {
          current[segment] = { _self: existing };
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
 * Resolves unique, human‑readable keys for each endpoint within its folder.
 *
 * The algorithm works as follows:
 * - Endpoints are grouped by (folderPath, baseName).
 * - If a group contains a single endpoint, its key is just the baseName.
 * - If there are multiple endpoints:
 *   - When they share the same path but differ by HTTP method
 *     (e.g. GET/POST on the same URL), we suffix keys with the method:
 *     `users_profile_get`, `users_profile_post`, etc.
 *   - When they have different paths (e.g. `/users` and `/users/{user_id}`),
 *     we derive a suffix from path parameters:
 *       - `/users`          -> `users`
 *       - `/users/{id}`     -> `users_by_id`
 *       - `/users/{a}/{b}`  -> `users_by_a_and_b`
 *   - If collisions still exist, we append the HTTP method as a further suffix.
 *
 * This keeps endpoint names stable, readable and avoids accidental overwrites.
 */
function resolveEndpointNames(metas: EndpointMeta[]): string[] {
  const result: string[] = new Array(metas.length);

  // Group indices by (folderPath, baseName)
  const groups = new Map<string, number[]>();
  metas.forEach((meta, index) => {
    const key = `${meta.folderPath}::${meta.baseName}`;
    const list = groups.get(key);
    if (list) {
      list.push(index);
    } else {
      groups.set(key, [index]);
    }
  });

  // Resolve names per group
  for (const indices of groups.values()) {
    if (indices.length === 1) {
      const i = indices[0];
      result[i] = metas[i].baseName;
      continue;
    }

    // Multiple endpoints share the same (folderPath, baseName)
    const groupMetas = indices.map((i) => metas[i]);
    const uniquePaths = new Set(groupMetas.map((m) => m.path));
    const usedKeys = new Set<string>();

    for (let gi = 0; gi < groupMetas.length; gi += 1) {
      const meta = groupMetas[gi];
      let key = meta.baseName;

      if (uniquePaths.size === 1) {
        // Same path, different HTTP methods -> suffix with method
        key = `${meta.baseName}_${meta.method.toLowerCase()}`;
      } else {
        // Different paths: try to build a suffix from path parameters
        const paramSuffix = buildParamSuffix(meta.path);
        if (paramSuffix) {
          key = `${meta.baseName}_${paramSuffix}`;
        }
      }

      // Ensure key is unique within this group
      let finalKey = key;
      if (usedKeys.has(finalKey)) {
        finalKey = `${key}_${meta.method.toLowerCase()}`;
      }
      let counter = 2;
      while (usedKeys.has(finalKey)) {
        finalKey = `${key}_${meta.method.toLowerCase()}_${counter}`;
        counter += 1;
      }

      usedKeys.add(finalKey);
      result[indices[gi]] = finalKey;
    }
  }

  return result;
}

/**
 * Builds a suffix for an endpoint name based on its path parameters.
 *
 * Examples:
 * - "/api/v1/users/{user_id}"              -> "by_user_id"
 * - "/api/v1/items/{category}/{item_id}"   -> "by_category_and_item_id"
 * - "/api/v1/users"                        -> "" (no parameters)
 */
function buildParamSuffix(path: string): string {
  const segments = path.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
  const paramNames = segments
    .filter((segment) => segment.startsWith('{') && segment.endsWith('}'))
    .map((segment) => segment.slice(1, -1));

  if (paramNames.length === 0) {
    return '';
  }

  if (paramNames.length === 1) {
    return `by_${paramNames[0]}`;
  }

  return `by_${paramNames.join('_and_')}`;
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

