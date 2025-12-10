# swagger-type-parser

A CLI tool to generate TypeScript type definitions from OpenAPI/Swagger specifications. This tool helps frontend projects maintain type safety when working with backend APIs by automatically generating TypeScript types from API documentation.

## Features

- ✅ Fetches OpenAPI/Swagger specifications from URLs or local files
- ✅ Supports OpenAPI 3.x and Swagger 2.0 (with automatic conversion)
- ✅ Generates decomposed TypeScript types in a clean directory structure
- ✅ Resolves `$ref` references automatically
- ✅ Groups endpoints by tags for better organization
- ✅ Generates types for schemas, request bodies, parameters, and responses
- ✅ Configurable via config file or CLI flags
- ✅ Optional Prettier formatting for generated code

## Installation

```bash
npm install --save-dev swagger-type-parser

# or

pnpm add -D swagger-type-parser

# or

yarn add -D swagger-type-parser
```

## Basic Usage

### Using CLI Flags

```bash
npx swagger-type-parser --input http://localhost:3542/api/v1/openapi.json --output ./src/api/types
```

### Using Config File

Create a `swagger-type-parser.config.json` file in your project root:

```json
{
  "input": "http://localhost:3542/api/v1/openapi.json",
  "output": "./src/api/types",
  "clean": true,
  "pretty": true,
  "verbose": false
}
```

Then run:

```bash
npx swagger-type-parser
```

### Custom Config File Path

```bash
npx swagger-type-parser --config configs/swagger.config.json
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

**Note:** CLI flags override values from the config file.

## Input Sources

The tool supports multiple input sources:

1. **HTTP/HTTPS URLs** - Fetch from a running API server:
   ```bash
   --input http://localhost:3542/api/v1/openapi.json
   --input https://api.example.com/docs/openapi.json
   ```

2. **Local JSON files** - Use a local OpenAPI specification:
   ```bash
   --input ./openapi.json
   --input ./api-docs/swagger.json
   ```

## Generated Directory Structure

The tool generates TypeScript types in a decomposed structure:

```
src/api/types/
├── index.ts                 # Main barrel exports
├── schemas/                 # Schema type definitions
│   ├── User.ts
│   ├── Order.ts
│   └── Product.ts
├── endpoints/               # Endpoint type definitions (grouped by tag)
│   ├── users/
│   │   ├── GetUser.ts
│   │   ├── CreateUser.ts
│   │   └── UpdateUser.ts
│   └── orders/
│       ├── ListOrders.ts
│       └── CreateOrder.ts
└── common/                  # Common utility types
    └── Http.ts             # HttpMethod, RequestConfig, etc.
```

## Using Generated Types

### Import Schema Types

```typescript
import type { User, Order, Product } from './api/types/schemas/User';
// or from barrel export
import type { User, Order, Product } from './api/types';
```

### Import Endpoint Types

```typescript
import type { GetUser, CreateUser } from './api/types/endpoints/users/GetUser';
import type { ListOrders } from './api/types/endpoints/orders/ListOrders';
```

### Example: Typed API Call

```typescript
import type { GetUser, GetUser200Response } from './api/types/endpoints/users/GetUser';
import type { User } from './api/types/schemas/User';

async function fetchUser(userId: string): Promise<GetUser200Response> {
  const response = await fetch(`/api/users/${userId}`, {
    method: 'GET',
  });
  
  if (!response.ok) {
    throw new Error('Failed to fetch user');
  }
  
  return response.json();
}

// Usage
const user: User = await fetchUser('123');
```

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
  "input": "http://localhost:3542/api/v1/openapi.json",
  "output": "./src/api/types",
  "clean": true,
  "pretty": true,
  "verbose": false
}
```

- **`input`** (required): URL or path to OpenAPI/Swagger JSON
- **`output`** (required): Output directory for generated files
- **`clean`** (optional): Remove all files in output directory before generation
- **`pretty`** (optional): Format generated code with Prettier (requires Prettier to be installed)
- **`verbose`** (optional): Enable verbose logging

## Limitations

- External `$ref` references (outside the specification) are not supported
- Complex OpenAPI features like `discriminator` may not be fully supported
- Prettier formatting requires Prettier to be installed in your project
- Some edge cases in Swagger 2.0 to OpenAPI 3.x conversion may not be handled

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
