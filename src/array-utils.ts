import { PatchError, PatchErrorCode } from './errors';
import { findLCS } from './lcs';
import { JsonPatch, JsonPatchOperation } from './types';
import { deepEqual } from './validate';

interface ArrayOperation {
  type: 'add' | 'remove' | 'move';
  index: number;
  value?: any;
  fromIndex?: number;
}

/**
 * Validates array indices in a JSON Pointer path
 */
export function validateArrayIndex(target: any[], path: string): number {
  // Extract the last segment that should be the array index
  const segments = path.split('/');
  const lastSegment = segments[segments.length - 1];

  if (lastSegment === '') {
    throw new PatchError(
      PatchErrorCode.INVALID_POINTER,
      `Invalid array index in path: ${path}`
    );
  }

  const index = lastSegment === '-' ? target.length : parseInt(lastSegment, 10);
  if (
    isNaN(index) ||
    index < 0 ||
    (lastSegment !== '-' && index > target.length)
  ) {
    throw PatchError.arrayIndexError(path, String(index));
  }

  return index;
}

/**
 * Optimize array operations by detecting moves
 */
export function optimizeArrayOperations(
  operations: ArrayOperation[]
): ArrayOperation[] {
  const optimized: ArrayOperation[] = [];
  const removes = new Map<any, number>();

  // First pass: collect remove operations
  operations.forEach((op, index) => {
    if (op.type === 'remove' && op.value !== undefined) {
      removes.set(op.value, index);
    }
  });

  // Second pass: convert remove+add into moves where possible
  operations.forEach(op => {
    if (op.type === 'add' && removes.has(op.value)) {
      const removeIndex = removes.get(op.value)!;
      optimized.push({
        type: 'move',
        index: op.index,
        fromIndex: operations[removeIndex].index,
      });
      removes.delete(op.value);
    } else if (op.type === 'remove' && !removes.has(op.value)) {
      optimized.push(op);
    } else if (op.type !== 'remove') {
      optimized.push(op);
    }
  });

  return optimized;
}

/**
 * Batch sequential array operations for better performance
 */
export function batchArrayOperations(
  operations: ArrayOperation[],
  maxBatchSize: number = 100
): JsonPatch {
  const patch: JsonPatch = [];
  let currentBatch: ArrayOperation[] | null = null;

  operations.forEach(op => {
    if (!currentBatch || currentBatch[0].type !== op.type) {
      if (currentBatch) {
        patch.push(createBatchOperation(currentBatch));
      }
      currentBatch = [op];
    } else if (
      currentBatch.length < maxBatchSize &&
      isSequentialOperation(currentBatch[currentBatch.length - 1], op)
    ) {
      currentBatch.push(op);
    } else {
      patch.push(createBatchOperation(currentBatch));
      currentBatch = [op];
    }
  });

  if (currentBatch) {
    patch.push(createBatchOperation(currentBatch));
  }

  return patch;
}

function isSequentialOperation(
  prev: ArrayOperation,
  curr: ArrayOperation
): boolean {
  if (prev.type !== curr.type) return false;

  if (prev.type === 'add') {
    return curr.index === prev.index + 1;
  }

  if (prev.type === 'remove') {
    return curr.index === prev.index - 1;
  }

  return false;
}

function createBatchOperation(batch: ArrayOperation[]): JsonPatchOperation {
  const first = batch[0];
  const last = batch[batch.length - 1];

  switch (first.type) {
    case 'add': {
      // For single adds, just use the direct value
      if (batch.length === 1) {
        return {
          op: 'add',
          path: `/${first.index}`,
          value: first.value,
        };
      }
      // For sequential adds, check if they're truly sequential
      const allSequential = batch.every(
        (op, i) => i === 0 || op.index === batch[i - 1].index + 1
      );
      if (allSequential) {
        return {
          op: 'add',
          path: `/${first.index}`,
          value: batch.map(op => op.value),
        };
      }
      // If not sequential, keep as individual operations
      return {
        op: 'add',
        path: `/${first.index}`,
        value: first.value,
      };
    }

    case 'remove': {
      const sequential =
        batch.length === 1 ||
        (batch.length > 1 &&
          last.index === first.index - (batch.length - 1) &&
          batch.every(
            (op, i) => i === 0 || op.index === batch[i - 1].index - 1
          ));

      if (sequential) {
        return {
          op: 'remove',
          path: `/${last.index}`,
          count: batch.length,
        };
      }
      return {
        op: 'remove',
        path: `/${first.index}`,
      };
    }

    case 'move':
      return {
        op: 'move',
        path: `/${first.index}`,
        from: `/${first.fromIndex}`,
      };

    default:
      throw new PatchError(
        PatchErrorCode.INVALID_OPERATION,
        `Invalid batch operation type: ${(first as any).type}`
      );
  }
}

function buildValuePositions(arr: any[]): Map<any, number[]> {
  const positions = new Map<any, number[]>();
  for (let i = 0; i < arr.length; i++) {
    const value = arr[i];
    const valuePositions = positions.get(value) || [];
    valuePositions.push(i);
    positions.set(value, valuePositions);
  }
  return positions;
}

function removeValuePosition(
  positions: Map<any, number[]>,
  value: any,
  index: number
): void {
  const valuePositions = positions.get(value) || [];
  const posIndex = valuePositions.indexOf(index);
  if (posIndex !== -1) {
    valuePositions.splice(posIndex, 1);
    if (valuePositions.length === 0) {
      positions.delete(value);
    }
  }
}

function handleMove(
  operations: ArrayOperation[],
  positions: Map<any, number[]>,
  value: any,
  newIndex: number,
  bestMovePos: number
): void {
  operations.push({
    type: 'move',
    index: newIndex,
    fromIndex: bestMovePos,
  });
  removeValuePosition(positions, value, bestMovePos);
}

function handleReplace(
  operations: ArrayOperation[],
  positions: Map<any, number[]>,
  oldValue: any,
  newValue: any,
  oldIndex: number,
  newIndex: number
): void {
  operations.push({
    type: 'remove',
    index: oldIndex,
    value: oldValue,
  });
  operations.push({
    type: 'add',
    index: newIndex,
    value: newValue,
  });
  removeValuePosition(positions, oldValue, oldIndex - 1);
}

/**
 * Generate array operations using LCS for optimal diff
 */
export function generateArrayOperations(
  oldArr: any[],
  newArr: any[]
): ArrayOperation[] {
  const lcsIndices = findLCS(oldArr, newArr);
  const operations: ArrayOperation[] = [];
  const oldValuePositions = buildValuePositions(oldArr);

  let oldIndex = 0;
  let newIndex = 0;
  let lcsPos = 0;

  while (newIndex < newArr.length || oldIndex < oldArr.length) {
    // Case 1: Common element in LCS
    if (lcsPos < lcsIndices.length && oldIndex === lcsIndices[lcsPos]) {
      oldIndex++;
      newIndex++;
      lcsPos++;
      continue;
    }

    // Case 2: Processing new array elements
    if (newIndex < newArr.length) {
      const value = newArr[newIndex];
      const positions = oldValuePositions.get(value) || [];
      const bestMovePos = positions.find(pos => pos > oldIndex);

      if (bestMovePos !== undefined) {
        handleMove(operations, oldValuePositions, value, newIndex, bestMovePos);
        newIndex++;
      } else if (oldIndex < oldArr.length) {
        const oldValue = oldArr[oldIndex];
        if (deepEqual(oldValue, value, new WeakMap())) {
          oldIndex++;
          newIndex++;
        } else {
          handleReplace(
            operations,
            oldValuePositions,
            oldValue,
            value,
            oldIndex,
            newIndex
          );
          oldIndex++;
          newIndex++;
        }
      } else {
        operations.push({
          type: 'add',
          index: newIndex,
          value,
        });
        newIndex++;
      }
      continue;
    }

    // Case 3: Remove remaining old elements
    const value = oldArr[oldIndex];
    operations.push({
      type: 'remove',
      index: oldIndex,
      value,
    });
    removeValuePosition(oldValuePositions, value, oldIndex);
    oldIndex++;
  }

  return operations;
}
