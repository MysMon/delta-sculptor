import { PatchError, PatchErrorCode } from './errors';
import { JsonPatch, JsonPatchOperation, Patchable } from './types';

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
export function validateJsonPointer(pointer: string): void {
  if (typeof pointer !== 'string') {
    throw PatchError.invalidPointerFormat('Pointer must be a string');
  }

  // 空のポインターは有効（ドキュメントのルートを参照）
  if (pointer === '') {
    return;
  }

  // ルートポインターまたはスラッシュで始まるポインターが必要
  if (!pointer.startsWith('/')) {
    throw PatchError.invalidPointerFormat('Pointer must start with /');
  }

  // スラッシュのみの場合は有効（ドキュメントのルートを参照）
  if (pointer === '/') {
    return;
  }

  const segments = pointer.split('/').slice(1);
  for (const segment of segments) {
    // エスケープシーケンスの検証
    let index = segment.indexOf('~');
    while (index !== -1) {
      if (index === segment.length - 1 || !'01'.includes(segment[index + 1])) {
        throw PatchError.invalidPointerFormat(
          'Invalid escape sequence in pointer'
        );
      }
      index = segment.indexOf('~', index + 2);
    }

    // パーセントエンコーディングの検証
    // 不完全なパーセントエンコーディングをチェック
    const percentIndex = segment.indexOf('%');
    if (percentIndex !== -1) {
      // %の後に2桁の16進数が続くことを確認
      if (
        percentIndex === segment.length - 1 ||
        percentIndex === segment.length - 2 ||
        !/^[0-9A-Fa-f]{2}$/.test(segment.substr(percentIndex + 1, 2))
      ) {
        throw PatchError.invalidPointerFormat(
          'Invalid percent encoding in pointer'
        );
      }
    }

    // 制御文字の検証（RFC 6901では制御文字は許可されない）
    for (let i = 0; i < segment.length; i++) {
      const code = segment.charCodeAt(i);
      if ((code <= 0x1f && code !== 0x09) || code === 0x7f) {
        throw PatchError.invalidPointerFormat(
          'Invalid control characters in pointer'
        );
      }
    }
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
  // Handle primitive types
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  // Handle circular references
  if (seen.has(obj as object)) {
    const existing = seen.get(obj as object);
    if (existing) {
      return existing;
    }
  }

  // Create new instance
  const result = Array.isArray(obj)
    ? []
    : Object.create(Object.getPrototypeOf(obj));

  // Store the clone before recursing to handle circular references
  seen.set(obj as object, result);

  // Clone properties
  for (const [key, value] of Object.entries(obj)) {
    result[key] = deepClone(value, seen);
  }

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
  // Handle primitive types
  if (obj === null || typeof obj !== 'object') {
    return null;
  }

  // Check for circular references
  if (seen.has(obj)) {
    return path || '/';
  }

  seen.add(obj);

  // Check all properties recursively
  for (const [key, value] of Object.entries(obj)) {
    const nextPath = path ? `${path}/${key}` : `/${key}`;
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
  currentDepth = 0,
  path = ''
): void {
  if (currentDepth > maxDepth) {
    throw new PatchError(
      PatchErrorCode.MAX_DEPTH_EXCEEDED,
      `Maximum depth of ${maxDepth} exceeded at path: ${path || '/'}`
    );
  }

  if (obj !== null && typeof obj === 'object') {
    for (const [key, value] of Object.entries(obj)) {
      const nextPath = path ? `${path}/${key}` : `/${key}`;
      validateMaxDepth(value, maxDepth, currentDepth + 1, nextPath);
    }
  }
}

/**
 * Deep equality comparison
 */
export function deepEqual(a: any, b: any, seen = new WeakMap()): boolean {
  // Handle primitive types and null/undefined
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

  // Handle arrays
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) {
      return false;
    }
    return a.every((item, index) => deepEqual(item, b[index], seen));
  }

  // Handle circular references
  if (seen.has(a)) {
    return seen.get(a) === b;
  }
  seen.set(a, b);

  // Compare object properties
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);

  if (keysA.length !== keysB.length) {
    seen.delete(a);
    return false;
  }

  const result = keysA.every(key => {
    if (!keysB.includes(key)) {
      return false;
    }
    return deepEqual(a[key], b[key], seen);
  });

  seen.delete(a);
  return result;
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

  const seenPaths = new Set<string>();
  patch.forEach((op, index) => {
    try {
      validateOperation(op);

      // Check for duplicate paths in sequential operations
      if (op.path && (op.op === 'remove' || op.op === 'replace')) {
        if (seenPaths.has(op.path)) {
          throw new PatchError(
            PatchErrorCode.INVALID_OPERATION,
            `Duplicate path "${op.path}" in sequential operations`
          );
        }
        seenPaths.add(op.path);
      }
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
