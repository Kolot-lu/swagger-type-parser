import type {
  NormalizedSpec,
  Schema,
  Reference,
  Parameter,
  Operation,
  HttpMethod,
  EndpointType,
  TypeDefinition,
} from './types.js';
import { resolveSchema, isRef, resolveRef } from './parser.js';

/**
 * Generates TypeScript types from a normalized OpenAPI specification
 * @param spec - Normalized OpenAPI specification
 * @returns Map of type names to TypeScript code
 */
export function generateTypes(spec: NormalizedSpec): Map<string, TypeDefinition> {
  const types = new Map<string, TypeDefinition>();

  // Generate schema types
  for (const [name, schema] of Object.entries(spec.components.schemas)) {
    const code = generateSchemaType(name, schema, spec);
    const dependencies = extractDependencies(schema, spec);
    types.set(name, { name, code, dependencies });
  }

  // Generate endpoint types
  const endpointTypes = generateEndpointTypes(spec);
  for (const endpoint of endpointTypes) {
    const fileName = `${endpoint.operationId}`;
    const code = generateEndpointTypeCode(endpoint, spec);
    const dependencies = extractEndpointDependencies(endpoint, spec);
    types.set(`endpoint:${fileName}`, {
      name: fileName,
      code,
      dependencies,
    });
  }

  return types;
}

/**
 * Generates TypeScript type code for a schema
 * @param name - Schema name
 * @param schema - Schema definition
 * @param spec - Full specification for resolving references
 * @returns TypeScript type code
 */
function generateSchemaType(name: string, schema: Schema | Reference, spec: NormalizedSpec): string {
  const resolved = resolveSchema(schema, spec);
  const typeCode = schemaToTypeScript(resolved, spec, name);
  const description = resolved.description;

  const comment = description
    ? `/**\n * ${description.split('\n').join('\n * ')}\n */\n`
    : '';

  return `${comment}export type ${name} = ${typeCode};`;
}

/**
 * Converts a JSON Schema to TypeScript type string
 * @param schema - Schema to convert
 * @param spec - Full specification for resolving references
 * @param context - Context name for better error messages
 * @returns TypeScript type string
 */
function schemaToTypeScript(
  schema: Schema,
  spec: NormalizedSpec,
  context: string
): string {
  // Handle references
  if (isRef(schema)) {
    const resolved = resolveRef(schema.$ref, spec);
    if (resolved && 'type' in resolved) {
      return schemaToTypeScript(resolved as Schema, spec, context);
    }
    // Extract type name from ref
    const refParts = schema.$ref.split('/');
    const typeName = refParts[refParts.length - 1];
    return typeName;
  }

  // Handle nullable
  if (schema.nullable) {
    const baseType = schemaToTypeScript({ ...schema, nullable: false }, spec, context);
    return `${baseType} | null`;
  }

  // Handle oneOf
  if (schema.oneOf && schema.oneOf.length > 0) {
    const types = schema.oneOf.map((s) => {
      if (isRef(s)) {
        const resolved = resolveRef(s.$ref, spec);
        if (resolved && 'type' in resolved) {
          return schemaToTypeScript(resolved as Schema, spec, context);
        }
        const refParts = s.$ref.split('/');
        return refParts[refParts.length - 1];
      }
      return schemaToTypeScript(s, spec, context);
    });
    return `(${types.join(' | ')})`;
  }

  // Handle anyOf
  if (schema.anyOf && schema.anyOf.length > 0) {
    const types = schema.anyOf.map((s) => {
      if (isRef(s)) {
        const resolved = resolveRef(s.$ref, spec);
        if (resolved && 'type' in resolved) {
          return schemaToTypeScript(resolved as Schema, spec, context);
        }
        const refParts = s.$ref.split('/');
        return refParts[refParts.length - 1];
      }
      return schemaToTypeScript(s, spec, context);
    });
    return `(${types.join(' | ')})`;
  }

  // Handle allOf (intersection)
  if (schema.allOf && schema.allOf.length > 0) {
    const types = schema.allOf.map((s) => {
      if (isRef(s)) {
        const resolved = resolveRef(s.$ref, spec);
        if (resolved && 'type' in resolved) {
          return schemaToTypeScript(resolved as Schema, spec, context);
        }
        const refParts = s.$ref.split('/');
        return refParts[refParts.length - 1];
      }
      return schemaToTypeScript(s, spec, context);
    });
    return `(${types.join(' & ')})`;
  }

  // Handle enum
  if (schema.enum && schema.enum.length > 0) {
    const enumValues = schema.enum.map((v) => {
      if (typeof v === 'string') {
        return `'${v.replace(/'/g, "\\'")}'`;
      }
      return String(v);
    });
    return enumValues.join(' | ');
  }

  // Handle array
  if (schema.type === 'array') {
    if (!schema.items) {
      return 'unknown[]';
    }
    const itemType = isRef(schema.items)
      ? extractTypeNameFromRef(schema.items.$ref)
      : schemaToTypeScript(schema.items, spec, context);
    return `${itemType}[]`;
  }

  // Handle object
  if (schema.type === 'object' || (!schema.type && schema.properties)) {
    if (!schema.properties || Object.keys(schema.properties).length === 0) {
      if (schema.additionalProperties === false) {
        return 'Record<string, never>';
      }
      if (schema.additionalProperties === true) {
        return 'Record<string, unknown>';
      }
      if (schema.additionalProperties) {
        const valueType = isRef(schema.additionalProperties)
          ? extractTypeNameFromRef(schema.additionalProperties.$ref)
          : schemaToTypeScript(schema.additionalProperties as Schema, spec, context);
        return `Record<string, ${valueType}>`;
      }
      return 'Record<string, unknown>';
    }

    const required = schema.required || [];
    const properties: string[] = [];

    for (const [key, value] of Object.entries(schema.properties)) {
      const isRequired = required.includes(key);
      const propType = isRef(value)
        ? extractTypeNameFromRef(value.$ref)
        : schemaToTypeScript(value, spec, context);
      const optional = isRequired ? '' : '?';
      const safeKey = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key) ? key : `'${key}'`;
      
      // Add JSDoc comment if description exists
      const propSchema = isRef(value) ? null : value;
      const comment = propSchema?.description
        ? `  /** ${propSchema.description} */\n`
        : '';
      
      properties.push(`${comment}  ${safeKey}${optional}: ${propType};`);
    }

    // Handle additionalProperties
    if (schema.additionalProperties !== undefined && schema.additionalProperties !== false) {
      if (schema.additionalProperties === true) {
        properties.push('  [key: string]: unknown;');
      } else {
        const valueType = isRef(schema.additionalProperties)
          ? extractTypeNameFromRef(schema.additionalProperties.$ref)
          : schemaToTypeScript(schema.additionalProperties as Schema, spec, context);
        properties.push(`  [key: string]: ${valueType};`);
      }
    }

    return `{\n${properties.join('\n')}\n}`;
  }

  // Handle primitive types
  switch (schema.type) {
    case 'string':
      if (schema.format === 'date-time' || schema.format === 'date') {
        return 'string'; // Keep as string, user can use Date if needed
      }
      return 'string';
    case 'number':
    case 'integer':
      return 'number';
    case 'boolean':
      return 'boolean';
    default:
      return 'unknown';
  }
}

/**
 * Extracts type name from a $ref string
 * @param ref - Reference string
 * @returns Type name
 */
function extractTypeNameFromRef(ref: string): string {
  const parts = ref.split('/');
  return parts[parts.length - 1];
}

/**
 * Generates endpoint types from paths
 * @param spec - Normalized specification
 * @returns Array of endpoint type definitions
 */
function generateEndpointTypes(spec: NormalizedSpec): EndpointType[] {
  const endpoints: EndpointType[] = [];

  for (const [path, pathItem] of Object.entries(spec.paths)) {
    const methods: HttpMethod[] = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];

    for (const method of methods) {
      const operation = pathItem[method];
      if (!operation) continue;

      const operationId = operation.operationId || generateOperationId(method, path);
      const tag = operation.tags?.[0] || 'default';

      // Extract parameters
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
          name: `${operationId}PathParams`,
          code: generateParameterType(pathParams, spec, `${operationId}PathParams`),
          dependencies: [],
        };
      }
      if (queryParams.length > 0) {
        parameters.query = {
          name: `${operationId}QueryParams`,
          code: generateParameterType(queryParams, spec, `${operationId}QueryParams`),
          dependencies: [],
        };
      }
      if (headerParams.length > 0) {
        parameters.header = {
          name: `${operationId}HeaderParams`,
          code: generateParameterType(headerParams, spec, `${operationId}HeaderParams`),
          dependencies: [],
        };
      }

      // Generate request body type
      let requestBody: TypeDefinition | undefined;
      if (operation.requestBody && !isRef(operation.requestBody)) {
        const content = operation.requestBody.content;
        if (content && content['application/json']?.schema) {
          const schema = content['application/json'].schema;
          const typeName = `${operationId}RequestBody`;
          const typeCode = isRef(schema)
            ? extractTypeNameFromRef(schema.$ref)
            : schemaToTypeScript(schema, spec, typeName);
          const description = operation.requestBody.description;
          const comment = description
            ? `/**\n * ${description.split('\n').join('\n * ')}\n */\n`
            : '';
          requestBody = {
            name: typeName,
            code: `${comment}export type ${typeName} = ${typeCode};`,
            dependencies: isRef(schema) ? [extractTypeNameFromRef(schema.$ref)] : [],
          };
        }
      }

      // Generate response types
      const responses: Record<string, TypeDefinition> = {};
      for (const [statusCode, response] of Object.entries(operation.responses)) {
        if (isRef(response)) {
          const resolved = resolveRef(response.$ref, spec);
          if (resolved && 'content' in resolved) {
            const content = resolved.content;
            if (content && content['application/json']?.schema) {
              const schema = content['application/json'].schema;
              const typeName = `${operationId}${statusCode}Response`;
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
        } else if (response.content && response.content['application/json']?.schema) {
          const schema = response.content['application/json'].schema;
          const typeName = `${operationId}${statusCode}Response`;
          const typeCode = isRef(schema)
            ? extractTypeNameFromRef(schema.$ref)
            : schemaToTypeScript(schema, spec, typeName);
          const description = response.description;
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
 * Generates a parameter type from an array of parameters
 * @param params - Parameters to convert
 * @param spec - Full specification
 * @param typeName - Name for the generated type
 * @returns TypeScript type code
 */
function generateParameterType(
  params: Parameter[],
  spec: NormalizedSpec,
  typeName: string
): string {
  const properties: string[] = [];

  for (const param of params) {
    const isRequired = param.required !== false;
    const paramType = param.schema
      ? isRef(param.schema)
        ? extractTypeNameFromRef(param.schema.$ref)
        : schemaToTypeScript(param.schema, spec, typeName)
      : param.type === 'array' && param.items
        ? isRef(param.items)
          ? `${extractTypeNameFromRef(param.items.$ref)}[]`
          : `${schemaToTypeScript(param.items, spec, typeName)}[]`
        : param.type === 'integer' || param.type === 'number'
          ? 'number'
          : param.type === 'boolean'
            ? 'boolean'
            : 'string';

    const optional = isRequired ? '' : '?';
    const safeKey = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(param.name)
      ? param.name
      : `'${param.name}'`;
    
    // Add JSDoc comment if description exists
    const comment = param.description
      ? `  /** ${param.description} */\n`
      : '';
    
    properties.push(`${comment}  ${safeKey}${optional}: ${paramType};`);
  }

  return `export type ${typeName} = {\n${properties.join('\n')}\n};`;
}

/**
 * Generates TypeScript code for an endpoint type
 * @param endpoint - Endpoint type definition
 * @param spec - Full specification
 * @returns Complete TypeScript file content
 */
function generateEndpointTypeCode(endpoint: EndpointType, spec: NormalizedSpec): string {
  const lines: string[] = [];

  // Find operation description from spec
  let operationDescription = '';
  for (const [path, pathItem] of Object.entries(spec.paths)) {
    const operation = pathItem[endpoint.method];
    if (operation && (operation.operationId === endpoint.operationId || generateOperationId(endpoint.method, path) === endpoint.operationId)) {
      if (operation.description) {
        operationDescription = operation.description;
      } else if (operation.summary) {
        operationDescription = operation.summary;
      }
      break;
    }
  }

  // Add endpoint-level comment if available
  if (operationDescription) {
    lines.push(`/**\n * ${operationDescription.split('\n').join('\n * ')}\n */`);
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

/**
 * Generates an operation ID from method and path
 * @param method - HTTP method
 * @param path - API path
 * @returns Operation ID
 */
function generateOperationId(method: HttpMethod, path: string): string {
  const pathParts = path
    .split('/')
    .filter((p) => p && !p.startsWith('{'))
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1));
  const methodCapitalized = method.charAt(0).toUpperCase() + method.slice(1);
  return methodCapitalized + pathParts.join('');
}

/**
 * Extracts dependencies from a schema
 * @param schema - Schema to analyze
 * @param spec - Full specification
 * @returns Array of type names this schema depends on
 */
function extractDependencies(schema: Schema | Reference, spec: NormalizedSpec): string[] {
  const deps = new Set<string>();

  function traverse(s: Schema | Reference): void {
    if (isRef(s)) {
      const typeName = extractTypeNameFromRef(s.$ref);
      deps.add(typeName);
      const resolved = resolveRef(s.$ref, spec);
      if (resolved && 'type' in resolved) {
        traverse(resolved as Schema);
      }
    } else {
      if (s.properties) {
        for (const prop of Object.values(s.properties)) {
          traverse(prop);
        }
      }
      if (s.items) {
        traverse(s.items);
      }
      if (s.oneOf) {
        for (const item of s.oneOf) {
          traverse(item);
        }
      }
      if (s.anyOf) {
        for (const item of s.anyOf) {
          traverse(item);
        }
      }
      if (s.allOf) {
        for (const item of s.allOf) {
          traverse(item);
        }
      }
      if (s.additionalProperties && typeof s.additionalProperties === 'object') {
        traverse(s.additionalProperties);
      }
    }
  }

  traverse(schema);
  return Array.from(deps);
}

/**
 * Extracts dependencies from an endpoint
 * @param endpoint - Endpoint type definition
 * @param spec - Full specification
 * @returns Array of type names this endpoint depends on
 */
function extractEndpointDependencies(endpoint: EndpointType, spec: NormalizedSpec): string[] {
  const deps = new Set<string>();

  if (endpoint.requestBody) {
    for (const dep of endpoint.requestBody.dependencies) {
      deps.add(dep);
    }
  }

  for (const response of Object.values(endpoint.responses)) {
    for (const dep of response.dependencies) {
      deps.add(dep);
    }
  }

  return Array.from(deps);
}

