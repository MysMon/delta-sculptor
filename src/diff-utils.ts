import {
  generateArrayOperations,
  optimizeArrayOperations,
  batchArrayOperations,
} from './array-utils';
import { PatchError, PatchErrorCode } from './errors';
import { JsonPatch } from './types';
import { detectCircular } from './validate';

/**
 * Generate a diff for arrays using LCS for optimal move detection
 */
export function diffArrayWithLCS(
  oldArr: any[],
  newArr: any[],
  basePath: string,
  options: {
    checkCircular?: boolean;
    maxBatchSize?: number;
    batchArrayOps?: boolean;
  } = {}
): JsonPatch {
  const {
    checkCircular = true,
    maxBatchSize = 100,
    batchArrayOps = false,
  } = options;

  // Check for circular references in new array
  if (checkCircular && detectCircular(newArr)) {
    throw PatchError.circularReference(basePath);
  }

  // Generate base operations
  let operations = generateArrayOperations(oldArr, newArr);

  // Optimize by converting appropriate remove+add pairs into moves
  operations = optimizeArrayOperations(operations);

  // Convert operations to JSON Patch format
  if (batchArrayOps) {
    return batchArrayOperations(operations, maxBatchSize).map(op => ({
      ...op,
      path: basePath + op.path,
      ...(op.from ? { from: basePath + op.from } : {}),
    }));
  }

  // Convert individual operations to JSON Patch format
  return operations.map(op => {
    switch (op.type) {
      case 'add':
        return {
          op: 'add',
          path: `${basePath}/${op.index}`,
          value: op.value,
        };
      case 'remove':
        return {
          op: 'remove',
          path: `${basePath}/${op.index}`,
        };
      case 'move':
        if (typeof op.fromIndex !== 'number') {
          throw new PatchError(
            PatchErrorCode.INTERNAL_ERROR,
            'Move operation missing fromIndex'
          );
        }
        return {
          op: 'move',
          path: `${basePath}/${op.index}`,
          from: `${basePath}/${op.fromIndex}`,
        };
      default:
        throw new PatchError(
          PatchErrorCode.INVALID_OPERATION,
          `Invalid array operation type: ${(op as any).type}`
        );
    }
  });
}

/**
 * Simple array diffing without move detection
 * Used when move detection is disabled
 */
export function diffArraySimple(
  oldArr: any[],
  newArr: any[],
  basePath: string
): JsonPatch {
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
