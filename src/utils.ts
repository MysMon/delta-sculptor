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
  if (segments.length === 0) return '';
  return '/' + segments.map(escapePointerSegment).join('/');
}

/**
 * Parses a JSON Pointer into segments
 */
export function parsePointer(pointer: JsonPointer): string[] {
  if (pointer === '') return [];
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
    if (current === undefined) return undefined;
    current = current[segment];
  }

  return current;
}

/**
 * Sets a value in an object using a JSON Pointer (RFC 6901)
 */
export function setValueByPointer(
  obj: any,
  pointer: JsonPointer,
  value: any
): void {
  const segments = parsePointer(pointer);
  let current = obj;

  for (let i = 0; i < segments.length - 1; i++) {
    const segment = segments[i];
    if (!(segment in current)) {
      // Create objects/arrays as needed
      const nextSegment = segments[i + 1];
      current[segment] = /^\d+$/.test(nextSegment) ? [] : {};
    }
    current = current[segment];
  }

  const lastSegment = segments[segments.length - 1];
  if (lastSegment === '-' && Array.isArray(current)) {
    current.push(value);
  } else {
    current[lastSegment] = value;
  }
}

/**
 * Removes a value from an object using a JSON Pointer (RFC 6901)
 */
export function removeByPointer(obj: any, pointer: JsonPointer): void {
  if (pointer === '') {
    throw new Error('Cannot remove root object');
  }

  const segments = parsePointer(pointer);
  let current = obj;

  for (let i = 0; i < segments.length - 1; i++) {
    const segment = segments[i];
    if (current[segment] === undefined) return;
    current = current[segment];
  }

  const lastSegment = segments[segments.length - 1];
  if (Array.isArray(current)) {
    if (lastSegment === '-') {
      current.pop();
    } else {
      const index = parseInt(lastSegment, 10);
      if (!isNaN(index)) {
        current.splice(index, 1);
      }
    }
  } else {
    delete current[lastSegment];
  }
}

/**
 * Legacy alias for removeByPointer for backward compatibility
 * @deprecated Use removeByPointer instead
 */
export const removeValueByPointer = removeByPointer;

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
