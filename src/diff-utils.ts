import {
  generateArrayOperations,
  batchArrayOperations,
  toJsonPatch,
  optimizeJsonPatch,
} from './array-utils';
import { PatchError } from './errors';
import type { JsonPatch } from './types';
import { detectCircular, deepEqual } from './validate';

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

  // シンプルな変更の場合はdiffArraySimpleを使用
  const isSimpleChange =
    oldArr.length === newArr.length &&
    oldArr.length <= 3 &&
    oldArr.filter((v, i) => !deepEqual(v, newArr[i])).length === 1;

  if (isSimpleChange) {
    return diffArraySimple(oldArr, newArr, { basePath });
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

  // Handle common length - 共通部分の処理
  for (let i = 0; i < minLen; i++) {
    if (!deepEqual(oldArr[i], newArr[i])) {
      if (
        typeof oldArr[i] === 'object' &&
        oldArr[i] !== null &&
        typeof newArr[i] === 'object' &&
        newArr[i] !== null
      ) {
        // For nested objects/arrays, generate nested patches
        patch.push({
          op: 'replace',
          path: `${basePath}/${i}`,
          value: newArr[i],
        });
      } else {
        patch.push({
          op: 'replace',
          path: `${basePath}/${i}`,
          value: newArr[i],
        });
      }
    }
  }

  // Handle added elements - 追加要素の処理
  for (let i = minLen; i < newArr.length; i++) {
    patch.push({
      op: 'add',
      path: `${basePath}/${i}`,
      value: newArr[i],
    });
  }

  // Handle removed elements - 削除要素の処理（後ろから）
  for (let i = oldArr.length - 1; i >= minLen; i--) {
    patch.push({
      op: 'remove',
      path: `${basePath}/${i}`,
    });
  }

  return patch;
}
