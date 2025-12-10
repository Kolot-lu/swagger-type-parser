import type {
  NormalizedSpec,
  OpenAPISpec,
  SwaggerSpec,
  Schema,
  Reference,
  Parameter,
  Response,
} from './types.js';
import { isOpenAPI, isSwagger } from './loader.js';

/**
 * Normalizes OpenAPI 3.x or Swagger 2.0 spec to a common format
 * @param spec - OpenAPI or Swagger specification
 * @returns Normalized specification
 */
export function normalizeSpec(spec: OpenAPISpec | SwaggerSpec): NormalizedSpec {
  if (isOpenAPI(spec)) {
    return normalizeOpenAPI(spec);
  } else if (isSwagger(spec)) {
    return normalizeSwagger(spec);
  } else {
    throw new Error('Unsupported specification format');
  }
}

/**
 * Normalizes OpenAPI 3.x spec (mostly just ensures structure)
 * @param spec - OpenAPI 3.x specification
 * @returns Normalized specification
 */
function normalizeOpenAPI(spec: OpenAPISpec): NormalizedSpec {
  return {
    openapi: spec.openapi,
    info: spec.info,
    paths: spec.paths,
    components: {
      schemas: spec.components?.schemas || {},
      parameters: spec.components?.parameters || {},
      responses: spec.components?.responses || {},
    },
    tags: spec.tags || [],
  };
}

/**
 * Converts Swagger 2.0 spec to OpenAPI 3.x format
 * @param spec - Swagger 2.0 specification
 * @returns Normalized specification in OpenAPI 3.x format
 */
function normalizeSwagger(spec: SwaggerSpec): NormalizedSpec {
  // Convert definitions to components.schemas
  const schemas: Record<string, Schema> = {};
  if (spec.definitions) {
    for (const [key, value] of Object.entries(spec.definitions)) {
      schemas[key] = value;
    }
  }

  // Convert parameters
  const parameters: Record<string, Parameter> = {};
  if (spec.parameters) {
    for (const [key, value] of Object.entries(spec.parameters)) {
      parameters[key] = value;
    }
  }

  // Convert responses
  const responses: Record<string, Response> = {};
  if (spec.responses) {
    for (const [key, value] of Object.entries(spec.responses)) {
      responses[key] = value;
    }
  }

  // Convert paths - Swagger 2.0 uses 'body' parameter for request body
  const paths = convertSwaggerPaths(spec.paths);

  return {
    openapi: '3.0.0', // Converted from Swagger 2.0
    info: spec.info,
    paths,
    components: {
      schemas,
      parameters,
      responses,
    },
    tags: spec.tags || [],
  };
}

/**
 * Converts Swagger 2.0 paths to OpenAPI 3.x format
 * @param paths - Swagger 2.0 paths
 * @returns OpenAPI 3.x paths
 */
function convertSwaggerPaths(
  paths: SwaggerSpec['paths']
): NormalizedSpec['paths'] {
  const converted: NormalizedSpec['paths'] = {};

  for (const [path, pathItem] of Object.entries(paths)) {
    converted[path] = { ...pathItem };

    // Convert body parameters to requestBody
    for (const method of ['get', 'post', 'put', 'patch', 'delete'] as const) {
      const operation = pathItem[method];
      if (operation && operation.parameters) {
        const bodyParam = operation.parameters.find(
          (p): p is Parameter => !isRef(p) && p.in === 'body'
        );

        if (bodyParam && bodyParam.schema) {
          // Remove body parameter from parameters array
          operation.parameters = operation.parameters.filter(
            (p) => !(isRef(p) ? false : p.in !== 'body')
          );

          // Add requestBody
          operation.requestBody = {
            required: bodyParam.required || false,
            content: {
              'application/json': {
                schema: bodyParam.schema,
              },
            },
          };
        }
      }
    }
  }

  return converted;
}

/**
 * Resolves $ref references in a schema
 * @param ref - Reference string (e.g., "#/components/schemas/User")
 * @param spec - Normalized specification
 * @returns Resolved schema or null if not found
 */
export function resolveRef(ref: string, spec: NormalizedSpec): Schema | Parameter | Response | null {
  if (!ref.startsWith('#/')) {
    // External references not supported
    return null;
  }

  const parts = ref.slice(2).split('/');
  if (parts.length < 2) {
    return null;
  }

  const [section, ...keyParts] = parts;
  const key = keyParts.join('/');

  switch (section) {
    case 'components':
      if (parts.length < 3) {
        return null;
      }
      const componentType = parts[1];
      const componentKey = parts.slice(2).join('/');

      switch (componentType) {
        case 'schemas':
          return spec.components.schemas[componentKey] || null;
        case 'parameters':
          return spec.components.parameters[componentKey] || null;
        case 'responses':
          return spec.components.responses[componentKey] || null;
        default:
          return null;
      }
    case 'definitions':
      // Swagger 2.0 style (already converted, but handle for safety)
      return spec.components.schemas[key] || null;
    default:
      return null;
  }
}

/**
 * Checks if an object is a reference
 * @param obj - Object to check
 * @returns True if object is a reference
 */
export function isRef(obj: unknown): obj is Reference {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    '$ref' in obj &&
    typeof (obj as { $ref: unknown }).$ref === 'string'
  );
}

/**
 * Resolves a schema, following $ref references
 * @param schema - Schema or reference to resolve
 * @param spec - Normalized specification
 * @returns Resolved schema
 */
export function resolveSchema(
  schema: Schema | Reference,
  spec: NormalizedSpec
): Schema {
  if (isRef(schema)) {
    const resolved = resolveRef(schema.$ref, spec);
    if (!resolved || !('type' in resolved)) {
      throw new Error(`Failed to resolve reference: ${schema.$ref}`);
    }
    return resolved as Schema;
  }
  return schema;
}

