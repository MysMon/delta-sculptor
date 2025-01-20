import { PatchError, PatchErrorCode } from './errors';
import { JsonPatch, JsonPatchOperation, JsonPointer, Patchable } from './types';
import { parsePointer } from './utils';

/**
 * Type guard for JsonPatchOperation
 */
function isJsonPatchOperation(op: any): op is JsonPatchOperation {
  return (
    op &&
    typeof op === 'object' &&
    'op' in op &&
    typeof op.op === 'string' &&
    ['add', 'remove', 'replace', 'move', 'copy', 'test'].includes(op.op)
  );
}

/**
 * Validates a JSON Pointer according to RFC 6901
 */
export function validateJsonPointer(pointer: JsonPointer): void {
  if (typeof pointer !== 'string') {
    throw new PatchError(
      PatchErrorCode.INVALID_POINTER,
      'Path must be a string'
    );
  }

  if (pointer.length > 0 && !pointer.startsWith('/')) {
    throw new PatchError(
      PatchErrorCode.INVALID_POINTER,
      'Path must start with /'
    );
  }

  try {
    parsePointer(pointer);
  } catch (error) {
    throw new PatchError(
      PatchErrorCode.INVALID_POINTER,
      `Invalid pointer syntax: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Legacy alias for validateJsonPointer
 * @deprecated Use validateJsonPointer instead
 */
export const validatePath = validateJsonPointer;

/**
 * Creates a deep clone of an object, handling circular references
 */
export function deepClone<T>(obj: T, seen = new WeakMap<object, any>()): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (seen.has(obj as object)) {
    throw new PatchError(
      PatchErrorCode.CIRCULAR_REFERENCE,
      'Circular reference detected'
    );
  }

  seen.set(obj as object, true);

  const result = Array.isArray(obj)
    ? []
    : Object.create(Object.getPrototypeOf(obj));

  for (const [key, value] of Object.entries(obj)) {
    result[key] = deepClone(value, seen);
  }

  seen.delete(obj as object);
  return result;
}

/**
 * Detects circular references in an object
 */
export function detectCircular(
  obj: any,
  seen = new WeakSet(),
  path = ''
): string | null {
  if (obj === null || typeof obj !== 'object') {
    return null;
  }

  if (seen.has(obj)) {
    return path;
  }

  seen.add(obj);

  for (const [key, value] of Object.entries(obj)) {
    const nextPath = path ? `${path}/${key}` : key;
    const circularPath = detectCircular(value, seen, nextPath);
    if (circularPath) {
      return circularPath;
    }
  }

  seen.delete(obj);
  return null;
}

/**
 * Validates maximum depth of an object
 */
export function validateMaxDepth(
  obj: any,
  maxDepth: number,
  currentDepth = 0
): void {
  if (currentDepth > maxDepth) {
    throw new PatchError(
      PatchErrorCode.MAX_DEPTH_EXCEEDED,
      `Maximum depth of ${maxDepth} exceeded`,
      '/'
    );
  }

  if (obj !== null && typeof obj === 'object') {
    for (const value of Object.values(obj)) {
      validateMaxDepth(value, maxDepth, currentDepth + 1);
    }
  }
}

/**
 * Deep equality comparison
 */
export function deepEqual(a: any, b: any): boolean {
  if (a === b) {
    return true;
  }

  if (
    a === null ||
    b === null ||
    typeof a !== 'object' ||
    typeof b !== 'object'
  ) {
    return false;
  }

  const keysA = Object.keys(a);
  const keysB = Object.keys(b);

  if (keysA.length !== keysB.length) {
    return false;
  }

  return keysA.every(key => keysB.includes(key) && deepEqual(a[key], b[key]));
}

/**
 * Validates a patch operation
 */
function validateOperation(op: JsonPatchOperation): void {
  if (!isJsonPatchOperation(op)) {
    throw new PatchError(
      PatchErrorCode.INVALID_OPERATION,
      'Operation must be a valid JSON Patch operation'
    );
  }

  if (!op.path && op.op !== 'test') {
    throw new PatchError(
      PatchErrorCode.MISSING_REQUIRED_FIELD,
      `${op.op} operation must have a "path" field`
    );
  }

  if (op.path) {
    validateJsonPointer(op.path);
  }

  switch (op.op) {
    case 'add':
    case 'replace':
    case 'test':
      if (!('value' in op)) {
        throw new PatchError(
          PatchErrorCode.MISSING_REQUIRED_FIELD,
          `${op.op} operation must have a "value" field`
        );
      }
      break;

    case 'move':
    case 'copy':
      if (!op.from) {
        throw new PatchError(
          PatchErrorCode.MISSING_REQUIRED_FIELD,
          `${op.op} operation must have a "from" field`
        );
      }
      validateJsonPointer(op.from);
      break;

    case 'remove':
      // Remove operation only needs a path, which we've already validated
      break;
  }
}

/**
 * Validates an entire JSON Patch
 */
export function validatePatch(patch: JsonPatch): void {
  if (!Array.isArray(patch)) {
    throw new PatchError(
      PatchErrorCode.INVALID_PATCH,
      'Patch must be an array'
    );
  }

  patch.forEach((op, index) => {
    try {
      validateOperation(op);
    } catch (error) {
      throw new PatchError(
        error instanceof PatchError
          ? error.code
          : PatchErrorCode.INVALID_OPERATION,
        `Invalid operation at index ${index}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  });
}

/**
 * Validates an object to ensure it can be patched
 */
export function validatePatchTarget(obj: any): asserts obj is Patchable {
  if (obj === null || typeof obj !== 'object') {
    throw new PatchError(
      PatchErrorCode.INVALID_TARGET,
      'Patch target must be an object or array'
    );
  }
}
