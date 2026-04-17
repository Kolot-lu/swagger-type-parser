/**
 * Utility functions for working with API paths and endpoint names
 */
import type { HttpMethod } from '../types.js';

/**
 * Extracts type name from a $ref string
 * @param ref - Reference string (e.g., "#/components/schemas/User")
 * @returns Type name extracted from the reference
 */
export function extractTypeNameFromRef(ref: string): string {
  const parts = ref.split('/');
  return parts[parts.length - 1];
}

/**
 * Converts an API path to a snake_case endpoint name
 * 
 * This function processes API paths by:
 * - Filtering out path parameters (segments with curly braces)
 * - Optionally skipping a prefix of path segments
 * - Replacing dashes with underscores
 * - Converting to lowercase snake_case
 * 
 * @param path - API path (e.g., "/api/v1/auth/login")
 * @param pathPrefixSkip - Number of path segment pairs to skip from the beginning
 *                        (e.g., 1 = skip first 2 segments: "/api/v1" -> "auth_login")
 * @returns Snake case endpoint name (e.g., "api_v1_auth_login" or "auth_login" if skip=1)
 * 
 * @example
 * pathToEndpointName("/api/v1/auth/login", 0) // returns "api_v1_auth_login"
 * pathToEndpointName("/api/v1/auth/login", 1) // returns "auth_login"
 * pathToEndpointName("/api/v1/users/{id}", 1) // returns "users" (removes {id})
 * pathToEndpointName("/", 0) // returns "root"
 */
export function pathToEndpointName(path: string, pathPrefixSkip: number = 0): string {
  const skippedSegments = getEndpointSegments(path, pathPrefixSkip);
  if (skippedSegments.length === 0) {
    return 'root';
  }

  const processedSegments = skippedSegments.map((segment) => segment.replace(/-/g, '_'));
  return processedSegments.join('_').toLowerCase();
}

/**
 * Converts an API path and method to a unique endpoint file/type base name.
 * The method suffix guarantees uniqueness for specs that use the same path
 * with multiple HTTP methods.
 */
export function pathAndMethodToEndpointName(
  path: string,
  method: HttpMethod,
  pathPrefixSkip: number = 0
): string {
  const baseName = pathToEndpointName(path, pathPrefixSkip);
  return `${baseName}_${method}`;
}

/**
 * Returns a folder path for generated endpoint files.
 * The folder includes all endpoint path segments except the last one.
 */
export function getEndpointFolderPath(path: string, pathPrefixSkip: number = 0): string {
  const skippedSegments = getEndpointSegments(path, pathPrefixSkip);
  if (skippedSegments.length <= 1) {
    return '';
  }

  const folderSegments = skippedSegments.slice(0, -1);
  return folderSegments.map((segment) => segment.replace(/-/g, '_').toLowerCase()).join('/');
}

/**
 * Returns endpoint path segments with prefix trimming and path params removed.
 */
function getEndpointSegments(path: string, pathPrefixSkip: number): string[] {
  // Handle empty path "/" -> "root"
  if (path === '/' || path.trim() === '' || path.replace(/^\/+|\/+$/g, '') === '') {
    return [];
  }

  // Remove leading/trailing slashes and split into segments
  const segments = path.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
  
  // Convert path parameters to stable semantic segments to preserve uniqueness.
  // Example: "/users/{id}" -> ["users", "by_id"].
  const normalizedSegments = segments.map((segment) => {
    const match = segment.match(/^\{(.+)\}$/);
    if (!match) {
      return segment;
    }
    const paramName = match[1].replace(/[^a-zA-Z0-9_]/g, '_');
    return `by_${paramName}`;
  });
  
  // Skip specified number of segments
  // skip=0 means skip 0 segments
  // skip=1 means skip first 2 segments (indices 0 and 1)
  // skip=2 means skip first 4 segments (indices 0, 1, 2, 3)
  const skipCount = pathPrefixSkip > 0 ? pathPrefixSkip * 2 : 0;
  const skippedSegments = normalizedSegments.slice(skipCount);
  
  return skippedSegments;
}

