import { PatchError, PatchErrorCode } from './errors';
import { JsonPatch, JsonPatchOperation } from './types';
import {
  getValueByPointer,
  setValueByPointer,
  removeValueByPointer,
} from './utils';
import {
  validatePatch,
  validateJsonPointer,
  deepEqual,
  deepClone,
  detectCircular,
} from './validate';

export interface PatchOptions {
  /**
   * Validate the patch before applying
   * @default true
   */
  validate?: boolean;

  /**
   * Check for circular references
   * @default true
   */
  checkCircular?: boolean;

  /**
   * Maximum depth for recursive operations
   * @default 100
   */
  maxDepth?: number;
}

const defaultOptions: Required<PatchOptions> = {
  validate: true,
  checkCircular: true,
  maxDepth: 100,
};

function handleAddOperation(target: any, path: string, value: any): void {
  setValueByPointer(target, path, value);
}

function handleRemoveOperation(target: any, path: string): void {
  removeValueByPointer(target, path);
}

function handleReplaceOperation(target: any, path: string, value: any): void {
  const oldValue = removeValueByPointer(target, path);
  if (oldValue === undefined) {
    throw PatchError.invalidPointer(path);
  }
  setValueByPointer(target, path, value);
}

function handleMoveOperation(target: any, path: string, from: string): void {
  if (!from) {
    throw PatchError.missingField('move', 'from');
  }
  validateJsonPointer(from);

  // Ensure 'from' path is not a prefix of 'path'
  if (path.startsWith(from + '/')) {
    throw new PatchError(
      PatchErrorCode.INVALID_OPERATION,
      `'move' operation: 'from' path cannot be a prefix of 'path'`
    );
  }

  const valueToMove = getValueByPointer(target, from);
  if (valueToMove === undefined) {
    throw PatchError.invalidPointer(from);
  }
  removeValueByPointer(target, from);
  setValueByPointer(target, path, valueToMove);
}

function handleCopyOperation(target: any, path: string, from: string): void {
  if (!from) {
    throw PatchError.missingField('copy', 'from');
  }
  validateJsonPointer(from);
  const val = getValueByPointer(target, from);
  if (val === undefined) {
    throw PatchError.invalidPointer(from);
  }
  setValueByPointer(target, path, deepClone(val));
}

function handleTestOperation(target: any, path: string, value: any): void {
  const currentVal = getValueByPointer(target, path);
  if (currentVal === undefined) {
    throw PatchError.invalidPointer(path);
  }
  if (!deepEqual(currentVal, value, new WeakMap())) {
    throw PatchError.testFailed(path, value, currentVal);
  }
}

/**
 * Applies a single operation to the target object
 */
export function applyOperation(
  target: any,
  op: JsonPatchOperation,
  options: PatchOptions = {}
): void {
  const opts = { ...defaultOptions, ...options };
  const { op: operation, path, from, value } = op;

  // Validate path
  validateJsonPointer(path);

  // Check for circular references
  if (opts.checkCircular && value !== undefined && detectCircular(value)) {
    throw PatchError.circularReference(path);
  }

  switch (operation) {
    case 'add':
      handleAddOperation(target, path, value);
      break;

    case 'remove':
      handleRemoveOperation(target, path);
      break;

    case 'replace':
      handleReplaceOperation(target, path, value);
      break;

    case 'move':
      handleMoveOperation(target, path, from as string);
      break;

    case 'copy':
      handleCopyOperation(target, path, from as string);
      break;

    case 'test':
      handleTestOperation(target, path, value);
      break;

    default:
      throw PatchError.invalidOperation(operation);
  }
}

/**
 * Applies multiple operations sequentially
 */
export function applyPatch(
  target: any,
  patch: JsonPatch,
  options: PatchOptions = {}
): void {
  const opts = { ...defaultOptions, ...options };

  if (opts.validate) {
    validatePatch(patch);
  }

  for (const op of patch) {
    applyOperation(target, op, opts);
  }
}

/**
 * Applies patch immutably, returning a new object
 */
export function applyPatchImmutable<T>(
  target: T,
  patch: JsonPatch,
  options: PatchOptions = {}
): T {
  const clone = deepClone(target);
  applyPatch(clone, patch, options);
  return clone;
}

/**
 * Applies patch with automatic rollback on failure
 */
export function applyPatchWithRollback<T extends object>(
  target: T,
  patch: JsonPatch,
  options: PatchOptions = {}
): void {
  const backup = deepClone(target);
  try {
    applyPatch(target, patch, options);
  } catch (error: unknown) {
    // Clean target
    Object.keys(target).forEach(k => delete (target as any)[k]);
    // Restore from backup
    Object.assign(target, backup);
    // Rethrow with context
    if (error instanceof PatchError) {
      throw error;
    }
    throw new PatchError(
      PatchErrorCode.INTERNAL_ERROR,
      `Patch application failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
