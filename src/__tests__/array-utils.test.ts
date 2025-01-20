import { describe, test, expect } from 'vitest';

import {
  validateArrayIndex,
  optimizeArrayOperations,
  batchArrayOperations,
  generateArrayOperations,
} from '../array-utils';
import { PatchError } from '../errors';

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
    const operations = [
      { type: 'remove' as const, index: 1, value: 'b' },
      { type: 'add' as const, index: 2, value: 'b' },
    ];

    const optimized = optimizeArrayOperations(operations);
    expect(optimized).toEqual([{ type: 'move', index: 2, fromIndex: 1 }]);
  });

  test('preserves non-optimizable operations', () => {
    const operations = [
      { type: 'add' as const, index: 0, value: 'a' },
      { type: 'remove' as const, index: 2 },
    ];

    const optimized = optimizeArrayOperations(operations);
    expect(optimized).toEqual(operations);
  });
});

describe('batchArrayOperations', () => {
  test('batches sequential add operations', () => {
    const operations = [
      { type: 'add' as const, index: 0, value: 'a' },
      { type: 'add' as const, index: 1, value: 'b' },
      { type: 'add' as const, index: 2, value: 'c' },
    ];

    const result = batchArrayOperations(operations);
    expect(result).toEqual([{ op: 'add', path: '/0', value: ['a', 'b', 'c'] }]);
  });

  test('batches sequential remove operations', () => {
    const operations = [
      { type: 'remove' as const, index: 2 },
      { type: 'remove' as const, index: 1 },
      { type: 'remove' as const, index: 0 },
    ];

    const result = batchArrayOperations(operations);
    expect(result).toEqual([{ op: 'remove', path: '/0', count: 3 }]);
  });

  test('respects maxBatchSize', () => {
    const operations = Array(5).fill({
      type: 'add' as const,
      index: 0,
      value: 'x',
    });

    const result = batchArrayOperations(operations, 2);
    expect(result.length).toBeGreaterThan(1);
  });
});

describe('generateArrayOperations', () => {
  test('generates operations for simple array changes', () => {
    const oldArr = ['a', 'b', 'c'];
    const newArr = ['a', 'd', 'c'];

    const operations = generateArrayOperations(oldArr, newArr);
    expect(operations).toEqual([
      { type: 'remove' as const, index: 1, value: 'b' },
      { type: 'add' as const, index: 1, value: 'd' },
    ]);
  });

  test('detects move operations', () => {
    const oldArr = ['a', 'b', 'c'];
    const newArr = ['a', 'c', 'b'];

    const operations = generateArrayOperations(oldArr, newArr);
    const optimized = optimizeArrayOperations(operations);
    expect(optimized).toContainEqual(expect.objectContaining({ type: 'move' }));
  });

  test('handles empty arrays', () => {
    expect(generateArrayOperations([], [])).toEqual([]);
    expect(generateArrayOperations(['a'], [])).toEqual([
      { type: 'remove' as const, index: 0, value: 'a' },
    ]);
    expect(generateArrayOperations([], ['a'])).toEqual([
      { type: 'add' as const, index: 0, value: 'a' },
    ]);
  });
});
