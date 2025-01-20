# Delta Sculptor

[![npm version](https://badge.fury.io/js/delta-sculptor.svg)](https://badge.fury.io/js/delta-sculptor)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/%3C%2F%3E-TypeScript-blue.svg)](https://www.typescriptlang.org/)

A robust TypeScript implementation of JSON Patch ([RFC 6902](https://tools.ietf.org/html/rfc6902)) with additional features for efficient diffing, patching, and patch inversion.

## Features

- 🔄 Full JSON Patch (RFC 6902) compliance
- 🔍 Efficient diff generation with move detection
- 🔒 Immutable operations support
- ↩️ Inverse patch generation for undo operations
- 🎯 Targeted array operations with LCS algorithm
- 💪 Strong TypeScript types
- 🛡️ Comprehensive error handling
- 🔄 Circular reference detection
- 🔙 Automatic rollback on failed patches

## Installation

```bash
npm install delta-sculptor
# or
yarn add delta-sculptor
# or
pnpm add delta-sculptor
```

## Usage

### Basic Example

```typescript
import { DeltaSculptor } from 'delta-sculptor';

// Generate a patch
const oldObj = { a: 1, b: 2 };
const newObj = { a: 1, b: 3, c: 4 };

const patch = DeltaSculptor.createPatch(oldObj, newObj);
console.log(patch);
// [
//   { op: 'replace', path: '/b', value: 3 },
//   { op: 'add', path: '/c', value: 4 }
// ]

// Apply the patch
DeltaSculptor.applyPatch(oldObj, patch);
console.log(oldObj); // { a: 1, b: 3, c: 4 }
```

### Immutable Operations

```typescript
const original = { a: 1, b: { c: 2 } };
const patch = [{ op: 'replace', path: '/b/c', value: 3 }];

const result = DeltaSculptor.applyPatchImmutable(original, patch);
console.log(original); // { a: 1, b: { c: 2 } }
console.log(result);   // { a: 1, b: { c: 3 } }
```

### Move Detection

```typescript
const oldArray = [1, 2, 3, 4];
const newArray = [4, 2, 3, 1];

const patch = DeltaSculptor.createPatch(oldArray, newArray, { detectMove: true });
console.log(patch);
// [
//   { op: 'move', from: '/3', path: '/0' },
//   { op: 'move', from: '/0', path: '/3' }
// ]
```

### Inverse Patch Generation

```typescript
const obj = { a: 1, b: 2 };
const patch = [
  { op: 'replace', path: '/a', value: 3 },
  { op: 'remove', path: '/b' }
];

const inversePatch = DeltaSculptor.applyPatchWithInverse(obj, patch);
console.log(obj); // { a: 3 }

// Undo changes by applying inverse patch
DeltaSculptor.applyPatch(obj, inversePatch);
console.log(obj); // { a: 1, b: 2 }
```

### Safe Patching with Rollback

```typescript
const obj = { a: 1 };
const patch = [
  { op: 'replace', path: '/a', value: 2 },
  { op: 'replace', path: '/nonexistent', value: 3 } // This will fail
];

try {
  DeltaSculptor.applyPatchWithRollback(obj, patch);
} catch (error) {
  console.log(obj); // { a: 1 } - Original state is preserved
}
```

## API Reference

### DeltaSculptor

#### `createPatch(oldObj: any, newObj: any, options?: CreateDiffOptions): JsonPatch`

Generates a JSON Patch that transforms `oldObj` into `newObj`.

Options:
- `detectMove?: boolean` - Enable move operation detection
- `batchArrayOps?: boolean` - Batch sequential array operations
- `maxDepth?: number` - Maximum recursion depth

#### `applyPatch(target: any, patch: JsonPatch, options?: PatchOptions): void`

Applies a patch to the target object, modifying it in place.

#### `applyPatchImmutable<T>(target: T, patch: JsonPatch, options?: PatchOptions): T`

Applies a patch and returns a new object, leaving the original unchanged.

#### `applyPatchWithRollback<T extends object>(target: T, patch: JsonPatch, options?: PatchOptions): void`

Applies a patch with automatic rollback on failure.

#### `applyPatchWithInverse(obj: any, patch: JsonPatch, options?: InversePatchOptions): JsonPatch`

Applies a patch and returns an inverse patch that can undo the changes.

## Development

```bash
# Install dependencies
npm install

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Build
npm run build

# Lint
npm run lint

# Format
npm run format
```

## License

MIT © [Your Name]

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
