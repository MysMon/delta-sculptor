import { describe, test, expect } from 'vitest';

import { findLCS, clearLCSCache, getArraySimilarity } from '../lcs';

describe('LCS (Longest Common Subsequence)', () => {
  test('finds LCS for simple arrays', () => {
    const arr1 = [1, 2, 3, 4];
    const arr2 = [1, 3, 4];

    const indices = findLCS(arr1, arr2);
    expect(indices).toEqual([0, 2, 3]);

    // Verify indices map to correct subsequence
    const subsequence = indices.map(i => arr1[i]);
    expect(subsequence).toEqual([1, 3, 4]);
  });

  test('handles empty arrays', () => {
    expect(findLCS([], [])).toEqual([]);
    expect(findLCS([1, 2], [])).toEqual([]);
    expect(findLCS([], [1, 2])).toEqual([]);
  });

  test('handles arrays with no common elements', () => {
    const arr1 = [1, 2, 3];
    const arr2 = [4, 5, 6];
    expect(findLCS(arr1, arr2)).toEqual([]);
  });

  test('finds LCS for arrays with duplicates', () => {
    const arr1 = [1, 2, 2, 3];
    const arr2 = [2, 2, 3];

    const indices = findLCS(arr1, arr2);
    const subsequence = indices.map(i => arr1[i]);
    expect(subsequence).toEqual([2, 2, 3]);
  });

  test('handles arrays with objects', () => {
    const obj1 = { id: 1 };
    const obj2 = { id: 2 };
    const arr1 = [obj1, obj2];
    const arr2 = [obj1, { id: 3 }, obj2];

    const indices = findLCS(arr1, arr2);
    expect(indices.length).toBe(2);
    expect(arr1[indices[0]]).toBe(obj1);
    expect(arr1[indices[1]]).toBe(obj2);
  });

  test('caches results for performance', () => {
    const arr1 = [1, 2, 3, 4, 5];
    const arr2 = [2, 3, 4, 6];

    // First call computes LCS
    const result1 = findLCS(arr1, arr2);
    // Second call should use cache
    const result2 = findLCS(arr1, arr2);

    expect(result1).toEqual(result2);
    expect(result1).toEqual([1, 2, 3]);
  });

  test('clears cache successfully', () => {
    const arr1 = [1, 2, 3];
    const arr2 = [2, 3, 4];

    const result1 = findLCS(arr1, arr2);
    clearLCSCache();
    const result2 = findLCS(arr1, arr2);

    expect(result1).toEqual(result2);
  });

  test('handles mixed type arrays', () => {
    const arr1 = [1, 'two', true, null, undefined, { id: 3 }];
    const arr2 = [1, 'two', false, null, undefined, { id: 3 }];

    const indices = findLCS(arr1, arr2);
    expect(indices.length).toBe(5); // All except boolean should match
    expect(indices.map(i => arr1[i])).toEqual([
      1,
      'two',
      null,
      undefined,
      { id: 3 },
    ]);
  });

  test('manages cache size', () => {
    // Generate many different arrays to test cache management
    const arrays = Array.from({ length: 2000 }, (_, i) =>
      Array.from({ length: 3 }, (_, j) => i + j)
    );

    // Perform many LCS operations
    for (let i = 0; i < arrays.length - 1; i++) {
      findLCS(arrays[i], arrays[i + 1]);
    }

    // Cache should have automatically cleaned up old entries
    const result1 = findLCS([1, 2, 3], [1, 2, 3]);
    const result2 = findLCS([1, 2, 3], [1, 2, 3]);
    expect(result1).toEqual(result2); // Cache still works
  });
});

describe('getArraySimilarity', () => {
  test('calculates similarity score correctly', () => {
    expect(getArraySimilarity([1, 2, 3], [1, 2, 3])).toBe(1); // Identical
    expect(getArraySimilarity([1, 2, 3], [1, 2])).toBe(2 / 3); // Partial match
    expect(getArraySimilarity([1, 2], [3, 4])).toBe(0); // No match
    expect(getArraySimilarity([], [])).toBe(1); // Empty arrays
  });

  test('handles arrays of different lengths', () => {
    const arr1 = [1, 2, 3, 4];
    const arr2 = [1, 2, 3, 4, 5, 6];
    expect(getArraySimilarity(arr1, arr2)).toBe(4 / 6); // 4 common elements, max length 6
  });

  test('handles arrays with objects', () => {
    const obj1 = { id: 1 };
    const obj2 = { id: 2 };
    const arr1 = [obj1, obj2];
    const arr2 = [obj1, { id: 3 }, obj2];
    expect(getArraySimilarity(arr1, arr2)).toBe(2 / 3); // 2 common elements, max length 3
  });

  test('uses cache for repeated calculations', () => {
    const arr1 = [1, 2, 3, 4, 5];
    const arr2 = [1, 2, 3, 6, 7];

    const score1 = getArraySimilarity(arr1, arr2);
    const score2 = getArraySimilarity(arr1, arr2);

    expect(score1).toBe(score2);
    expect(score1).toBe(3 / 5); // 3 common elements, max length 5
  });

  test('handles arrays with diverse types', () => {
    const arr1 = [
      null,
      undefined,
      true,
      false,
      42,
      'string',
      { id: 1 },
      { key: 'value' },
      [1, 2],
      new Date(),
    ];
    const arr2 = [...arr1]; // Copy array
    arr2[5] = 'different'; // Change one value

    const similarity = getArraySimilarity(arr1, arr2);
    expect(similarity).toBe(9 / 10); // 9 matching elements, max length 10
  });

  test('handles large arrays efficiently', () => {
    const arr1 = Array.from({ length: 1000 }, (_, i) => i);
    const arr2 = Array.from({ length: 1000 }, (_, i) => i + 500);

    const start = Date.now();
    const similarity = getArraySimilarity(arr1, arr2);
    const duration = Date.now() - start;

    expect(similarity).toBe(500 / 1000); // 500 common elements, max length 1000
    expect(duration).toBeLessThan(1000); // Should complete in reasonable time
  });
});
