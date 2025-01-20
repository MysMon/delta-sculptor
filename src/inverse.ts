import { optimizeArrayOperations } from './array-utils';
import { PatchError, PatchErrorCode } from './errors';
import { applyOperation, PatchOptions } from './patch';
import { JsonPatch, JsonPatchOperation, Patchable } from './types';
import { getValueByPointer } from './utils';
import { deepClone, validatePatch, validateJsonPointer } from './validate';

/**
 * Map of operation types to their inverse operations
 */
const INVERSE_OPS = {
  add: 'remove',
  remove: 'add',
  replace: 'replace',
  move: 'move',
  copy: null, // copy operation doesn't need to be reversed
  test: null, // test operation doesn't need to be reversed
} as const;

export interface InversePatchOptions extends PatchOptions {
  /**
   * Whether to validate the inverse patch before returning
   */
  validateInverse?: boolean;

  /**
   * Whether to optimize array operations by combining sequential operations
   */
  batchArrayOps?: boolean;

  /**
   * Maximum size of batched array operations
   */
  maxBatchSize?: number;
}

const defaultOptions: Required<InversePatchOptions> = {
  validate: true,
  checkCircular: true,
  maxDepth: 100,
  validateInverse: true,
  batchArrayOps: true,
  maxBatchSize: Infinity,
};

/**
 * Validates a patch operation and its path
 */
function validateOperation(op: JsonPatchOperation): void {
  if (!op.op || !(op.op in INVERSE_OPS)) {
    throw new PatchError(
      PatchErrorCode.INVALID_OPERATION,
      `Invalid operation type: ${op.op}`
    );
  }

  if (!op.path) {
    throw new PatchError(
      PatchErrorCode.MISSING_REQUIRED_FIELD,
      'Path is required'
    );
  }

  validateJsonPointer(op.path);

  if (op.op === 'move' && !op.from) {
    throw new PatchError(
      PatchErrorCode.MISSING_REQUIRED_FIELD,
      'Move operation requires "from" field'
    );
  }
}

/**
 * Creates an inverse patch that will undo the effects of the original patch
 */
export function createInversePatch<T extends Patchable>(
  originalObj: T,
  patch: JsonPatch,
  options: InversePatchOptions = {}
): JsonPatch {
  const opts = { ...defaultOptions, ...options };

  if (opts.validate) {
    validatePatch(patch);
  }

  const tempObj = deepClone(originalObj);
  let inversePatch: JsonPatch = [];

  // Create inverse operations in reverse order
  for (let i = patch.length - 1; i >= 0; i--) {
    const op = patch[i];
    validateOperation(op);

    const inversedOp = createInverseOperation(tempObj, op);
    if (inversedOp) {
      inversePatch.push(inversedOp);
    }

    try {
      applyOperation(tempObj, op, opts);
    } catch (error) {
      // If operation fails, we don't need to rollback since we're working on a clone
      throw new PatchError(
        PatchErrorCode.INVALID_OPERATION,
        `Failed to apply operation: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  // Optimize the inverse patch if needed
  if (opts.batchArrayOps) {
    inversePatch = optimizeArrayOperations(inversePatch);
  }

  if (opts.validateInverse) {
    validatePatch(inversePatch);
  }

  return inversePatch;
}

/**
 * Safely retrieves a value from an object using a JSON pointer.
 * Throws a detailed error if the path is invalid or value doesn't exist.
 */
function safeGetValue<T extends Patchable>(obj: T, path: string): any {
  try {
    const value = getValueByPointer(obj, path);
    if (value === undefined) {
      throw new PatchError(
        PatchErrorCode.INVALID_POINTER,
        `No value exists at path: ${path}`
      );
    }
    return value;
  } catch (error) {
    throw new PatchError(
      PatchErrorCode.INVALID_POINTER,
      error instanceof Error ? error.message : `Invalid path: ${path}`
    );
  }
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
  patch: JsonPatch,
  options: InversePatchOptions = {}
): JsonPatch {
  const opts = { ...defaultOptions, ...options };

  if (opts.validate) {
    validatePatch(patch);
  }

  const inverse = createInversePatch(target, patch, opts);
  const tempTarget = deepClone(target);

  try {
    // Apply the original patch
    for (const op of patch) {
      applyOperation(tempTarget, op, opts);
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
