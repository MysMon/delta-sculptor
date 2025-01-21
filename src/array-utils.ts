import { PatchError, PatchErrorCode } from './errors';
import { JsonPatch, BatchRemoveOperation, BatchAddOperation } from './types';

export interface ArrayOperation {
  type: 'add' | 'remove' | 'move';
  index: number;
  fromIndex?: number;
  value?: any;
}

/**
 * Converts array operations to JSON Patch format
 */
interface ToJsonPatchParams {
  basePath?: string;
}

export function toJsonPatch(
  operations: ArrayOperation[],
  params: ToJsonPatchParams = {}
): JsonPatch {
  const { basePath = '' } = params;
  return operations.map(op => {
    switch (op.type) {
      case 'move':
        return {
          op: 'move',
          path: `${basePath}/${op.index}`,
          from: `${basePath}/${op.fromIndex}`,
        };
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
    }
  });
}

/**
 * Validates array indices in patch operations
 */
export function validateArrayIndex(array: any[], path: string): number {
  const match = /^\/(-|\d+)$/.exec(path);
  if (!match) {
    throw new PatchError(
      PatchErrorCode.ARRAY_INDEX_ERROR,
      'Invalid array index pointer'
    );
  }

  const index = match[1] === '-' ? array.length : parseInt(match[1], 10);

  if (index < 0) {
    throw new PatchError(
      PatchErrorCode.ARRAY_INDEX_ERROR,
      'Array index cannot be negative'
    );
  }

  if (match[1] !== '-' && index >= array.length) {
    throw new PatchError(
      PatchErrorCode.ARRAY_INDEX_ERROR,
      'Array index out of bounds'
    );
  }

  return index;
}

/**
 * Generates array operations that transform source array into target array
 */
function handleRemaining(
  operations: ArrayOperation[],
  source: any[],
  target: any[],
  targetIndex: number
): { sourceIndex: number; targetIndex: number } {
  if (targetIndex < target.length) {
    // Add remaining target elements
    operations.push({
      type: 'add',
      index: targetIndex,
      value: target[targetIndex],
    });
    return { sourceIndex: source.length, targetIndex: targetIndex + 1 };
  } else {
    // Remove remaining source elements
    const lastSourceIndex = source.length - 1;
    if (lastSourceIndex >= 0) {
      operations.push({
        type: 'remove',
        index: lastSourceIndex,
        value: source[lastSourceIndex],
      });
    }
    return { sourceIndex: source.length, targetIndex };
  }
}

function handleMoveOperation(
  operations: ArrayOperation[],
  source: any[],
  target: any[],
  sourceIndex: number,
  targetIndex: number,
  targetInSource: number
): { sourceIndex: number; targetIndex: number } {
  operations.push({
    type: 'move',
    index: targetIndex,
    fromIndex: targetInSource,
    value: target[targetIndex],
  });
  source.splice(targetInSource, 1);
  return { sourceIndex: targetInSource, targetIndex: targetIndex + 1 };
}

function handleSimpleAddRemove(
  operations: ArrayOperation[],
  source: any[],
  target: any[],
  sourceIndex: number,
  targetIndex: number
): { sourceIndex: number; targetIndex: number } {
  operations.push({
    type: 'remove',
    index: sourceIndex,
    value: source[sourceIndex],
  });
  operations.push({
    type: 'add',
    index: targetIndex,
    value: target[targetIndex],
  });
  return { sourceIndex: sourceIndex + 1, targetIndex: targetIndex + 1 };
}

function handleMatchedElements(
  sourceIndex: number,
  targetIndex: number
): { sourceIndex: number; targetIndex: number } {
  return {
    sourceIndex: sourceIndex + 1,
    targetIndex: targetIndex + 1,
  };
}

function findTargetInSource(
  source: any[],
  target: any,
  startIndex: number
): number {
  return source.indexOf(target, startIndex + 1);
}

function handleElement(
  operations: ArrayOperation[],
  source: any[],
  target: any[],
  sourceIndex: number,
  targetIndex: number
): { sourceIndex: number; targetIndex: number } {
  const targetInSource = findTargetInSource(
    source,
    target[targetIndex],
    sourceIndex
  );

  if (targetInSource >= 0) {
    return handleMoveOperation(
      operations,
      source,
      target,
      sourceIndex,
      targetIndex,
      targetInSource
    );
  }

  return handleSimpleAddRemove(
    operations,
    source,
    target,
    sourceIndex,
    targetIndex
  );
}

export function generateArrayOperations(
  source: any[],
  target: any[]
): ArrayOperation[] {
  const operations: ArrayOperation[] = [];
  let sourceIndex = 0;
  let targetIndex = 0;

  while (sourceIndex < source.length || targetIndex < target.length) {
    if (sourceIndex >= source.length || targetIndex >= target.length) {
      const result = handleRemaining(operations, source, target, targetIndex);
      sourceIndex = result.sourceIndex;
      targetIndex = result.targetIndex;
      continue;
    }

    if (source[sourceIndex] === target[targetIndex]) {
      const result = handleMatchedElements(sourceIndex, targetIndex);
      sourceIndex = result.sourceIndex;
      targetIndex = result.targetIndex;
      continue;
    }

    const result = handleElement(
      operations,
      source,
      target,
      sourceIndex,
      targetIndex
    );
    sourceIndex = result.sourceIndex;
    targetIndex = result.targetIndex;
  }

  return operations;
}

/**
 * Converts JSON Patch to array operations format
 */
function fromJsonPatch(patch: JsonPatch): ArrayOperation[] {
  return patch
    .map(op => {
      const path = getArrayPath(op.path);
      if (!path) return null;

      const index = parseInt(path.index, 10);
      if (isNaN(index)) return null;

      let fromPath;
      let fromIndex;

      switch (op.op) {
        case 'move':
          fromPath = getArrayPath(op.from!);
          if (!fromPath) return null;
          fromIndex = parseInt(fromPath.index, 10);
          if (isNaN(fromIndex)) return null;
          return {
            type: 'move',
            index,
            fromIndex,
            value: undefined,
          };
        case 'add':
          return {
            type: 'add',
            index,
            value: op.value,
          };
        case 'remove':
          return {
            type: 'remove',
            index,
          };
        default:
          return null;
      }
    })
    .filter((op): op is ArrayOperation => op !== null);
}

/**
 * Optimizes array operations by detecting moves and combining operations
 */
export function optimizeArrayOperations(
  operations: ArrayOperation[]
): ArrayOperation[] {
  const optimized: ArrayOperation[] = [];
  let i = 0;

  while (i < operations.length) {
    const current = operations[i];

    if (
      current.type === 'remove' &&
      i + 1 < operations.length &&
      operations[i + 1].type === 'add' &&
      current.value === operations[i + 1].value
    ) {
      // Convert remove+add into move
      optimized.push({
        type: 'move',
        index: operations[i + 1].index,
        fromIndex: current.index,
        value: current.value,
      });
      i += 2;
    } else {
      optimized.push(current);
      i++;
    }
  }

  return optimized;
}

/**
 * Optimizes JSON Patch operations by detecting moves
 */
export function optimizeJsonPatch(patch: JsonPatch): JsonPatch {
  const arrayOps = fromJsonPatch(patch);
  const optimizedOps = optimizeArrayOperations(arrayOps);
  return toJsonPatch(optimizedOps, { basePath: '' });
}

/**
 * Batches array operations into JsonPatch operations
 */
export function batchArrayOperations(
  operations: ArrayOperation[],
  maxBatchSize = Infinity
): JsonPatch {
  const patch: JsonPatch = [];
  let currentBatch: ArrayOperation[] = [];
  let lastType: string | null = null;
  let lastIndex: number | null = null;

  function flushBatch(): void {
    if (currentBatch.length === 0) return;

    if (currentBatch.length === 1) {
      const op = currentBatch[0];
      patch.push(...toJsonPatch([op], { basePath: '' }));
    } else if (lastType === 'remove') {
      // Batch sequential removes
      // For batch removes, create a BatchRemoveOperation
      patch.push({
        op: 'remove',
        path: `/${currentBatch[0].index}`,
        count: currentBatch.length,
      } satisfies BatchRemoveOperation);
    } else if (lastType === 'add') {
      // Batch sequential adds
      // For batch adds, create a BatchAddOperation
      patch.push({
        op: 'add',
        path: `/${currentBatch[0].index}`,
        value: currentBatch.map(op => op.value),
      } satisfies BatchAddOperation);
    }

    currentBatch = [];
    lastType = null;
    lastIndex = null;
  }

  for (const op of operations) {
    if (
      op.type === lastType &&
      currentBatch.length < maxBatchSize &&
      ((op.type === 'remove' && op.index === lastIndex! - 1) ||
        (op.type === 'add' && op.index === lastIndex! + 1))
    ) {
      currentBatch.push(op);
    } else {
      flushBatch();
      currentBatch = [op];
      lastType = op.type;
      lastIndex = op.index;
    }
  }

  flushBatch();
  return patch;
}

/**
 * Gets array path information from a JSON Pointer path
 */
export function getArrayPath(
  path: string
): { basePath: string; index: string } | null {
  const match = /^(.*?)\/(-|\d+)$/.exec(path);
  if (!match) return null;

  return {
    basePath: match[1],
    index: match[2],
  };
}

/**
 * Gets the base path for an array and its index
 */
export function getArrayBasePath(path: string): string {
  const lastSlash = path.lastIndexOf('/');
  return lastSlash >= 0 ? path.slice(0, lastSlash) : '';
}

/**
 * Checks if a path refers to an array element
 */
export function isArrayPath(path: string): boolean {
  const lastSegment = path.split('/').pop();
  return lastSegment === '-' || /^\d+$/.test(lastSegment ?? '');
}

/**
 * Splits batched array operations into individual operations
 */
export function expandArrayOperations(patch: JsonPatch): JsonPatch {
  const expanded: JsonPatch = [];

  for (const op of patch) {
    if (op.op === 'remove' && 'count' in op && typeof op.count === 'number') {
      // Expand batch remove into individual removes
      const arrayPath = getArrayPath(op.path);
      if (!arrayPath) {
        expanded.push(op);
        continue;
      }

      const { basePath, index } = arrayPath;
      const startIndex = parseInt(index, 10);

      for (let i = 0; i < op.count; i++) {
        expanded.push({
          op: 'remove',
          path: `${basePath}/${startIndex}`,
        });
      }
    } else if (op.op === 'add' && 'value' in op && Array.isArray(op.value)) {
      // Expand batch add into individual adds
      const arrayPath = getArrayPath(op.path);
      if (!arrayPath) {
        expanded.push(op);
        continue;
      }

      const { basePath, index } = arrayPath;
      const startIndex =
        index === '-'
          ? Infinity // Will be converted to actual index when applying
          : parseInt(index, 10);

      op.value.forEach((value, i) => {
        expanded.push({
          op: 'add',
          path: `${basePath}/${startIndex + i}`,
          value,
        });
      });
    } else {
      expanded.push(op);
    }
  }

  return expanded;
}
