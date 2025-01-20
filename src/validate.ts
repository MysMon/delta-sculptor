import { PatchError, PatchErrorCode } from './errors';
import { JsonPatch, JsonPatchOperation } from './types';

/**
 * Validates a JSON Pointer string according to RFC 6901
 */
export function validateJsonPointer(pointer: string): void {
  if (pointer === '') return; // Empty string is valid (root reference)

  if (!pointer.startsWith('/')) {
    throw PatchError.invalidPointer(pointer);
  }

  // Check for invalid escape sequences
  const segments = pointer.split('/').slice(1);
  for (const segment of segments) {
    // Check for invalid escape sequences
    let i = 0;
    while (i < segment.length) {
      if (segment[i] === '~') {
        if (i + 1 >= segment.length || !'01'.includes(segment[i + 1])) {
          throw PatchError.invalidPointer(pointer);
        }
        i += 2;
      } else {
        i++;
      }
    }
  }
}

/**
 * Detects circular references in an object
 */
export function detectCircular(obj: any, seen = new WeakSet()): boolean {
  // Handle primitive types
  if (obj === null || typeof obj !== 'object') {
    return false;
  }

  // Check for circular reference
  if (seen.has(obj)) {
    return true;
  }
  seen.add(obj);

  // Handle arrays
  if (Array.isArray(obj)) {
    return obj.some(item => detectCircular(item, seen));
  }

  // Handle objects
  return Object.values(obj).some(value => detectCircular(value, seen));
}

/**
 * Validates maximum recursion depth
 */
export function validateMaxDepth(
  obj: any,
  maxDepth: number,
  currentDepth = 0
): void {
  if (currentDepth > maxDepth) {
    throw new PatchError(
      PatchErrorCode.TYPE_MISMATCH,
      `Maximum depth exceeded: ${maxDepth}`
    );
  }

  if (obj && typeof obj === 'object') {
    if (Array.isArray(obj)) {
      obj.forEach(item => validateMaxDepth(item, maxDepth, currentDepth + 1));
    } else {
      Object.values(obj).forEach(value =>
        validateMaxDepth(value, maxDepth, currentDepth + 1)
      );
    }
  }
}

/**
 * Performs a deep equality comparison without using JSON.stringify
 */
export function deepEqual(
  a: any,
  b: any,
  seen = new WeakMap<object, any>()
): boolean {
  // Handle primitive types and null/undefined
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a !== 'object' || typeof b !== 'object') return false;

  // Check for circular references
  if (seen.has(a)) {
    return seen.get(a) === b;
  }
  seen.set(a, b);

  // Handle arrays
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    return a.every((val, i) => deepEqual(val, b[i], seen));
  }

  // Handle objects
  if (Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) return false;

  const keysA = Object.keys(a);
  const keysB = Object.keys(b);

  if (keysA.length !== keysB.length) return false;

  return keysA.every(
    key => keysB.includes(key) && deepEqual(a[key], b[key], seen)
  );
}

/**
 * Creates a deep clone while handling circular references
 */
export function deepClone<T>(obj: T, seen = new WeakMap<object, any>()): T {
  // Handle primitive types and null/undefined
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  // Handle circular references
  if (seen.has(obj as object)) {
    return seen.get(obj as object);
  }

  // Handle arrays
  if (Array.isArray(obj)) {
    const clone: any[] = [];
    seen.set(obj, clone);
    clone.push(...obj.map(item => deepClone(item, seen)));
    return clone as unknown as T;
  }

  // Handle objects
  const clone = Object.create(Object.getPrototypeOf(obj));
  seen.set(obj as object, clone);

  Object.entries(obj as object).forEach(([key, value]) => {
    clone[key] = deepClone(value, seen);
  });

  return clone;
}

/**
 * Validates a JSON Patch document according to RFC 6902
 */
export function validatePatch(patch: JsonPatch): void {
  if (!Array.isArray(patch)) {
    throw new PatchError(
      PatchErrorCode.INVALID_OPERATION,
      'A JSON Patch document must be an array of operations'
    );
  }

  patch.forEach((op, index) => {
    if (!op.op) {
      throw new PatchError(
        PatchErrorCode.MISSING_REQUIRED_FIELD,
        `Operation ${index} is missing the required 'op' field`
      );
    }

    if (!op.path) {
      throw new PatchError(
        PatchErrorCode.MISSING_REQUIRED_FIELD,
        `Operation ${index} is missing the required 'path' field`
      );
    }

    validateJsonPointer(op.path);

    switch (op.op) {
      case 'add':
      case 'replace':
      case 'test':
        if ('value' in op === false) {
          throw PatchError.missingField(op.op, 'value');
        }
        break;
      case 'move':
      case 'copy':
        if (!op.from) {
          throw PatchError.missingField(op.op, 'from');
        }
        validateJsonPointer(op.from);
        break;
      case 'remove':
        break;
      default:
        throw PatchError.invalidOperation((op as JsonPatchOperation).op);
    }
  });
}
