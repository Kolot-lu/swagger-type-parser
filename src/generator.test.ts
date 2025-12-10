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
});

