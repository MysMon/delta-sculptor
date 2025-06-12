import { PatchError } from './errors';
import { applyOperation } from './patch';
import { JsonPatch, BatchRemoveOperation } from './types';
import { getValueByPointer } from './utils';
import { deepClone } from './validate';

/**
 * Normalizes array paths by converting '-' to the actual index
 */
function normalizeArrayPath(target: any, path: string): string {
  const segments = path.split('/');
  if (segments[segments.length - 1] === '-') {
    const parent = segments.slice(0, -1).reduce((obj, segment, i) => {
      return i === 0 ? obj : obj[segment];
    }, target);
    if (Array.isArray(parent)) {
      segments[segments.length - 1] = String(parent.length);
    }
  }
  return segments.join('/');
}

export interface InverseOptions {
  batchArrayOps?: boolean;
  validate?: boolean;
  checkCircular?: boolean;
  maxDepth?: number;
}

const defaultOptions: Required<InverseOptions> = {
  batchArrayOps: true,
  validate: true,
  checkCircular: true,
  maxDepth: 100,
};

/**
 * Generates the inverse operation for a single patch operation
 */
function generateInverseOperation(
  currentState: any,
  operation: any,
  batchArrayOps: boolean
): any {
  switch (operation.op) {
    case 'add': {
      const normalizedPath = normalizeArrayPath(currentState, operation.path);

      // Handle batch array operations
      if (Array.isArray(operation.value)) {
        if (batchArrayOps) {
          return {
            op: 'remove',
            path: normalizedPath,
            count: operation.value.length,
          };
        } else {
          // Generate individual remove operations for each added element
          const removes = [];
          for (let i = operation.value.length - 1; i >= 0; i--) {
            removes.push({
              op: 'remove',
              path: normalizedPath,
            });
          }
          return removes;
        }
      } else {
        return { op: 'remove', path: normalizedPath };
      }
    }
    case 'remove': {
      const normalizedPath = normalizeArrayPath(currentState, operation.path);
      const pathSegments = normalizedPath.split('/');
      const parentPath =
        pathSegments.length > 1 ? pathSegments.slice(0, -1).join('/') : '';
      const parent =
        parentPath === ''
          ? currentState
          : getValueByPointer(currentState, parentPath);

      if (Array.isArray(parent)) {
        const index = parseInt(pathSegments[pathSegments.length - 1], 10);
        const count = (operation as BatchRemoveOperation).count || 1;
        const values = parent.slice(index, index + count);

        if (batchArrayOps && count > 1) {
          return {
            op: 'add',
            path: normalizedPath,
            value: values,
          };
        } else if (count === 1) {
          return {
            op: 'add',
            path: normalizedPath,
            value: values[0],
          };
        } else {
          // Generate individual add operations for each removed element
          // Reverse order to account for insertion behavior
          const adds = [];
          for (let i = values.length - 1; i >= 0; i--) {
            adds.push({
              op: 'add',
              path: normalizedPath,
              value: values[i],
            });
          }
          return adds;
        }
      } else {
        const value = getValueByPointer(currentState, normalizedPath);
        if (value === undefined) {
          throw PatchError.pathNotFound(normalizedPath);
        }
        return { op: 'add', path: normalizedPath, value: deepClone(value) };
      }
    }
    case 'replace': {
      const normalizedPath = normalizeArrayPath(currentState, operation.path);
      const value = getValueByPointer(currentState, normalizedPath);
      if (value === undefined) {
        throw PatchError.pathNotFound(normalizedPath);
      }
      return { op: 'replace', path: normalizedPath, value: deepClone(value) };
    }
    case 'move': {
      if (!operation.from) {
        throw PatchError.missingField('move', 'from');
      }
      const fromPath = normalizeArrayPath(currentState, operation.from);
      const toPath = normalizeArrayPath(currentState, operation.path);
      return { op: 'move', path: fromPath, from: toPath };
    }
    case 'copy':
    case 'test':
      return null; // No inverse needed
    default:
      throw PatchError.invalidOperation(String(operation.op));
  }
}

/**
 * Creates an inverse patch that will undo the effects of the original patch
 */
export function createInversePatch(
  originalState: any,
  patch: JsonPatch,
  options: InverseOptions = {}
): JsonPatch {
  const inverse: JsonPatch = [];
  const { batchArrayOps = true } = options;

  // Apply patch to get the final state, while capturing inverse operations
  const workingState = deepClone(originalState);

  // Process patches in forward order, generating inverse operations as we go
  for (let i = 0; i < patch.length; i++) {
    const operation = patch[i];

    // Generate inverse operation before applying the forward operation
    const inverseOp = generateInverseOperation(
      workingState,
      operation,
      batchArrayOps
    );
    if (inverseOp) {
      if (Array.isArray(inverseOp)) {
        // Insert multiple operations at the beginning
        inverse.unshift(...inverseOp);
      } else {
        // Insert single operation at the beginning
        inverse.unshift(inverseOp);
      }
    }

    // Apply the forward operation to the working state
    applyOperation(workingState, operation, { validate: false });
  }

  // Apply array operation optimizations if enabled
  if (batchArrayOps) {
    optimizeArrayOperations(inverse);
  }

  return inverse;
}

/**
 * 配列操作を最適化する
 */
function optimizeArrayOperations(patch: JsonPatch): void {
  // 連続する配列操作をマージ
  for (let i = patch.length - 1; i > 0; i--) {
    const current = patch[i];
    const prev = patch[i - 1];

    if (
      current.op === 'add' &&
      prev.op === 'add' &&
      current.path === prev.path &&
      Array.isArray(current.value) &&
      Array.isArray(prev.value)
    ) {
      // 連続するadd操作をマージ
      prev.value = [...prev.value, ...current.value];
      patch.splice(i, 1);
    } else if (
      current.op === 'remove' &&
      prev.op === 'remove' &&
      current.path === prev.path
    ) {
      // 連続するremove操作をマージ
      const currentCount = (current as BatchRemoveOperation).count || 1;
      const prevCount = (prev as BatchRemoveOperation).count || 1;
      (prev as BatchRemoveOperation).count = prevCount + currentCount;
      patch.splice(i, 1);
    } else if (
      current.op === 'add' &&
      prev.op === 'add' &&
      current.path.slice(0, current.path.lastIndexOf('/')) ===
        prev.path.slice(0, prev.path.lastIndexOf('/'))
    ) {
      // 同じ配列への連続するadd操作を個別の操作として保持
      const currentIndex = parseInt(
        current.path.slice(current.path.lastIndexOf('/') + 1),
        10
      );
      const prevIndex = parseInt(
        prev.path.slice(prev.path.lastIndexOf('/') + 1),
        10
      );
      if (currentIndex === prevIndex + 1) {
        // インデックスが連続している場合はマージ
        if (Array.isArray(prev.value)) {
          prev.value = [...prev.value, current.value];
        } else {
          prev.value = [prev.value, current.value];
        }
        patch.splice(i, 1);
      }
    }
  }
}

/**
 * Applies a patch and returns its inverse patch
 */
export function applyPatchWithInverse(
  target: any,
  patch: JsonPatch,
  options: InverseOptions = {}
): JsonPatch {
  const opts = { ...defaultOptions, ...options };
  const original = deepClone(target);
  const inversePatch = createInversePatch(original, patch, opts);

  try {
    for (const op of patch) {
      applyOperation(target, op, opts);
    }
  } catch (error) {
    // エラーが発生した場合は、元の状態に戻す
    Object.assign(target, original);
    throw error;
  }

  return inversePatch;
}
