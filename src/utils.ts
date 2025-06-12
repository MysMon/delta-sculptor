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

/**
 * Parses a JSON Pointer into segments
 */
export function parsePointer(pointer: string): string[] {
  if (pointer === '') {
    return [];
  }
  if (!pointer.startsWith('/')) {
    throw new PatchError(
      PatchErrorCode.INVALID_POINTER,
      'Invalid JSON Pointer: must start with /'
    );
  }
  return pointer.slice(1).split('/').map(unescapePointerSegment);
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
 */
export function hasCircularReferences(obj: any, seen = new Set()): boolean {
  if (obj === null || typeof obj !== 'object') return false;
  if (seen.has(obj)) return true;

  seen.add(obj);
  for (const value of Object.values(obj)) {
    if (hasCircularReferences(value, seen)) return true;
  }
  seen.delete(obj);

  return false;
}

/**
 * Performs a deep equality comparison between two values
 */
export function deepEqual(a: any, b: any, seen = new WeakMap()): boolean {
  // Handle primitive types and null/undefined
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== 'object' || typeof b !== 'object') return false;

  // Handle circular references
  if (seen.has(a)) {
    return seen.get(a) === b;
  }
  seen.set(a, b);

  // Handle arrays
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i], seen)) return false;
    }
    return true;
  }

  // Handle objects
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;

  for (const key of aKeys) {
    if (!bKeys.includes(key)) return false;
    if (!deepEqual(a[key], b[key], seen)) return false;
  }

  return true;
}

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
    if (segment.includes('~') && !segment.match(/^[^~]*(?:~[01][^~]*)*$/)) {
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
