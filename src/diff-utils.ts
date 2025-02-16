import {
  generateArrayOperations,
  batchArrayOperations,
  toJsonPatch,
  optimizeJsonPatch,
} from './array-utils';
import { PatchError } from './errors';
import type { JsonPatch } from './types';
import { detectCircular } from './validate';

interface DiffArrayOptions {
  checkCircular?: boolean;
  maxBatchSize?: number;
  batchArrayOps?: boolean;
  basePath?: string;
}

/**
 * Generate a diff for arrays using LCS for optimal move detection
 */
export function diffArrayWithLCS(
  oldArr: any[],
  newArr: any[],
  params: DiffArrayOptions = {}
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

  // 基本的な配列変更の場合は単純な操作を使用
  const isSimpleChange =
    oldArr.length === newArr.length &&
    oldArr.length <= 3 &&
    oldArr.filter((v, i) => v !== newArr[i]).length === 1;

  if (isSimpleChange) {
    const patch: JsonPatch = [];
    for (let i = 0; i < oldArr.length; i++) {
      if (oldArr[i] !== newArr[i]) {
        patch.push({
          op: 'remove',
          path: `${basePath}/${i}`,
        });
        patch.push({
          op: 'add',
          path: `${basePath}/${i}`,
          value: newArr[i],
        });
      }
    }
    return patch;
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
  params: { basePath?: string } = {}
): JsonPatch {
  const { basePath = '' } = params;
  const patch: JsonPatch = [];
  const minLen = Math.min(oldArr.length, newArr.length);

  // Handle common length
  for (let i = 0; i < minLen; i++) {
    if (oldArr[i] !== newArr[i]) {
      patch.push({
        op: 'replace',
        path: `${basePath}/${i}`,
        value: newArr[i],
      });
    }
  }

  // Handle added elements
  for (let i = minLen; i < newArr.length; i++) {
    patch.push({
      op: 'add',
      path: `${basePath}/${i}`,
      value: newArr[i],
    });
  }

  // Handle removed elements
  for (let i = newArr.length; i < oldArr.length; i++) {
    patch.push({
      op: 'remove',
      path: `${basePath}/${oldArr.length - 1 - (i - newArr.length)}`,
    });
  }

  return patch;
}
