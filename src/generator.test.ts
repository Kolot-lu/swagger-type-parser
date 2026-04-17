import { describe, it, expect } from '@jest/globals';
import { generateTypes } from './generator/index.js';
import type { NormalizedSpec } from './types.js';

describe('generator', () => {
  it('should generate types for simple schema', () => {
    const spec: NormalizedSpec = {
      openapi: '3.0.0',
      info: {
        title: 'Test API',
        version: '1.0.0',
      },
      paths: {},
      components: {
        schemas: {
          User: {
            type: 'object',
            properties: {
              id: { type: 'integer' },
              name: { type: 'string' },
              email: { type: 'string' },
            },
            required: ['id', 'name'],
          },
        },
        parameters: {},
        responses: {},
      },
      tags: [],
    };

    const types = generateTypes(spec);
    const userType = types.get('User');

    expect(userType).toBeDefined();
    expect(userType?.code).toContain('export type User');
    expect(userType?.code).toContain('id: number');
    expect(userType?.code).toContain('name: string');
    expect(userType?.code).toContain('email?: string'); // Optional
  });

  it('should handle nullable types', () => {
    const spec: NormalizedSpec = {
      openapi: '3.0.0',
      info: {
        title: 'Test API',
        version: '1.0.0',
      },
      paths: {},
      components: {
        schemas: {
          Product: {
            type: 'object',
            properties: {
              name: { type: 'string', nullable: true },
            },
            required: ['name'],
          },
        },
        parameters: {},
        responses: {},
      },
      tags: [],
    };

    const types = generateTypes(spec);
    const productType = types.get('Product');

    expect(productType?.code).toContain('name: string | null');
  });

  it('should handle array types', () => {
    const spec: NormalizedSpec = {
      openapi: '3.0.0',
      info: {
        title: 'Test API',
        version: '1.0.0',
      },
      paths: {},
      components: {
        schemas: {
          Tags: {
            type: 'array',
            items: {
              type: 'string',
            },
          },
        },
        parameters: {},
        responses: {},
      },
      tags: [],
    };

    const types = generateTypes(spec);
    const tagsType = types.get('Tags');

    expect(tagsType?.code).toContain('export type Tags = string[]');
  });

  it('should handle enum types', () => {
    const spec: NormalizedSpec = {
      openapi: '3.0.0',
      info: {
        title: 'Test API',
        version: '1.0.0',
      },
      paths: {},
      components: {
        schemas: {
          Status: {
            type: 'string',
            enum: ['active', 'inactive', 'pending'],
          },
        },
        parameters: {},
        responses: {},
      },
      tags: [],
    };

    const types = generateTypes(spec);
    const statusType = types.get('Status');

    expect(statusType?.code).toContain("'active' | 'inactive' | 'pending'");
  });

  it('should generate unique endpoint keys for same path with different methods', () => {
    const spec: NormalizedSpec = {
      openapi: '3.0.0',
      info: {
        title: 'Test API',
        version: '1.0.0',
      },
      paths: {
        '/api/v1/users': {
          get: {
            responses: {
              '200': {
                description: 'ok',
                content: {
                  'application/json': {
                    schema: { type: 'string' },
                  },
                },
              },
            },
          },
          post: {
            responses: {
              '201': {
                description: 'created',
                content: {
                  'application/json': {
                    schema: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
      components: {
        schemas: {},
        parameters: {},
        responses: {},
      },
      tags: [],
    };

    const types = generateTypes(spec, { pathPrefixSkip: 1, compatEndpointNames: true });
    const endpointKeys = Array.from(types.keys()).filter((key) => key.startsWith('endpoint:'));

    expect(endpointKeys.length).toBe(2);
    expect(endpointKeys).toContain('endpoint:/api/v1/users:get');
    expect(endpointKeys).toContain('endpoint:/api/v1/users:post');
  });

  it('should emit strict unknown-based fallbacks instead of undefined', () => {
    const spec: NormalizedSpec = {
      openapi: '3.0.0',
      info: {
        title: 'Test API',
        version: '1.0.0',
      },
      paths: {},
      components: {
        schemas: {
          DynamicObject: {
            type: 'object',
            additionalProperties: true,
          },
          UnknownArray: {
            type: 'array',
          },
          UnknownPrimitive: {},
        },
        parameters: {},
        responses: {},
      },
      tags: [],
    };

    const types = generateTypes(spec);

    expect(types.get('DynamicObject')?.code).toContain('Record<string, unknown>');
    expect(types.get('UnknownArray')?.code).toContain('unknown[]');
    expect(types.get('UnknownPrimitive')?.code).toContain('= unknown;');
    expect(types.get('UnknownPrimitive')?.code).not.toContain('= undefined;');
  });
});

