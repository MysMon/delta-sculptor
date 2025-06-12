import {
  generateArrayOperations,
  batchArrayOperations,
  toJsonPatch,
  optimizeJsonPatch,
} from './array-utils';
import { PatchError } from './errors';
import type { JsonPatch } from './types'; // Ensure JsonPatch is imported
import { detectCircular, deepEqual } from './validate';

interface DiffArrayOptions {
  checkCircular?: boolean;
  maxBatchSize?: number;
  batchArrayOps?: boolean;
  basePath?: string;
  detectMove?: boolean;
  maxDepth?: number;
  currentDepth?: number;
}

/**
 * Generate a diff for arrays using LCS for optimal move detection
 */
export function diffArrayWithLCS(
  oldArr: any[],
  newArr: any[],
  params: DiffArrayOptions = {},
  recursiveDiffFn?: (oldItem: any, newItem: any, itemPath: string) => JsonPatch
): JsonPatch {
  const {
    checkCircular = true,
    maxBatchSize = 100,
    batchArrayOps = false,
    basePath = '',
  } = params;

  // Check for circular references in new array
  if (checkCircular && detectCircular(newArr)) {
    throw PatchError.circularReference(basePath);
  }

  // シンプルな変更の場合はdiffArraySimpleを使用
  const isSimpleChange =
    oldArr.length === newArr.length &&
    oldArr.length <= 3 &&
    oldArr.filter((v, i) => !deepEqual(v, newArr[i])).length === 1;

  if (isSimpleChange) {
    return diffArraySimple(oldArr, newArr, { basePath }, recursiveDiffFn);
  }

  // 複雑な変換の場合は最適化された操作を使用
  const operations = generateArrayOperations(oldArr, newArr);

  let patch: JsonPatch;
  if (batchArrayOps) {
    patch = batchArrayOperations(operations, maxBatchSize);
  } else {
    patch = toJsonPatch(operations, { basePath: '' });
    patch = optimizeJsonPatch(patch);
  }

  // Add base path to all operations
  return patch.map(op => ({
    ...op,
    path: basePath + op.path,
    ...(op.from ? { from: basePath + op.from } : {}),
  }));
}

/**
 * Simple array diffing without move detection
 * Used when move detection is disabled
 */
export function diffArraySimple(
  oldArr: any[],
  newArr: any[],
  params: { basePath?: string; batchArrayOps?: boolean } = {},
  recursiveDiffFn?: (oldItem: any, newItem: any, itemPath: string) => JsonPatch
): JsonPatch {
  const { basePath = '', batchArrayOps = false } = params;
  const patch: JsonPatch = [];
  const oldLen = oldArr.length;
  const newLen = newArr.length;
  const minLen = Math.min(oldLen, newLen);

  if (batchArrayOps) {
    for (let i = 0; i < minLen; i++) {
      if (deepEqual(oldArr[i], newArr[i])) {
        continue;
      }

      const currentPath = `${basePath}/${i}`;
      if (
        recursiveDiffFn &&
        typeof oldArr[i] === 'object' &&
        oldArr[i] !== null &&
        typeof newArr[i] === 'object' &&
        newArr[i] !== null &&
        !Array.isArray(oldArr[i]) &&
        !Array.isArray(newArr[i])
      ) {
        patch.push(...recursiveDiffFn(oldArr[i], newArr[i], currentPath));
        continue;
      }

      // Start of a differing block
      let j = i;
      while (j < minLen) {
        if (deepEqual(oldArr[j], newArr[j])) {
          break; // End of block if elements are equal
        }
        // Check if the differing element should be handled by recursion
        if (
          recursiveDiffFn &&
          typeof oldArr[j] === 'object' &&
          oldArr[j] !== null &&
          typeof newArr[j] === 'object' &&
          newArr[j] !== null &&
          !Array.isArray(oldArr[j]) &&
          !Array.isArray(newArr[j])
        ) {
          break; // End of block if an element needs recursive diffing
        }
        j++;
      }

      const diffBlockLength = j - i;
      if (diffBlockLength > 0) {
        patch.push({
          op: 'remove',
          path: `${basePath}/${i}`,
          count: diffBlockLength,
        });
        const valuesToAdd = newArr.slice(i, j);
        patch.push({
          op: 'add',
          path: `${basePath}/${i}`,
          value: valuesToAdd.length === 1 ? valuesToAdd[0] : valuesToAdd,
        });
      }
      i = j - 1; // Continue iteration after the processed block
    }

    // Handle trailing elements
    if (newLen > oldLen) {
      const addedValues = newArr.slice(oldLen);
      patch.push({
        op: 'add',
        path: `${basePath}/${oldLen}`,
        value: addedValues.length === 1 ? addedValues[0] : addedValues,
      });
    } else if (oldLen > newLen) {
      patch.push({
        op: 'remove',
        path: `${basePath}/${newLen}`,
        count: oldLen - newLen,
      });
    }
  } else {
    // Original logic for batchArrayOps = false
    for (let i = 0; i < minLen; i++) {
      if (!deepEqual(oldArr[i], newArr[i])) {
        const currentPath = `${basePath}/${i}`;
        if (
          recursiveDiffFn &&
          typeof oldArr[i] === 'object' &&
          oldArr[i] !== null &&
          typeof newArr[i] === 'object' &&
          newArr[i] !== null &&
          !Array.isArray(oldArr[i]) &&
          !Array.isArray(newArr[i])
        ) {
          patch.push(...recursiveDiffFn(oldArr[i], newArr[i], currentPath));
        } else {
          patch.push({
            op: 'replace',
            path: currentPath,
            value: newArr[i],
          });
        }
      }
    }

    for (let i = minLen; i < newLen; i++) {
      patch.push({
        op: 'add',
        path: `${basePath}/${i}`,
        value: newArr[i],
      });
    }

    for (let i = oldLen - 1; i >= minLen; i--) {
      patch.push({
        op: 'remove',
        path: `${basePath}/${i}`,
      });
    }
  }
  return patch;
}
