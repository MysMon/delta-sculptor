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
 */
function createMemoCache<T>(maxSize: number = 1000): Memoized<T> {
  const cache = new Map<string, { value: T; lastUsed: number }>();
  let cleanupCounter = 0;

  return {
    get: (key: string) => {
      const entry = cache.get(key);
      if (entry) {
        entry.lastUsed = Date.now();
        return entry.value;
      }
      return undefined;
    },
    set: (key: string, value: T) => {
      if (cache.size >= maxSize) {
        // Cleanup every 100 operations
        cleanupCounter++;
        if (cleanupCounter >= 100) {
          cleanupCounter = 0;
          // Remove least recently used entries
          const entries = Array.from(cache.entries());
          entries.sort((a, b) => a[1].lastUsed - b[1].lastUsed);
          for (let i = 0; i < entries.length / 2; i++) {
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
      cache.set(key, { value, lastUsed: Date.now() });
    },
    clear: () => {
      cache.clear();
      cleanupCounter = 0;
    },
  };
}

// Global LCS cache
const lcsCache = createMemoCache<LCSResult>();

/**
 * Computes the longest common subsequence between two arrays
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

  const matrix: number[][] = Array(arr1.length + 1)
    .fill(0)
    .map(() => Array(arr2.length + 1).fill(0));

  // Build LCS matrix with deep equality comparison
  for (let i = 1; i <= arr1.length; i++) {
    for (let j = 1; j <= arr2.length; j++) {
      if (deepEqual(arr1[i - 1], arr2[j - 1])) {
        matrix[i][j] = matrix[i - 1][j - 1] + 1;
      } else {
        matrix[i][j] = Math.max(matrix[i - 1][j], matrix[i][j - 1]);
      }
    }
  }

  // Backtrack to find indices
  const result: number[] = [];
  let i = arr1.length;
  let j = arr2.length;

  while (i > 0 && j > 0) {
    if (deepEqual(arr1[i - 1], arr2[j - 1])) {
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
 */
function getLCSCacheKey<T>(arr1: T[], arr2: T[]): string {
  // より詳細なキャッシュキーを生成
  const hash1 = hashArray(arr1);
  const hash2 = hashArray(arr2);
  return `${arr1.length}:${arr2.length}:${hash1}:${hash2}`;
}

function hashArray<T>(arr: T[]): string {
  if (arr.length === 0) return '0';

  // サンプリングポイントを増やして精度を向上
  const samplePoints = Math.min(20, arr.length);
  const step = Math.max(1, Math.floor(arr.length / samplePoints));

  let hash = '';
  for (let i = 0; i < arr.length; i += step) {
    hash += hashValue(arr[i]) + ':';
  }

  // 末尾の要素も含める
  if (arr.length > 1 && (arr.length - 1) % step !== 0) {
    hash += hashValue(arr[arr.length - 1]);
  }

  return hash;
}

function hashValue(value: any): string {
  if (value === null) return 'n';
  if (value === undefined) return 'u';

  if (typeof value === 'object') {
    if (Array.isArray(value)) {
      // 配列の場合は長さと最初の要素をハッシュに含める
      return `a${value.length}:${hashValue(value[0])}`;
    }
    if (value.id !== undefined) return `i${value.id}`;
    if (value.key !== undefined) return `k${value.key}`;
    // オブジェクトの場合はキーの数を含める
    return `o${Object.keys(value).length}`;
  }

  const type = typeof value;
  switch (type) {
    case 'number':
      return `d${value}`;
    case 'boolean':
      return `b${value}`;
    case 'string':
      return `s${value.length}:${value.slice(0, 10)}`;
    default:
      return `x${String(value)}`;
  }
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
