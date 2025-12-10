/**
 * Configuration options for the swagger-type-parser tool
 */
export interface Config {
  /** URL or path to OpenAPI/Swagger JSON */
  input?: string;
  /** Output directory for generated TypeScript files */
  output?: string;
  /** Whether to clean output directory before generation */
  clean?: boolean;
  /** Whether to format generated code with Prettier */
  pretty?: boolean;
  /** Whether to log verbose debug information */
  verbose?: boolean;
}

/**
 * OpenAPI 3.x specification structure
 */
export interface OpenAPISpec {
  openapi: string;
  info: {
    title: string;
    version: string;
    description?: string;
  };
  paths: Record<string, PathItem>;
  components?: {
    schemas?: Record<string, Schema>;
    parameters?: Record<string, Parameter>;
    responses?: Record<string, Response>;
  };
  tags?: Array<{ name: string; description?: string }>;
}

/**
 * Swagger 2.0 specification structure
 */
export interface SwaggerSpec {
  swagger: string;
  info: {
    title: string;
    version: string;
    description?: string;
  };
  paths: Record<string, PathItem>;
  definitions?: Record<string, Schema>;
  parameters?: Record<string, Parameter>;
  responses?: Record<string, Response>;
  tags?: Array<{ name: string; description?: string }>;
}

/**
 * Normalized API specification (after converting Swagger 2.0 to OpenAPI 3.x format)
 */
export interface NormalizedSpec {
  openapi: string;
  info: {
    title: string;
    version: string;
    description?: string;
  };
  paths: Record<string, PathItem>;
  components: {
    schemas: Record<string, Schema>;
    parameters: Record<string, Parameter>;
    responses: Record<string, Response>;
  };
  tags: Array<{ name: string; description?: string }>;
}

/**
 * HTTP method types
 */
export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete' | 'head' | 'options';

/**
 * Path item containing operations
 */
export interface PathItem {
  get?: Operation;
  post?: Operation;
  put?: Operation;
  patch?: Operation;
  delete?: Operation;
  head?: Operation;
  options?: Operation;
  parameters?: Array<Parameter | Reference>;
}

/**
 * API operation
 */
export interface Operation {
  operationId?: string;
  tags?: string[];
  summary?: string;
  description?: string;
  parameters?: Array<Parameter | Reference>;
  requestBody?: RequestBody | Reference;
  responses: Record<string, Response | Reference>;
}

/**
 * Request body
 */
export interface RequestBody {
  description?: string;
  content?: Record<string, MediaType>;
  required?: boolean;
}

/**
 * Media type
 */
export interface MediaType {
  schema?: Schema | Reference;
  example?: unknown;
}

/**
 * Parameter
 */
export interface Parameter {
  name: string;
  in: 'query' | 'header' | 'path' | 'cookie' | 'body'; // 'body' for Swagger 2.0
  description?: string;
  required?: boolean;
  schema?: Schema | Reference;
  type?: 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object';
  format?: string;
  items?: Schema | Reference;
  enum?: Array<string | number>;
}

/**
 * Response
 */
export interface Response {
  description: string;
  content?: Record<string, MediaType>;
  headers?: Record<string, Header | Reference>;
}

/**
 * Header
 */
export interface Header {
  description?: string;
  schema?: Schema | Reference;
}

/**
 * JSON Schema reference
 */
export interface Reference {
  $ref: string;
}

/**
 * JSON Schema
 */
export interface Schema {
  type?: 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object';
  format?: string;
  properties?: Record<string, Schema | Reference>;
  required?: string[];
  items?: Schema | Reference;
  enum?: Array<string | number>;
  oneOf?: Array<Schema | Reference>;
  anyOf?: Array<Schema | Reference>;
  allOf?: Array<Schema | Reference>;
  nullable?: boolean;
  additionalProperties?: boolean | Schema | Reference;
  description?: string;
  example?: unknown;
  default?: unknown;
}

/**
 * Generated endpoint type information
 */
export interface EndpointType {
  operationId: string;
  method: HttpMethod;
  path: string;
  tag: string;
  parameters: {
    path?: TypeDefinition;
    query?: TypeDefinition;
    header?: TypeDefinition;
  };
  requestBody?: TypeDefinition;
  responses: Record<string, TypeDefinition>;
}

/**
 * Type definition for generated TypeScript code
 */
export interface TypeDefinition {
  name: string;
  code: string;
  dependencies: string[];
}

