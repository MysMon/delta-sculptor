import { describe, test, expect } from 'vitest';

import {
  validateArrayIndex,
  optimizeArrayOperations,
  batchArrayOperations,
  generateArrayOperations,
  ArrayOperation,
  toJsonPatch,
  isArrayPath,
  getArrayBasePath,
  expandArrayOperations,
} from './array-utils';
import { PatchError } from './errors';

describe('validateArrayIndex', () => {
  test('validates valid indices', () => {
    const arr = [1, 2, 3];
    expect(validateArrayIndex(arr, 0)).toBe(0);
    expect(validateArrayIndex(arr, 2)).toBe(2);
    expect(validateArrayIndex(arr, '1')).toBe(1);
    expect(validateArrayIndex(arr, '-', true)).toBe(3);
  });

  test('throws for invalid indices', () => {
    const arr = [1, 2, 3];
    expect(() => validateArrayIndex(arr, 4)).toThrow(PatchError);
    expect(() => validateArrayIndex(arr, -1)).toThrow(PatchError);
    expect(() => validateArrayIndex(arr, 'abc')).toThrow(PatchError);
    expect(() => validateArrayIndex(arr, '')).toThrow(PatchError);
    expect(() => validateArrayIndex(arr, 1.5)).toThrow(PatchError);
  });

  test('handles allowEnd parameter correctly', () => {
    const arr = [1, 2, 3];
    expect(validateArrayIndex(arr, 3, true)).toBe(3);
    expect(() => validateArrayIndex(arr, 3, false)).toThrow(PatchError);
    expect(validateArrayIndex(arr, '-', true)).toBe(3);
    expect(validateArrayIndex(arr, '-', false)).toBe(2);
  });
});

describe('toJsonPatch', () => {
  test('converts array operations to JSON Patch format', () => {
    const operations: ArrayOperation[] = [
      { type: 'add', index: 0, value: 'a' },
      { type: 'remove', index: 1 },
      { type: 'move', index: 2, from: 0 },
    ];

    const patch = toJsonPatch(operations);
    expect(patch).toEqual([
      { op: 'add', path: '/0', value: 'a' },
      { op: 'remove', path: '/1' },
      { op: 'move', path: '/2', from: '/0' },
    ]);
  });

  test('handles custom base path', () => {
    const operations: ArrayOperation[] = [
      { type: 'add', index: 0, value: 'x' },
    ];

    const patch = toJsonPatch(operations, { basePath: '/arr' });
    expect(patch).toEqual([{ op: 'add', path: '/arr/0', value: 'x' }]);
  });
});

describe('array path utilities', () => {
  test('isArrayPath identifies array paths', () => {
    expect(isArrayPath('/arr/0')).toBe(true);
    expect(isArrayPath('/arr/-')).toBe(true);
    expect(isArrayPath('/arr/prop')).toBe(false);
    expect(isArrayPath('/arr/')).toBe(false);
  });

  test('getArrayBasePath extracts base path', () => {
    expect(getArrayBasePath('/arr/0')).toBe('/arr');
    expect(getArrayBasePath('0')).toBe('');
    expect(getArrayBasePath('/deep/path/arr/0')).toBe('/deep/path/arr');
  });
});

describe('expandArrayOperations', () => {
  test('expands batch remove operations', () => {
    const patch = [{ op: 'remove' as const, path: '/0', count: 2 }];

    const expanded = expandArrayOperations(patch);
    expect(expanded).toEqual([
      { op: 'remove', path: '/0' },
      { op: 'remove', path: '/0' },
    ]);
  });

  test('expands batch add operations', () => {
    const patch = [{ op: 'add' as const, path: '/0', value: ['a', 'b'] }];

    const expanded = expandArrayOperations(patch);
    expect(expanded).toEqual([
      { op: 'add', path: '/0', value: 'a' },
      { op: 'add', path: '/1', value: 'b' },
    ]);
  });

  test('preserves non-batch operations', () => {
    const patch = [{ op: 'move' as const, path: '/1', from: '/0' }];

    const expanded = expandArrayOperations(patch);
    expect(expanded).toEqual(patch);
  });
});

describe('optimizeArrayOperations', () => {
  test('converts remove+add into move operations', () => {
    const operations: ArrayOperation[] = [
      { type: 'remove', index: 1, value: 'b' },
      { type: 'add', index: 2, value: 'b' },
    ];

    const optimized = optimizeArrayOperations(operations);
    expect(optimized).toEqual([
      { type: 'move', index: 2, from: 1, value: 'b' },
    ]);
  });

  test('preserves non-optimizable operations', () => {
    const operations: ArrayOperation[] = [
      { type: 'add', index: 0, value: 'a' },
      { type: 'remove', index: 2 },
    ];

    const optimized = optimizeArrayOperations(operations);
    expect(optimized).toEqual(operations);
  });
});

describe('batchArrayOperations', () => {
  test('batches sequential add operations', () => {
    const operations = batchArrayOperations(
      generateArrayOperations([], ['a', 'b', 'c'])
    );
    expect(operations).toEqual([
      { op: 'add', path: '/0', value: 'a' },
      { op: 'add', path: '/1', value: 'b' },
      { op: 'add', path: '/2', value: 'c' },
    ]);
  });

  test('batches sequential remove operations', () => {
    const operations = batchArrayOperations(
      generateArrayOperations(['a', 'b', 'c'], [])
    );
    expect(operations).toEqual([{ op: 'remove', path: '/0', count: 3 }]);
  });

  test('respects maxBatchSize', () => {
    const operations = batchArrayOperations(
      generateArrayOperations([], Array(5).fill('x')),
      2
    );
    expect(operations.length).toBeGreaterThan(1);
  });
});

describe('generateArrayOperations', () => {
  test('generates operations for simple array changes', () => {
    const oldArr = ['a', 'b', 'c'];
    const newArr = ['a', 'd', 'c'];

    const patch = batchArrayOperations(generateArrayOperations(oldArr, newArr));
    expect(patch).toEqual([
      { op: 'remove', path: '/1' },
      { op: 'add', path: '/1', value: 'd' },
    ]);
  });

  test('detects move operations', () => {
    const oldArr = ['a', 'b', 'c'];
    const newArr = ['a', 'c', 'b'];

    const operations = generateArrayOperations(oldArr, newArr);
    const patch = batchArrayOperations(operations);
    expect(patch[0].op).toBe('move');
  });

  test('handles empty arrays', () => {
    expect(generateArrayOperations([], [])).toEqual([]);

    const removeOps = batchArrayOperations(generateArrayOperations(['a'], []));
    expect(removeOps).toEqual([{ op: 'remove', path: '/0' }]);

    const addOps = batchArrayOperations(generateArrayOperations([], ['a']));
    expect(addOps).toEqual([{ op: 'add', path: '/0', value: 'a' }]);
  });

  test('handles complex transformations', () => {
    const oldArr = [1, 2, 3, 4, 5];
    const newArr = [5, 4, 6, 7, 1];

    const operations = generateArrayOperations(oldArr, newArr);
    const patch = batchArrayOperations(operations);

    // Apply the patch to oldArr and verify the result
    const result = [...oldArr];
    patch.forEach(op => {
      const index = parseInt(op.path.slice(1));
      switch (op.op) {
        case 'move':
          if (!op.from) {
            throw new Error('Move operation missing from path');
          }
          const fromIndex = parseInt(op.from.slice(1));
          const [value] = result.splice(fromIndex, 1);
          result.splice(index, 0, value);
          break;
        case 'remove':
          if ('count' in op) {
            result.splice(index, op.count);
          } else {
            result.splice(index, 1);
          }
          break;
        case 'add':
          if (Array.isArray(op.value)) {
            result.splice(index, 0, ...(op.value as number[]));
          } else {
            result.splice(index, 0, op.value as number);
          }
          break;
      }
    });

    expect(result).toEqual(newArr);
  });
});
