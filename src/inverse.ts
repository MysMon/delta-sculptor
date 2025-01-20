import { PatchError, PatchErrorCode } from './errors';
import { applyOperation } from './patch';
import { JsonPatch, JsonPatchOperation } from './types';
import { getValueByPointer } from './utils';
import { deepClone } from './validate';

/**
 * Creates an inverse patch that will undo the effects of the original patch
 */
export function createInversePatch(
  originalObj: any,
  patch: JsonPatch
): JsonPatch {
  const inverse: JsonPatch = [];
  const tempObj = deepClone(originalObj);

  // Apply each operation and build inverse patch
  for (const op of patch) {
    try {
      // Get inverse operation before applying the original
      const inversedOp = createInverseOperation(tempObj, op);
      if (inversedOp) {
        inverse.unshift(inversedOp);
      }

      // Apply the original operation to maintain correct state
      applyOperation(tempObj, op);
    } catch (error) {
      // If operation fails, roll back by applying accumulated inverse
      if (inverse.length > 0) {
        const tempOrig = deepClone(originalObj);
        for (let i = inverse.length - 1; i >= 0; i--) {
          applyOperation(tempOrig, inverse[i]);
        }
      }
      throw error;
    }
  }

  return inverse;
}

function safeGetValue(obj: any, path: string): any {
  const value = getValueByPointer(obj, path);
  if (value === undefined) {
    throw new PatchError(
      PatchErrorCode.INVALID_POINTER,
      `Cannot find value at path: ${path}`
    );
  }
  return value;
}

function handleBatchRemoveInverse(
  obj: any,
  path: string,
  count: number
): JsonPatchOperation {
  const values = [];
  const segments = path.split('/');
  const basePath = segments.slice(0, -1).join('/');
  const startIndex = parseInt(segments[segments.length - 1], 10);

  for (let i = 0; i < count; i++) {
    const value = safeGetValue(obj, `${basePath}/${startIndex + i}`);
    values.push(value);
  }

  return {
    op: 'add',
    path: basePath + '/' + startIndex,
    value: values,
  };
}

function handleAddInverse(op: JsonPatchOperation): JsonPatchOperation {
  return Array.isArray(op.value)
    ? {
        op: 'remove',
        path: op.path,
        count: op.value.length,
      }
    : {
        op: 'remove',
        path: op.path,
      };
}

function handleRemoveInverse(
  obj: any,
  op: JsonPatchOperation
): JsonPatchOperation {
  try {
    const count = 'count' in op ? op.count : undefined;
    return typeof count === 'number'
      ? handleBatchRemoveInverse(obj, op.path, count)
      : {
          op: 'add',
          path: op.path,
          value: safeGetValue(obj, op.path),
        };
  } catch (error) {
    if (error instanceof PatchError) {
      throw error;
    }
    throw new PatchError(
      PatchErrorCode.INVALID_POINTER,
      `Invalid path: ${op.path}`
    );
  }
}

function handleReplaceInverse(
  obj: any,
  op: JsonPatchOperation
): JsonPatchOperation {
  try {
    return {
      op: 'replace',
      path: op.path,
      value: safeGetValue(obj, op.path),
    };
  } catch (error) {
    if (error instanceof PatchError) {
      throw error;
    }
    throw new PatchError(
      PatchErrorCode.INVALID_POINTER,
      `Invalid path: ${op.path}`
    );
  }
}

function handleMoveInverse(op: JsonPatchOperation): JsonPatchOperation {
  if (!op.from) {
    throw new PatchError(
      PatchErrorCode.MISSING_REQUIRED_FIELD,
      'Move operation requires "from" field'
    );
  }
  return {
    op: 'move',
    path: op.from,
    from: op.path,
  };
}

/**
 * Creates an inverse operation for a single patch operation
 */
function createInverseOperation(
  obj: any,
  op: JsonPatchOperation
): JsonPatchOperation | null {
  switch (op.op) {
    case 'add':
      return handleAddInverse(op);
    case 'remove':
      return handleRemoveInverse(obj, op);
    case 'replace':
      return handleReplaceInverse(obj, op);
    case 'move':
      return handleMoveInverse(op);
    case 'copy':
    case 'test':
      // These operations don't need to be reversed
      return null;
    default:
      throw new PatchError(
        PatchErrorCode.INVALID_OPERATION,
        `Invalid operation type: ${(op as any).op}`
      );
  }
}

/**
 * Applies a patch and returns its inverse patch
 */
export function applyPatchWithInverse(
  target: any,
  patch: JsonPatch
): JsonPatch {
  const inverse = createInversePatch(target, patch);
  const tempTarget = deepClone(target);

  try {
    // Apply the original patch
    for (const op of patch) {
      applyOperation(tempTarget, op);
    }

    // Copy changes back to original target
    Object.keys(target).forEach(key => delete target[key]);
    Object.assign(target, tempTarget);

    return inverse;
  } catch (error) {
    // Restore original state
    Object.keys(target).forEach(key => delete target[key]);
    Object.assign(target, deepClone(tempTarget));
    throw error;
  }
}
