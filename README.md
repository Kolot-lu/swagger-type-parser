# swagger-type-parser

[![npm version](https://img.shields.io/npm/v/@kolot/swagger-type-parser)](https://www.npmjs.com/package/@kolot/swagger-type-parser)
[![npm downloads](https://img.shields.io/npm/dm/@kolot/swagger-type-parser)](https://www.npmjs.com/package/@kolot/swagger-type-parser)
[![License](https://img.shields.io/npm/l/@kolot/swagger-type-parser)](https://github.com/Kolot-lu/swagger-type-parser/blob/main/LICENSE)
[![Node.js Version](https://img.shields.io/node/v/@kolot/swagger-type-parser)](https://nodejs.org/)

A CLI tool to generate TypeScript type definitions from OpenAPI/Swagger specifications. This tool helps frontend projects maintain type safety when working with backend APIs by automatically generating TypeScript types from API documentation.

## Features

- ✅ Fetches OpenAPI/Swagger specifications from URLs or local files
- ✅ Supports OpenAPI 3.x and Swagger 2.0 (with automatic conversion)
- ✅ Generates decomposed TypeScript types in a clean directory structure
- ✅ Resolves `$ref` references automatically
- ✅ Groups endpoints by path segments for better organization
- ✅ Generates types for schemas, request bodies, parameters, and responses
- ✅ Includes JSDoc comments from OpenAPI descriptions
- ✅ Configurable endpoint naming via path prefix skipping
- ✅ Generates API endpoint URL constants for type-safe API calls
- ✅ Configurable via config file or CLI flags
- ✅ Optional Prettier formatting for generated code

## Installation

```bash
npm install --save-dev @kolot/swagger-type-parser

# or

pnpm add -D @kolot/swagger-type-parser

# or

yarn add -D @kolot/swagger-type-parser
```

## Basic Usage

### Using CLI Flags

```bash
npx @kolot/swagger-type-parser --input http://localhost:8000/api/v1/openapi.json --output ./src/api/types
```

### Using Config File

Create a `swagger-type-parser.config.json` file in your project root:

```json
{
  "input": "http://localhost:8000/api/v1/openapi.json",
  "output": "./src/api/types",
  "clean": true,
  "pretty": true,
  "verbose": false
}
```

Then run:

```bash
npx @kolot/swagger-type-parser
```

### Custom Config File Path

```bash
npx @kolot/swagger-type-parser --config configs/swagger.config.json
```

## CLI Options

| Option | Short | Description | Default |
|--------|-------|-------------|---------|
| `--input` | `-i` | URL or path to OpenAPI/Swagger JSON | Required |
| `--output` | `-o` | Output directory for generated TypeScript files | Required |
| `--config` | `-c` | Path to config file | `swagger-type-parser.config.json` |
| `--clean` | | Clean output directory before generation | `false` |
| `--pretty` | | Format generated code with Prettier | `false` |
| `--verbose` | | Log verbose debug information | `false` |
| `--path-prefix-skip` | | Number of path segment pairs to skip when generating endpoint names (e.g., 1 = skip first 2 segments: "/api/v1/auth/login" → "auth_login") | `0` |
| `--generate-api-endpoints` | | Generate API endpoint URL constants for easy access from frontend | `false` |

**Note:** CLI flags override values from the config file.

## Input Sources

The tool supports multiple input sources:

1. **HTTP/HTTPS URLs** - Fetch from a running API server:
   ```bash
   --input http://localhost:8000/api/v1/openapi.json
   --input https://api.example.com/docs/openapi.json
   ```

2. **Local JSON files** - Use a local OpenAPI specification:
   ```bash
   --input ./openapi.json
   --input ./api-docs/swagger.json
   ```

## Generated Directory Structure

The tool generates TypeScript types in a decomposed structure. Endpoints are organized by path segments (excluding the last segment), making it easy to navigate and maintain:

```
src/api/types/
├── index.ts                 # Main barrel exports
├── schemas/                 # Schema type definitions
│   ├── User.ts
│   ├── Order.ts
│   └── Product.ts
├── endpoints/               # Endpoint type definitions (grouped by path segments)
│   ├── auth/                # Endpoints under /api/v1/auth/*
│   │   ├── auth_login.ts
│   │   ├── auth_register.ts
│   │   └── auth_me.ts
│   ├── users/               # Endpoints under /api/v1/users/*
│   │   ├── users_list.ts
│   │   └── users_create.ts
│   └── health.ts            # Endpoints with single segment (e.g., /api/v1/health)
├── api/                     # API endpoint URL constants (if --generate-api-endpoints is enabled)
│   └── index.ts            # apiEndpoints object with nested structure
└── common/                  # Common utility types
    └── Http.ts             # HttpMethod, RequestConfig, etc.
```

**Note:** The directory structure depends on the `pathPrefixSkip` configuration. With `pathPrefixSkip: 1`, paths like `/api/v1/auth/login` will be organized as `endpoints/auth/auth_login.ts`.

## Using Generated Types

### Import Schema Types

```typescript
import type { User, Order, Product } from './api/types/schemas/User';
// or from barrel export
import type { User, Order, Product } from './api/types';
```

### Import Endpoint Types

Endpoint types are named based on the API path (not operationId). For example, `/api/v1/auth/login` becomes `auth_login.ts` (with `pathPrefixSkip: 1`):

```typescript
import type { 
  auth_login_200Response,
  auth_login_RequestBody 
} from './api/types/endpoints/auth/auth_login';

import type { 
  users_list_200Response,
  users_list_QueryParams 
} from './api/types/endpoints/users/users_list';
```

### Example: Typed API Call

```typescript
import type { auth_login_200Response, auth_login_RequestBody } from './api/types/endpoints/auth/auth_login';
import type { User } from './api/types/schemas/User';

async function login(email: string, password: string): Promise<auth_login_200Response> {
  const body: auth_login_RequestBody = { email, password };
  
  const response = await fetch('/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  
  if (!response.ok) {
    throw new Error('Login failed');
  }
  
  return response.json();
}

// Usage
const result = await login('user@example.com', 'password123');
// result is typed as auth_login_200Response
```

### Using API Endpoint Constants

When `--generate-api-endpoints` flag is enabled, the tool generates a nested object structure with all API endpoint URLs, organized by their folder hierarchy. This eliminates the need to manually write URL strings:

```typescript
import { apiEndpoints } from './api/types/api';
import type { auth_login_200Response, auth_login_RequestBody } from './api/types/endpoints/auth/auth_login';

async function login(email: string, password: string): Promise<auth_login_200Response> {
  const body: auth_login_RequestBody = { email, password };
  
  const response = await fetch(apiEndpoints.auth.auth_login, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  
  if (!response.ok) {
    throw new Error('Login failed');
  }
  
  return response.json();
}

// Or with an API client
await apiClient.post<auth_login_200Response>(
  apiEndpoints.auth.auth_login,
  payload,
  {
    skipAuth: true, // Public endpoint
  },
);
```

### Handling Path Parameters

For endpoints with path parameters (e.g., `/api/v1/users/profile/{user_id}`), use the `buildUrl` utility function to replace parameters:

```typescript
import { apiEndpoints, buildUrl } from './api/types/api';
import type { users_profile_200Response, users_profile_PathParams } from './api/types/endpoints/users/users_profile';

// Single parameter
const url = buildUrl(apiEndpoints.users.users_profile, { user_id: '123' });
// Returns: '/api/v1/users/profile/123'

// Multiple parameters
const url2 = buildUrl(
  apiEndpoints.dynamic_fields.dynamic_fields_entities,
  { entity_type: 'user_profile', entity_id: '456' }
);
// Returns: '/api/v1/dynamic-fields/entities/user_profile/456'

// Type-safe usage with PathParams
async function getUserProfile(userId: string): Promise<users_profile_200Response> {
  const params: users_profile_PathParams = { user_id: userId };
  const url = buildUrl(apiEndpoints.users.users_profile, params);
  
  const response = await fetch(url, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });
  
  return response.json();
}

// Endpoints without parameters work as-is
const loginUrl = apiEndpoints.auth.auth_login;
// No need to use buildUrl for endpoints without parameters
```

The `apiEndpoints` object structure matches the endpoint folder organization:

```typescript
// Generated structure example (with pathPrefixSkip: 1)
export const apiEndpoints = {
  auth: {
    auth_login: '/api/v1/auth/login',
    auth_register: '/api/v1/auth/register',
    auth_me: '/api/v1/auth/me',
  },
  users: {
    users_list: '/api/v1/users',
    users_detail: '/api/v1/users/{id}',
  },
  // ...
} as const;
```

**Benefits:**
- ✅ Type-safe endpoint URLs (autocomplete support)
- ✅ No manual URL string writing
- ✅ Automatic updates when API changes
- ✅ Consistent with endpoint type organization

### Generated Type Naming Convention

- **Schemas**: Use the schema name from `components.schemas` (e.g., `User`, `Order`)
- **Endpoints**: Based on API path converted to snake_case (e.g., `/api/v1/auth/login` → `auth_login`)
- **Request Bodies**: `{endpointName}_RequestBody` (e.g., `auth_login_RequestBody`)
- **Responses**: `{endpointName}_{statusCode}Response` (e.g., `auth_login_200Response`)
- **Parameters**: `{endpointName}_PathParams`, `{endpointName}_QueryParams`, `{endpointName}_HeaderParams`

All generated types include JSDoc comments from OpenAPI descriptions when available.

## Type Mapping

The tool maps OpenAPI/JSON Schema types to TypeScript as follows:

| OpenAPI Type | TypeScript Type |
|--------------|-----------------|
| `string` | `string` |
| `integer`, `number` | `number` |
| `boolean` | `boolean` |
| `array` | `T[]` |
| `object` | `{ ... }` |
| `enum` | `'value1' \| 'value2'` |
| `oneOf` | `Type1 \| Type2` |
| `anyOf` | `Type1 \| Type2` |
| `allOf` | `Type1 & Type2` |
| `nullable: true` | `T \| null` |

## Configuration File

The config file (`swagger-type-parser.config.json`) supports the following options:

```json
{
  "input": "http://localhost:8000/api/v1/openapi.json",
  "output": "./src/api/types",
  "clean": true,
  "pretty": true,
  "verbose": false,
  "pathPrefixSkip": 1
}
```

- **`input`** (required): URL or path to OpenAPI/Swagger JSON
- **`output`** (required): Output directory for generated files
- **`clean`** (optional): Remove all files in output directory before generation
- **`pretty`** (optional): Format generated code with Prettier (requires Prettier to be installed)
- **`verbose`** (optional): Enable verbose logging
- **`pathPrefixSkip`** (optional): Number of path segment pairs to skip when generating endpoint names
- **`generateApiEndpoints`** (optional): Generate API endpoint URL constants for easy access from frontend
  - `0` (default): Use full path - `/api/v1/auth/login` → `api_v1_auth_login`
  - `1`: Skip first 2 segments - `/api/v1/auth/login` → `auth_login`
  - `2`: Skip first 4 segments - `/api/v1/auth/login` → (empty, would be `root`)

### Path Prefix Skip Examples

The `pathPrefixSkip` option helps customize endpoint naming based on your API structure:

```bash
# Skip /api/v1 prefix
npx @kolot/swagger-type-parser --input openapi.json --output ./types --path-prefix-skip 1

# Result: /api/v1/auth/login → endpoints/auth/auth_login.ts
# Result: /api/v1/users → endpoints/users.ts
```

This is especially useful when you want shorter, more meaningful endpoint names without the API version prefix.

## Features in Detail

### JSDoc Comments

All generated types include JSDoc comments extracted from OpenAPI descriptions:

```typescript
/**
 * User account information
 * 
 * Contains basic user profile data and authentication status.
 */
export type User = {
  /** Unique user identifier */
  id: number;
  /** User's email address */
  email: string;
  /** User's full name */
  name?: string;
};
```

### Endpoint Organization

Endpoints are automatically organized into folders based on their path segments. This makes it easy to:
- Find related endpoints
- Maintain a clean project structure
- Navigate large API specifications

For example, with `pathPrefixSkip: 1`:
- `/api/v1/auth/login` → `endpoints/auth/auth_login.ts`
- `/api/v1/auth/register` → `endpoints/auth/auth_register.ts`
- `/api/v1/users/list` → `endpoints/users/users_list.ts`

### Path Parameter Handling

Path parameters (e.g., `{id}`, `{entity_type}`) are automatically removed from endpoint names and folder structure:

- `/api/v1/users/{id}` → `endpoints/users/users.ts` (not `users_{id}.ts`)
- `/api/v1/entities/{type}/{id}` → `endpoints/entities/entities.ts`

## Limitations

- External `$ref` references (outside the specification) are not supported
- Complex OpenAPI features like `discriminator` may not be fully supported
- Prettier formatting requires Prettier to be installed in your project
- Some edge cases in Swagger 2.0 to OpenAPI 3.x conversion may not be handled
- Endpoint names are based on paths, not `operationId` (for consistency and predictability)

## Future Improvements

Potential enhancements for future versions:

- [ ] Generate a typed HTTP client helper
- [ ] Support for external `$ref` references
- [ ] Better handling of `discriminator` and other advanced OpenAPI features
- [ ] Support for generating React Query hooks
- [ ] Custom type name mapping
- [ ] Support for multiple OpenAPI specs in one run

## Development

### Building

```bash
npm run build
```

### Testing

```bash
npm test
```

### Linting

```bash
npm run lint
```

### Formatting

```bash
npm run format
```

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
