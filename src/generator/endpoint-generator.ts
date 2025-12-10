/**
 * Endpoint type generation utilities
 * 
 * This module handles generation of TypeScript types for API endpoints,
 * including request bodies, responses, and parameter types.
 */

import type {
  NormalizedSpec,
  HttpMethod,
  EndpointType,
  TypeDefinition,
  Parameter,
  Config,
} from '../types.js';
import { isRef, resolveRef } from '../parser.js';
import { pathToEndpointName, extractTypeNameFromRef } from './path-utils.js';
import { schemaToTypeScript } from './schema-generator.js';
import { generateParameterType } from './parameter-generator.js';

/**
 * Generates endpoint types from OpenAPI paths
 * 
 * Processes all paths and operations in the specification to create
 * endpoint type definitions with parameters, request bodies, and responses.
 * 
 * @param spec - Normalized OpenAPI specification
 * @param config - Configuration options (including pathPrefixSkip)
 * @returns Array of endpoint type definitions
 */
export function generateEndpointTypes(
  spec: NormalizedSpec,
  config: Config = {}
): EndpointType[] {
  const endpoints: EndpointType[] = [];
  const pathPrefixSkip = config.pathPrefixSkip || 0;

  for (const [path, pathItem] of Object.entries(spec.paths)) {
    const methods: HttpMethod[] = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];

    for (const method of methods) {
      const operation = pathItem[method];
      if (!operation) continue;

      // Generate endpoint name from path (instead of using operationId)
      const operationId = pathToEndpointName(path, pathPrefixSkip);
      const tag = operation.tags?.[0] || 'default';

      // Extract and categorize parameters
      const allParams = [
        ...(pathItem.parameters || []),
        ...(operation.parameters || []),
      ];

      const pathParams = allParams.filter(
        (p): p is Parameter => !isRef(p) && p.in === 'path'
      );
      const queryParams = allParams.filter(
        (p): p is Parameter => !isRef(p) && p.in === 'query'
      );
      const headerParams = allParams.filter(
        (p): p is Parameter => !isRef(p) && p.in === 'header'
      );

      // Generate parameter types
      const parameters: EndpointType['parameters'] = {};
      if (pathParams.length > 0) {
        parameters.path = {
          name: `${operationId}_PathParams`,
          code: generateParameterType(pathParams, spec, `${operationId}_PathParams`),
          dependencies: [],
        };
      }
      if (queryParams.length > 0) {
        parameters.query = {
          name: `${operationId}_QueryParams`,
          code: generateParameterType(queryParams, spec, `${operationId}_QueryParams`),
          dependencies: [],
        };
      }
      if (headerParams.length > 0) {
        parameters.header = {
          name: `${operationId}_HeaderParams`,
          code: generateParameterType(headerParams, spec, `${operationId}_HeaderParams`),
          dependencies: [],
        };
      }

      // Generate request body type
      const requestBody = generateRequestBodyType(operation, operationId, spec);

      // Generate response types
      const responses = generateResponseTypes(operation, operationId, spec);

      endpoints.push({
        operationId,
        method,
        path,
        tag,
        parameters,
        requestBody,
        responses,
      });
    }
  }

  return endpoints;
}

/**
 * Generates request body type for an operation
 * 
 * @param operation - Operation definition
 * @param operationId - Operation identifier
 * @param spec - Full specification
 * @returns Request body type definition or undefined
 */
function generateRequestBodyType(
  operation: { requestBody?: unknown },
  operationId: string,
  spec: NormalizedSpec
): TypeDefinition | undefined {
  if (!operation.requestBody || isRef(operation.requestBody)) {
    return undefined;
  }

  const requestBody = operation.requestBody as { content?: Record<string, { schema?: unknown }>; description?: string };
  const content = requestBody.content;
  
  if (content && content['application/json']?.schema) {
    const schema = content['application/json'].schema;
    const typeName = `${operationId}_RequestBody`;
    const typeCode = isRef(schema)
      ? extractTypeNameFromRef(schema.$ref)
      : schemaToTypeScript(schema, spec, typeName);
    
    const description = requestBody.description;
    const comment = description
      ? `/**\n * ${description.split('\n').join('\n * ')}\n */\n`
      : '';
    
    return {
      name: typeName,
      code: `${comment}export type ${typeName} = ${typeCode};`,
      dependencies: isRef(schema) ? [extractTypeNameFromRef(schema.$ref)] : [],
    };
  }

  return undefined;
}

/**
 * Generates response types for an operation
 * 
 * @param operation - Operation definition
 * @param operationId - Operation identifier
 * @param spec - Full specification
 * @returns Map of status codes to response type definitions
 */
function generateResponseTypes(
  operation: { responses: Record<string, unknown> },
  operationId: string,
  spec: NormalizedSpec
): Record<string, TypeDefinition> {
  const responses: Record<string, TypeDefinition> = {};

  for (const [statusCode, response] of Object.entries(operation.responses)) {
    if (isRef(response)) {
      const resolved = resolveRef(response.$ref, spec);
      if (resolved && 'content' in resolved) {
        const content = resolved.content;
        if (content && content['application/json']?.schema) {
          const schema = content['application/json'].schema;
          const typeName = `${operationId}_${statusCode}Response`;
          const typeCode = isRef(schema)
            ? extractTypeNameFromRef(schema.$ref)
            : schemaToTypeScript(schema, spec, typeName);
          const description = resolved.description;
          const comment = description
            ? `/**\n * ${description.split('\n').join('\n * ')}\n */\n`
            : '';
          responses[statusCode] = {
            name: typeName,
            code: `${comment}export type ${typeName} = ${typeCode};`,
            dependencies: isRef(schema) ? [extractTypeNameFromRef(schema.$ref)] : [],
          };
        }
      }
    } else {
      const responseObj = response as { content?: Record<string, { schema?: unknown }>; description?: string };
      if (responseObj.content && responseObj.content['application/json']?.schema) {
        const schema = responseObj.content['application/json'].schema;
        const typeName = `${operationId}_${statusCode}Response`;
        const typeCode = isRef(schema)
          ? extractTypeNameFromRef(schema.$ref)
          : schemaToTypeScript(schema, spec, typeName);
        const description = responseObj.description;
        const comment = description
          ? `/**\n * ${description.split('\n').join('\n * ')}\n */\n`
          : '';
        responses[statusCode] = {
          name: typeName,
          code: `${comment}export type ${typeName} = ${typeCode};`,
          dependencies: isRef(schema) ? [extractTypeNameFromRef(schema.$ref)] : [],
        };
      }
    }
  }

  return responses;
}

/**
 * Generates TypeScript code for an endpoint type
 * 
 * Creates a complete TypeScript file with:
 * - JSDoc comment with endpoint description and path
 * - Parameter types (path, query, header)
 * - Request body type
 * - Response types
 * 
 * @param endpoint - Endpoint type definition
 * @param spec - Full specification for finding operation details
 * @returns Complete TypeScript file content
 */
export function generateEndpointTypeCode(
  endpoint: EndpointType,
  spec: NormalizedSpec
): string {
  const lines: string[] = [];

  // Find operation description from spec
  let operationDescription = '';
  let operationPath = endpoint.path;
  
  for (const [path, pathItem] of Object.entries(spec.paths)) {
    const operation = pathItem[endpoint.method];
    if (operation && path === endpoint.path) {
      operationPath = path;
      if (operation.description) {
        operationDescription = operation.description;
      } else if (operation.summary) {
        operationDescription = operation.summary;
      }
      break;
    }
  }

  // Add endpoint-level comment with path and description
  const commentParts: string[] = [];
  if (operationDescription) {
    commentParts.push(operationDescription);
  }
  commentParts.push(`Endpoint: ${operationPath}`);
  
  if (commentParts.length > 0) {
    lines.push(`/**\n * ${commentParts.join('\n * ')}\n */`);
  } else {
    lines.push(`/**\n * Endpoint: ${operationPath}\n */`);
  }

  // Generate parameter types
  if (endpoint.parameters.path) {
    lines.push(endpoint.parameters.path.code);
  }
  if (endpoint.parameters.query) {
    lines.push(endpoint.parameters.query.code);
  }
  if (endpoint.parameters.header) {
    lines.push(endpoint.parameters.header.code);
  }

  // Generate request body type
  if (endpoint.requestBody) {
    lines.push(endpoint.requestBody.code);
  }

  // Generate response types
  for (const response of Object.values(endpoint.responses)) {
    lines.push(response.code);
  }

  return lines.join('\n\n');
}

