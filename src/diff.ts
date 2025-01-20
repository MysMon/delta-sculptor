import { diffArrayWithLCS, diffArraySimple } from './diff-utils';
import { PatchError } from './errors';
import { JsonPatch } from './types';
import { escapePointerSegment } from './utils';
import { deepEqual, validateMaxDepth, detectCircular } from './validate';

export interface CreateDiffOptions {
  /**
   * Whether to detect and use "move" operations for array elements
   * Uses an efficient LCS algorithm for optimal move detection
   */
  detectMove?: boolean;

  /**
   * Whether to batch sequential array operations for better performance
   */
  batchArrayOps?: boolean;

  /**
   * Maximum depth for recursive diff generation
   * Used to prevent stack overflow with deeply nested objects
   */
  maxDepth?: number;

  /**
   * Check for circular references in objects/arrays
   * @default true
   */
  checkCircular?: boolean;

  /**
   * Maximum number of sequential operations to batch
   * Only used when batchArrayOps is true
   * @default 100
   */
  maxBatchSize?: number;
}

/**
 * Creates a JSON Patch that transforms oldObj into newObj
 */
export function createPatch(
  oldObj: any,
  newObj: any,
  basePath: string = '',
  options: CreateDiffOptions = {},
  currentDepth: number = 0
): JsonPatch {
  // Handle max depth
  // Handle primitive values and null first
  if (
    !isObject(oldObj) ||
    !isObject(newObj) ||
    oldObj === null ||
    newObj === null
  ) {
    return handlePrimitiveValues(oldObj, newObj, basePath);
  }

  // Validate depth and check for circular references
  if (options.maxDepth !== undefined) {
    validateMaxDepth(newObj, options.maxDepth, currentDepth);
  }
  if (options.checkCircular !== false && detectCircular(newObj)) {
    throw PatchError.circularReference(basePath);
  }

  // Handle arrays - including undefined/null elements
  if (Array.isArray(oldObj) || Array.isArray(newObj)) {
    // Convert non-arrays to empty arrays for consistent handling
    const oldArray = Array.isArray(oldObj) ? oldObj : [];
    const newArray = Array.isArray(newObj) ? newObj : [];

    // Handle nested arrays and special values
    if (oldArray.some(isNestedStructure) || newArray.some(isNestedStructure)) {
      return handleNestedArrays(
        oldArray,
        newArray,
        basePath,
        options,
        currentDepth
      );
    }

    return handleArrays(oldArray, newArray, basePath, options);
  }

  // Handle objects
  return handleObjects(oldObj, newObj, basePath, options, currentDepth);
}

function handlePrimitiveValues(
  oldObj: any,
  newObj: any,
  basePath: string
): JsonPatch {
  if (deepEqual(oldObj, newObj, new WeakMap())) {
    return [];
  }

  if (typeof oldObj === 'undefined') {
    return [{ op: 'add', path: basePath || '/', value: newObj }];
  }

  if (typeof newObj === 'undefined') {
    return [{ op: 'remove', path: basePath || '/' }];
  }

  return [{ op: 'replace', path: basePath || '/', value: newObj }];
}

function handleArrays(
  oldArr: any[],
  newArr: any[],
  basePath: string,
  options: CreateDiffOptions
): JsonPatch {
  return options.detectMove
    ? diffArrayWithLCS(oldArr, newArr, basePath, {
        checkCircular: options.checkCircular,
        batchArrayOps: options.batchArrayOps,
        maxBatchSize: options.maxBatchSize,
      })
    : diffArraySimple(oldArr, newArr, basePath);
}

function isObject(obj: any): boolean {
  return obj !== null && typeof obj === 'object';
}

function isNestedStructure(value: any): boolean {
  return Array.isArray(value) || (isObject(value) && !isEmptyObject(value));
}

function isEmptyObject(obj: any): boolean {
  return Object.keys(obj).length === 0;
}

function handleNestedArrays(
  oldArr: any[],
  newArr: any[],
  basePath: string,
  options: CreateDiffOptions,
  currentDepth: number
): JsonPatch {
  const patch: JsonPatch = [];
  const minLen = Math.min(oldArr.length, newArr.length);

  // Handle common length elements recursively
  for (let i = 0; i < minLen; i++) {
    const oldVal = oldArr[i];
    const newVal = newArr[i];
    if (!deepEqual(oldVal, newVal, new WeakMap())) {
      patch.push(
        ...createPatch(
          oldVal,
          newVal,
          `${basePath}/${i}`,
          options,
          currentDepth + 1
        )
      );
    }
  }

  // Handle added elements
  for (let i = minLen; i < newArr.length; i++) {
    patch.push({
      op: 'add',
      path: `${basePath}/${i}`,
      value: newArr[i],
    });
  }

  // Handle removed elements
  for (let i = newArr.length; i < oldArr.length; i++) {
    patch.push({
      op: 'remove',
      path: `${basePath}/${oldArr.length - 1 - (i - newArr.length)}`,
    });
  }

  return patch;
}

function handleObjects(
  oldObj: Record<string, any>,
  newObj: Record<string, any>,
  basePath: string,
  options: CreateDiffOptions,
  currentDepth: number
): JsonPatch {
  const patch: JsonPatch = [];
  const oldKeys = Object.keys(oldObj);
  const newKeys = Object.keys(newObj);

  // Handle removed keys
  for (const key of oldKeys) {
    if (!newKeys.includes(key)) {
      patch.push({
        op: 'remove',
        path: concatPath(basePath, key),
      });
    }
  }

  // Handle added/updated keys
  for (const key of newKeys) {
    const newPath = concatPath(basePath, key);

    if (!oldKeys.includes(key)) {
      patch.push({
        op: 'add',
        path: newPath,
        value: newObj[key],
      });
    } else if (!deepEqual(oldObj[key], newObj[key], new WeakMap())) {
      patch.push(
        ...createPatch(
          oldObj[key],
          newObj[key],
          newPath,
          options,
          currentDepth + 1
        )
      );
    }
  }

  return patch;
}

function concatPath(basePath: string, key: string | number): string {
  if (!basePath) {
    return '/' + escapePointerSegment(String(key));
  }
  return basePath + '/' + escapePointerSegment(String(key));
}
