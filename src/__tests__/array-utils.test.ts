import { describe, test, expect } from 'vitest';

import {
  validateArrayIndex,
  optimizeArrayOperations,
  batchArrayOperations,
  generateArrayOperations,
} from '../array-utils';
import { PatchError } from '../errors';
import { JsonPatch } from '../types';

describe('validateArrayIndex', () => {
  test('validates valid indices', () => {
    const arr = [1, 2, 3];
    expect(validateArrayIndex(arr, '/0')).toBe(0);
    expect(validateArrayIndex(arr, '/2')).toBe(2);
    expect(validateArrayIndex(arr, '/-')).toBe(3);
  });

  test('throws for invalid indices', () => {
    const arr = [1, 2, 3];
    expect(() => validateArrayIndex(arr, '/4')).toThrow(PatchError);
    expect(() => validateArrayIndex(arr, '/-1')).toThrow(PatchError);
    expect(() => validateArrayIndex(arr, '/abc')).toThrow(PatchError);
    expect(() => validateArrayIndex(arr, '/')).toThrow(PatchError);
  });
});

describe('optimizeArrayOperations', () => {
  test('converts remove+add into move operations', () => {
    const patch: JsonPatch = [
      { op: 'remove', path: '/1' },
      { op: 'add', path: '/2', value: 'b' },
    ];

    const optimized = optimizeArrayOperations(patch);
    expect(optimized).toEqual([{ op: 'move', path: '/2', from: '/1' }]);
  });

  test('preserves non-optimizable operations', () => {
    const patch: JsonPatch = [
      { op: 'add', path: '/0', value: 'a' },
      { op: 'remove', path: '/2' },
    ];

    const optimized = optimizeArrayOperations(patch);
    expect(optimized).toEqual(patch);
  });
});

describe('batchArrayOperations', () => {
  test('batches sequential add operations', () => {
    const operations = batchArrayOperations(
      generateArrayOperations(['a', 'b', 'c'], [])
    );
    expect(operations).toEqual([
      { op: 'add', path: '/0', value: ['a', 'b', 'c'] },
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
      let value;
      switch (op.op) {
        case 'move':
          if (!op.from) {
            throw new Error('Move operation missing from path');
          }
          value = result.splice(parseInt(op.from.slice(1)), 1)[0];
          result.splice(parseInt(op.path.slice(1)), 0, value);
          break;
        case 'remove':
          if ('count' in op) {
            result.splice(parseInt(op.path.slice(1)), op.count);
          } else {
            result.splice(parseInt(op.path.slice(1)), 1);
          }
          break;
        case 'add':
          if (Array.isArray(op.value)) {
            result.splice(parseInt(op.path.slice(1)), 0, ...op.value);
          } else {
            result.splice(parseInt(op.path.slice(1)), 0, op.value);
          }
          break;
      }
    });

    expect(result).toEqual(newArr);
  });
});
