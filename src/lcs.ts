/**
 * LCS (Longest Common Subsequence) implementation with memoization
 */

import { deepEqual } from './utils';

interface LCSResult {
  indices: number[];
  length: number;
}

type Memoized<T> = {
  get: (key: string) => T | undefined;
  set: (key: string, value: T) => void;
  clear: () => void;
};

/**
 * Creates a memoized cache with a specified maximum size
 * Optimized LRU implementation using access counters instead of timestamps
 */
function createMemoCache<T>(maxSize: number = 1000): Memoized<T> {
  const cache = new Map<string, { value: T; accessCount: number }>();
  let globalAccessCounter = 0;
  let cleanupCounter = 0;

  return {
    get: (key: string) => {
      const entry = cache.get(key);
      if (entry) {
        entry.accessCount = ++globalAccessCounter;
        return entry.value;
      }
      return undefined;
    },
    set: (key: string, value: T) => {
      if (cache.size >= maxSize) {
        cleanupCounter++;
        if (cleanupCounter >= 100) {
          cleanupCounter = 0;
          // Remove least recently used entries
          const entries = Array.from(cache.entries());
          entries.sort((a, b) => a[1].accessCount - b[1].accessCount);
          const removeCount = Math.floor(entries.length / 2);
          for (let i = 0; i < removeCount; i++) {
            cache.delete(entries[i][0]);
          }
        } else {
          // Just remove oldest entry
          const firstKey = cache.keys().next();
          if (!firstKey.done) {
            cache.delete(firstKey.value);
          }
        }
      }
      cache.set(key, { value, accessCount: ++globalAccessCounter });
    },
    clear: () => {
      cache.clear();
      cleanupCounter = 0;
      globalAccessCounter = 0;
    },
  };
}

// Global LCS cache
const lcsCache = createMemoCache<LCSResult>();

/**
 * Computes the longest common subsequence between two arrays
 * Optimized with comparison caching but maintains algorithmic correctness
 */
export function findLCS<T>(arr1: T[], arr2: T[]): number[] {
  if (arr1.length === 0 || arr2.length === 0) {
    return [];
  }

  const key = getLCSCacheKey(arr1, arr2);
  const cached = lcsCache.get(key);
  if (cached) {
    return cached.indices;
  }

  // Build comparison cache to avoid duplicate deepEqual calls
  const comparisonCache = new Map<string, boolean>();
  const getComparison = (i: number, j: number): boolean => {
    const key = `${i}:${j}`;
    let result = comparisonCache.get(key);
    if (result === undefined) {
      result = deepEqual(arr1[i], arr2[j]);
      comparisonCache.set(key, result);
    }
    return result;
  };

  // Build LCS matrix with comparison caching
  const matrix: number[][] = Array(arr1.length + 1)
    .fill(0)
    .map(() => Array(arr2.length + 1).fill(0));

  for (let i = 1; i <= arr1.length; i++) {
    for (let j = 1; j <= arr2.length; j++) {
      if (getComparison(i - 1, j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1] + 1;
      } else {
        matrix[i][j] = Math.max(matrix[i - 1][j], matrix[i][j - 1]);
      }
    }
  }

  // Backtrack to find indices - reuse comparison cache
  const result: number[] = [];
  let i = arr1.length;
  let j = arr2.length;

  while (i > 0 && j > 0) {
    if (getComparison(i - 1, j - 1)) {
      result.unshift(i - 1);
      i--;
      j--;
    } else if (matrix[i - 1][j] > matrix[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }

  // Cache the result
  const lcsResult = {
    indices: result,
    length: matrix[arr1.length][arr2.length],
  };
  lcsCache.set(key, lcsResult);

  return result;
}

/**
 * Creates a cache key for LCS operations
 * Optimized with numeric hashing instead of string concatenation
 */
function getLCSCacheKey<T>(arr1: T[], arr2: T[]): string {
  const hash1 = hashArrayFast(arr1);
  const hash2 = hashArrayFast(arr2);
  return `${arr1.length}:${arr2.length}:${hash1}:${hash2}`;
}

/**
 * Fast numeric hash function using bit operations
 */
function hashArrayFast<T>(arr: T[]): number {
  if (arr.length === 0) return 0;

  let hash = 0;
  const samplePoints = Math.min(10, arr.length);
  const step = Math.max(1, Math.floor(arr.length / samplePoints));

  for (let i = 0; i < arr.length; i += step) {
    const valueHash = hashValueFast(arr[i]);
    // Mix bits using multiplication and XOR
    hash = ((hash << 5) - hash + valueHash) | 0; // |0 ensures 32-bit integer
  }

  // Include last element if not already sampled
  if (arr.length > 1 && (arr.length - 1) % step !== 0) {
    const valueHash = hashValueFast(arr[arr.length - 1]);
    hash = ((hash << 5) - hash + valueHash) | 0;
  }

  return hash >>> 0; // Convert to unsigned 32-bit integer
}

/**
 * Fast numeric hash for individual values
 */
function hashValueFast(value: any): number {
  if (value === null) return 1;
  if (value === undefined) return 0;

  if (typeof value === 'object') {
    if (Array.isArray(value)) {
      return (value.length * 2654435761) >>> 0; // Large prime multiplier
    }
    if (value.id !== undefined) {
      return hashValueFast(value.id) * 3;
    }
    if (value.key !== undefined) {
      return hashValueFast(value.key) * 5;
    }
    return (Object.keys(value).length * 2654435761) >>> 0;
  }

  switch (typeof value) {
    case 'number':
      // Handle both integers and floats
      return Math.abs(value * 2654435761) >>> 0;
    case 'boolean':
      return value ? 1231 : 1237; // Common hash codes for booleans
    case 'string':
      return stringHashFast(value);
    default:
      return stringHashFast(String(value));
  }
}

/**
 * Fast string hash using djb2 algorithm
 */
function stringHashFast(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  return hash >>> 0;
}

/**
 * Clears the LCS cache
 */
export function clearLCSCache(): void {
  lcsCache.clear();
}

/**
 * Get similarity score between two arrays (0-1)
 */
export function getArraySimilarity<T>(arr1: T[], arr2: T[]): number {
  if (arr1.length === 0 && arr2.length === 0) return 1;
  if (arr1.length === 0 || arr2.length === 0) return 0;

  const key = getLCSCacheKey(arr1, arr2);
  const cached = lcsCache.get(key);

  if (cached) {
    return cached.length / Math.max(arr1.length, arr2.length);
  }

  const lcs = findLCS(arr1, arr2);
  const similarity = lcs.length / Math.max(arr1.length, arr2.length);

  // キャッシュに結果を保存
  lcsCache.set(key, {
    indices: lcs,
    length: lcs.length,
  });

  return similarity;
}
