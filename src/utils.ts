import { PatchError, PatchErrorCode } from './errors';
import { JsonPointer } from './types';

/**
 * Escapes a JSON Pointer segment according to RFC 6901
 */
export function escapePointerSegment(segment: string): string {
  return segment.replace(/~/g, '~0').replace(/\//g, '~1');
}

/**
 * Unescapes a JSON Pointer segment according to RFC 6901
 */
export function unescapePointerSegment(segment: string): string {
  return segment.replace(/~1/g, '/').replace(/~0/g, '~');
}

/**
 * Builds a JSON Pointer from segments
 */
export function buildPointer(segments: string[]): JsonPointer {
  if (segments.length === 0) return '/';
  return '/' + segments.map(escapePointerSegment).join('/');
}

// Cache for parsed pointers to avoid repeated parsing
const pointerParseCache = new Map<string, string[]>();
const maxCacheSize = 1000;

/**
 * Parses a JSON Pointer into segments with caching
 */
export function parsePointer(pointer: string): string[] {
  // Check cache first
  const cached = pointerParseCache.get(pointer);
  if (cached) {
    return cached;
  }

  if (pointer === '') {
    const result: string[] = [];
    pointerParseCache.set(pointer, result);
    return result;
  }
  if (!pointer.startsWith('/')) {
    throw new PatchError(
      PatchErrorCode.INVALID_POINTER,
      'Invalid JSON Pointer: must start with /'
    );
  }

  const result = pointer.slice(1).split('/').map(unescapePointerSegment);

  // Cache the result if cache isn't too large
  if (pointerParseCache.size < maxCacheSize) {
    pointerParseCache.set(pointer, result);
  }

  return result;
}

/**
 * Checks if a path points to an array element
 */
export function isArrayPath(path: string): boolean {
  // Array paths end with a number or '-'
  const lastSegment = parsePointer(path).pop();
  return lastSegment === '-' || /^\d+$/.test(lastSegment ?? '');
}

/**
 * Gets a value from an object using a JSON Pointer (RFC 6901)
 */
export function getValueByPointer(obj: any, pointer: JsonPointer): any {
  if (pointer === '') return obj;

  const segments = parsePointer(pointer);
  let current = obj;

  for (const segment of segments) {
    if (current === undefined || current === null) {
      return undefined;
    }
    if (Array.isArray(current) && segment === '-') {
      return undefined;
    }
    current = current[segment];
  }

  return current;
}

/**
 * Sets a value in an object using a JSON Pointer (RFC 6901)
 */
export function setValueByPointer(obj: any, pointer: string, value: any): void {
  validateJsonPointer(pointer);

  const segments = parsePointer(pointer);
  if (segments.length === 0) {
    throw new PatchError(
      PatchErrorCode.ROOT_OPERATION_ERROR,
      'Cannot set the root value'
    );
  }

  let current = obj;
  const lastSegment = segments[segments.length - 1];
  const parentSegments = segments.slice(0, -1);

  for (const segment of parentSegments) {
    if (current === undefined || current === null) {
      throw new PatchError(
        PatchErrorCode.INVALID_POINTER,
        'Cannot set value at path that does not exist'
      );
    }

    if (Array.isArray(current)) {
      const index = segment === '-' ? current.length : parseInt(segment, 10);
      validateArrayIndex(current, index, true);
      if (!(index in current)) {
        current[index] = isNumeric(
          segments[parentSegments.indexOf(segment) + 1]
        )
          ? []
          : {};
      }
    } else if (typeof current === 'object') {
      if (!(segment in current)) {
        current[segment] = isNumeric(
          segments[parentSegments.indexOf(segment) + 1]
        )
          ? []
          : {};
      }
    } else {
      throw new PatchError(
        PatchErrorCode.TYPE_MISMATCH,
        'Cannot traverse non-object value'
      );
    }
    current = current[segment];
  }

  if (Array.isArray(current)) {
    const index =
      lastSegment === '-' ? current.length : parseInt(lastSegment, 10);
    validateArrayIndex(current, index, true);
    current.splice(index, 0, value);
  } else if (typeof current === 'object' && current !== null) {
    current[lastSegment] = value;
  } else {
    throw new PatchError(
      PatchErrorCode.TYPE_MISMATCH,
      'Cannot set value on non-object'
    );
  }
}

function isNumeric(str: string): boolean {
  if (str === '-') return true;
  return /^-?\d+$/.test(str);
}

/**
 * Removes a value from an object using a JSON Pointer (RFC 6901)
 */
export function removeByPointer(obj: any, pointer: JsonPointer): any {
  if (pointer === '') {
    throw new PatchError(
      PatchErrorCode.ROOT_OPERATION_ERROR,
      'Cannot remove the root'
    );
  }

  const segments = parsePointer(pointer);
  let current = obj;

  for (let i = 0; i < segments.length - 1; i++) {
    const segment = segments[i];
    if (!(segment in current)) {
      return undefined;
    }
    current = current[segment];
  }

  const lastSegment = segments[segments.length - 1];
  if (Array.isArray(current)) {
    const index =
      lastSegment === '-' ? current.length - 1 : parseInt(lastSegment, 10);
    if (isNaN(index) || index < 0) {
      throw new PatchError(
        PatchErrorCode.ARRAY_INDEX_ERROR,
        'Invalid array index'
      );
    }
    if (index >= current.length) {
      return undefined;
    }
    return current.splice(index, 1)[0];
  } else {
    if (!(lastSegment in current)) {
      return undefined;
    }
    const value = current[lastSegment];
    delete current[lastSegment];
    return value;
  }
}

/**
 * Legacy alias for removeByPointer for backward compatibility
 * @deprecated Use removeByPointer instead
 */
export function removeValueByPointer(obj: any, pointer: string): any {
  if (typeof pointer !== 'string') {
    throw new PatchError(
      PatchErrorCode.INVALID_POINTER,
      'JSON Pointer must be a string'
    );
  }

  const segments = parsePointer(pointer);
  if (segments.length === 0) {
    throw new PatchError(
      PatchErrorCode.ROOT_OPERATION_ERROR,
      'Cannot remove the entire root'
    );
  }

  let current = obj;
  const lastSegment = segments[segments.length - 1];
  const parentSegments = segments.slice(0, -1);

  for (const segment of parentSegments) {
    if (current === undefined || current === null) {
      return undefined;
    }

    if (Array.isArray(current)) {
      const index =
        segment === '-' ? current.length - 1 : parseInt(segment, 10);
      if (isNaN(index) || index < 0 || index >= current.length) {
        return undefined;
      }
      current = current[index];
    } else {
      if (!(segment in current)) {
        return undefined;
      }
      current = current[segment];
    }
  }

  if (Array.isArray(current)) {
    const index =
      lastSegment === '-' ? current.length - 1 : parseInt(lastSegment, 10);
    if (isNaN(index) || index < 0 || index >= current.length) {
      return undefined;
    }
    return current.splice(index, 1)[0];
  } else {
    if (!(lastSegment in current)) {
      return undefined;
    }
    const value = current[lastSegment];
    delete current[lastSegment];
    return value;
  }
}

/**
 * Checks if an object contains circular references
 * Optimized to avoid Set manipulation overhead
 */
export function hasCircularReferences(obj: any, seen = new Set()): boolean {
  if (obj === null || typeof obj !== 'object') return false;
  if (seen.has(obj)) return true;

  seen.add(obj);

  // Use for...in loop for better performance than Object.values()
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      if (hasCircularReferences(obj[key], seen)) {
        seen.delete(obj); // Clean up before returning
        return true;
      }
    }
  }

  seen.delete(obj);
  return false;
}

// Fast paths for common simple types
function fastDeepEqual(a: any, b: any): boolean | null {
  // Fast path for identical references
  if (a === b) return true;

  // Fast path for null/undefined
  if (a == null || b == null) return a === b;

  // Fast path for different types
  const typeA = typeof a;
  const typeB = typeof b;
  if (typeA !== typeB) return false;

  // Fast path for primitives
  if (typeA !== 'object') return false;

  // Fast path for array length check
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    // Let full comparison handle array contents
    return null;
  }

  // Fast path for object key count
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;

  // Need full comparison
  return null;
}

/**
 * Performs a deep equality comparison between two values
 * Optimized with fast paths and efficient object comparison
 */
export function deepEqual(a: any, b: any, seen = new WeakMap()): boolean {
  // Try fast path first
  const fastResult = fastDeepEqual(a, b);
  if (fastResult !== null) return fastResult;

  // Handle circular references
  if (seen.has(a)) {
    return seen.get(a) === b;
  }
  seen.set(a, b);

  // Handle arrays
  if (Array.isArray(a)) {
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i], seen)) return false;
    }
    return true;
  }

  // Handle objects - optimized key comparison
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);

  // Quick key existence check using Set for larger objects
  if (aKeys.length > 10) {
    const bKeySet = new Set(bKeys);
    for (const key of aKeys) {
      if (!bKeySet.has(key) || !deepEqual(a[key], b[key], seen)) {
        return false;
      }
    }
  } else {
    // Direct comparison for smaller objects
    for (const key of aKeys) {
      if (!bKeys.includes(key) || !deepEqual(a[key], b[key], seen)) {
        return false;
      }
    }
  }

  return true;
}

// Compiled regex for better performance
const ESCAPE_SEQUENCE_REGEX = /^[^~]*(?:~[01][^~]*)*$/;

export function validateJsonPointer(pointer: string): void {
  if (typeof pointer !== 'string') {
    throw new PatchError(
      PatchErrorCode.INVALID_POINTER,
      'JSON Pointer must be a string'
    );
  }

  if (pointer !== '' && !pointer.startsWith('/')) {
    throw new PatchError(
      PatchErrorCode.INVALID_POINTER,
      'Invalid JSON Pointer: must start with /'
    );
  }

  // エスケープシーケンスの検証を強化
  const segments = pointer.split('/').slice(1);
  for (const segment of segments) {
    if (segment.includes('~') && !ESCAPE_SEQUENCE_REGEX.test(segment)) {
      throw new PatchError(
        PatchErrorCode.INVALID_POINTER,
        'Invalid escape sequence in JSON Pointer'
      );
    }
  }
}

export function validateArrayIndex(
  arr: any[],
  index: string | number,
  allowEnd: boolean = false
): number {
  if (typeof index === 'string' && index === '-') {
    return allowEnd ? arr.length : arr.length - 1;
  }

  const numericIndex = typeof index === 'string' ? parseInt(index, 10) : index;

  if (
    isNaN(numericIndex) ||
    !Number.isInteger(numericIndex) ||
    numericIndex < 0
  ) {
    throw new PatchError(
      PatchErrorCode.ARRAY_INDEX_ERROR,
      `Invalid array index: ${index} (must be a non-negative integer or '-', got ${typeof index})`
    );
  }

  // allowEndがtrueの場合、配列長を超えるインデックスも許可（スパース配列用）
  if (!allowEnd && numericIndex >= arr.length) {
    throw new PatchError(
      PatchErrorCode.ARRAY_INDEX_ERROR,
      `Array index out of bounds: ${numericIndex} (array length: ${arr.length}, allowEnd: ${allowEnd})`
    );
  }

  return numericIndex;
}
