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
  Schema,
  Reference,
} from '../types.js';
import { isRef, resolveRef } from '../parser.js';
import {
  pathToEndpointName,
  pathAndMethodToEndpointName,
  getEndpointFolderPath,
  extractTypeNameFromRef,
} from './path-utils.js';
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

      // Use method-aware naming to avoid collisions on the same path.
      const operationId = pathAndMethodToEndpointName(path, method, pathPrefixSkip);
      const legacyOperationId = pathToEndpointName(path, pathPrefixSkip);
      const folderPath = getEndpointFolderPath(path, pathPrefixSkip);
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
        legacyOperationId,
        fileName: operationId,
        folderPath,
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
        responses[statusCode] = createResponseTypeDefinition(
          operationId,
          statusCode,
          resolved.description,
          resolved.content,
          spec
        );
      }
    } else {
      const responseObj = response as { content?: Record<string, { schema?: unknown }>; description?: string };
      responses[statusCode] = createResponseTypeDefinition(
        operationId,
        statusCode,
        responseObj.description,
        responseObj.content,
        spec
      );
    }
  }

  return responses;
}

function createResponseTypeDefinition(
  operationId: string,
  statusCode: string,
  description: string | undefined,
  content: Record<string, { schema?: unknown }> | undefined,
  spec: NormalizedSpec
): TypeDefinition {
  const typeName = `${operationId}_${statusCode}Response`;
  const mediaSchema = pickResponseSchema(content);
  const typeCode = mediaSchema
    ? isRef(mediaSchema)
      ? extractTypeNameFromRef(mediaSchema.$ref)
      : schemaToTypeScript(mediaSchema, spec, typeName)
    : isNoBodyStatus(statusCode)
      ? 'void'
      : 'unknown';

  const comment = description
    ? `/**\n * ${description.split('\n').join('\n * ')}\n */\n`
    : '';

  return {
    name: typeName,
    code: `${comment}export type ${typeName} = ${typeCode};`,
    dependencies: mediaSchema && isRef(mediaSchema) ? [extractTypeNameFromRef(mediaSchema.$ref)] : [],
  };
}

function pickResponseSchema(
  content: Record<string, { schema?: unknown }> | undefined
): Schema | Reference | undefined {
  if (!content) {
    return undefined;
  }

  if (content['application/json']?.schema) {
    return content['application/json'].schema as Schema | Reference;
  }

  for (const mediaType of Object.values(content)) {
    if (mediaType?.schema) {
      return mediaType.schema as Schema | Reference;
    }
  }

  return undefined;
}

function isNoBodyStatus(statusCode: string): boolean {
  return statusCode === '204' || statusCode === '205' || statusCode === '304';
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
  spec: NormalizedSpec,
  config: Config = {}
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

  if (config.compatEndpointNames && endpoint.legacyOperationId !== endpoint.operationId) {
    lines.push(...generateCompatibilityAliases(endpoint));
  }

  return lines.join('\n\n');
}

/**
 * Generates legacy aliases so existing imports continue to work during migration.
 */
function generateCompatibilityAliases(endpoint: EndpointType): string[] {
  const aliases: string[] = [];
  const oldBase = endpoint.legacyOperationId;
  const oldToNew = new Map<string, string>();

  if (endpoint.parameters.path) {
    oldToNew.set(`${oldBase}_PathParams`, endpoint.parameters.path.name);
  }
  if (endpoint.parameters.query) {
    oldToNew.set(`${oldBase}_QueryParams`, endpoint.parameters.query.name);
  }
  if (endpoint.parameters.header) {
    oldToNew.set(`${oldBase}_HeaderParams`, endpoint.parameters.header.name);
  }
  if (endpoint.requestBody) {
    oldToNew.set(`${oldBase}_RequestBody`, endpoint.requestBody.name);
  }

  for (const [statusCode, response] of Object.entries(endpoint.responses)) {
    oldToNew.set(`${oldBase}_${statusCode}Response`, response.name);
  }

  if (oldToNew.size === 0) {
    return aliases;
  }

  aliases.push('/** Backward-compatible aliases for legacy endpoint naming. */');
  for (const [legacyName, nextName] of oldToNew.entries()) {
    if (legacyName === nextName) {
      continue;
    }
    aliases.push(`export type ${legacyName} = ${nextName};`);
  }

  return aliases;
}

