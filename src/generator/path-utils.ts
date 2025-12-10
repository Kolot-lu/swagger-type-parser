/**
 * Utility functions for working with API paths and endpoint names
 */

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
  // Handle empty path "/" -> "root"
  if (path === '/' || path.trim() === '' || path.replace(/^\/+|\/+$/g, '') === '') {
    return 'root';
  }

  // Remove leading/trailing slashes and split into segments
  const segments = path.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
  
  // Filter out segments with curly braces (path parameters like {id}, {entity_type}, etc.)
  const filteredSegments = segments.filter(segment => !segment.includes('{') && !segment.includes('}'));
  
  // Skip specified number of segments
  // skip=0 means skip 0 segments
  // skip=1 means skip first 2 segments (indices 0 and 1)
  // skip=2 means skip first 4 segments (indices 0, 1, 2, 3)
  const skipCount = pathPrefixSkip > 0 ? pathPrefixSkip * 2 : 0;
  const skippedSegments = filteredSegments.slice(skipCount);
  
  // If no segments left after filtering, return "root"
  if (skippedSegments.length === 0) {
    return 'root';
  }
  
  // Replace dashes with underscores in all segments
  // This is especially important for the last segment to maintain consistency
  const processedSegments = skippedSegments.map(segment => segment.replace(/-/g, '_'));
  
  // Convert to snake_case by joining with underscores and converting to lowercase
  return processedSegments.join('_').toLowerCase();
}

