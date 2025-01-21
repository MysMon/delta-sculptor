# Delta Sculptor

A robust TypeScript implementation of JSON Patch ([RFC 6902](https://tools.ietf.org/html/rfc6902)) with additional features for efficient diffing, patching, and patch inversion.

## Warning

This repository is an alpha release. It is not yet ready for production use. Please use at your own risk.

## Features

- 🔄 Full JSON Patch (RFC 6902) compliance
- 🔍 Efficient diff generation with move detection
- 🔒 Immutable operations support
- ↩️ Inverse patch generation for undo operations
- 🎯 Targeted array operations with LCS algorithm
- 💪 Strong TypeScript types
- 🛡️ Comprehensive error handling
- 🔍 Circular reference detection
- ⏮️ Automatic rollback on failed patches

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

### Advanced Array Operations

The library provides sophisticated array handling capabilities designed to generate efficient and safe patches:

```typescript
// Move Detection
const oldArray = [1, 2, 3, 4];
const newArray = [4, 2, 3, 1];

const patch = DeltaSculptor.createPatch(oldArray, newArray, {
  detectMove: true,
});
console.log(patch);
// [
//   { op: 'move', from: '/3', path: '/0' },
//   { op: 'move', from: '/0', path: '/3' }
// ]

// Batch Operations
const source = [1, 2, 3, 4, 5];
const target = [1, 6, 7, 8, 5];

const patch = DeltaSculptor.createPatch(source, target, {
  batchArrayOps: true,
  maxBatchSize: 5, // Optional limit on batch size (experimental)
});
console.log(patch);
// [
//   { op: 'remove', path: '/1', count: 3 },
//   { op: 'add', path: '/1', value: [6, 7, 8] }
// ]

// Complex Array Transformations
const oldArray = ['a', 'b', 'c', 'd', 'e'];
const newArray = ['e', 'c', 'x', 'y', 'b'];

const patch = DeltaSculptor.createPatch(oldArray, newArray, {
  detectMove: true,
  batchArrayOps: true,
});
console.log(patch);
// [
//   { op: 'move', from: '/4', path: '/0' }, // Move 'e' to front
//   { op: 'move', from: '/2', path: '/1' }, // Move 'c' after 'e'
//   { op: 'remove', path: '/2', count: 2 }, // Remove 'd' and original position of 'b'
//   { op: 'add', path: '/2', value: ['x', 'y'] }, // Add new elements
//   { op: 'move', from: '/1', path: '/4' } // Move 'b' to end
// ]
```

#### Array Operation Features

- **Intelligent Move Detection**

  - Automatically detects element movements within arrays
  - Converts remove+add pairs into efficient move operations
  - Handles multiple moves with optimal sequencing
  - Preserves array element identity

- **Batch Operations**

  - Combines sequential operations for efficiency:
    - Multiple removes become a single remove with count
    - Sequential adds become a single add with array value
  - Configurable batch sizes for fine-grained control
  - Automatic optimization of operation sequences

- **Safety and Validation**

  - Array index bounds checking
  - Path validation for array operations
  - Circular reference detection in arrays
  - Automatic rollback on failed array operations

- **Operation Optimization**
  - LCS (Longest Common Subsequence) algorithm for minimal diffs
  - Smart grouping of array operations
  - Efficient handling of large array transformations
  - Memory-efficient batch processing

### Immutable Operations

```typescript
const original = { a: 1, b: { c: 2 } };
const patch = [{ op: 'replace', path: '/b/c', value: 3 }];

const result = DeltaSculptor.applyPatchImmutable(original, patch);
console.log(original); // { a: 1, b: { c: 2 } }
console.log(result); // { a: 1, b: { c: 3 } }
```

### Inverse Patch Generation

```typescript
const obj = { a: 1, b: 2 };
const patch = [
  { op: 'replace', path: '/a', value: 3 },
  { op: 'remove', path: '/b' },
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
  { op: 'replace', path: '/nonexistent', value: 3 }, // This will fail
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
- `maxBatchSize?: number` - Maximum size for batched operations
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

MIT @MysMon
Please see the [License File](LICENSE) for more information.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
