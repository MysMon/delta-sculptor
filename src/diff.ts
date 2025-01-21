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

interface CreatePatchParams extends CreateDiffOptions {
  basePath?: string;
  currentDepth?: number;
}

interface HandleArrayParams extends CreateDiffOptions {
  basePath: string;
  currentDepth: number;
}

interface CreatePatchArgs {
  oldObj: any;
  newObj: any;
  params?: CreatePatchParams;
}

/**
 * Creates a JSON Patch that transforms oldObj into newObj
 */
export function createPatch({
  oldObj,
  newObj,
  params = {},
}: CreatePatchArgs): JsonPatch {
  const { basePath = '', currentDepth = 0, ...options } = params;

  // Handle primitive values and null first
  if (
    !isObject(oldObj) ||
    !isObject(newObj) ||
    oldObj === null ||
    newObj === null
  ) {
    return handlePrimitiveValues({ oldObj, newObj, basePath });
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
      const nestedOptions = {
        basePath,
        currentDepth,
        maxDepth: options.maxDepth,
        checkCircular: options.checkCircular,
        detectMove: options.detectMove,
        batchArrayOps: options.batchArrayOps,
        maxBatchSize: options.maxBatchSize,
      };
      return handleNestedArrays({ oldArray, newArray, params: nestedOptions });
    }

    return handleArrays({
      oldArray,
      newArray,
      params: {
        basePath,
        detectMove: options.detectMove,
        batchArrayOps: options.batchArrayOps,
        maxBatchSize: options.maxBatchSize,
        checkCircular: options.checkCircular,
      },
    });
  }

  // Handle objects
  const objectOptions = {
    basePath,
    currentDepth,
    maxDepth: options.maxDepth,
    checkCircular: options.checkCircular,
    detectMove: options.detectMove,
    batchArrayOps: options.batchArrayOps,
    maxBatchSize: options.maxBatchSize,
  };
  return handleObjects({ oldObj, newObj, params: objectOptions });
}

interface HandlePrimitivesArgs {
  oldObj: any;
  newObj: any;
  basePath: string;
}

function handlePrimitiveValues({
  oldObj,
  newObj,
  basePath,
}: HandlePrimitivesArgs): JsonPatch {
  const path = basePath || '/';

  if (deepEqual(oldObj, newObj)) {
    return [];
  }

  if (typeof oldObj === 'undefined') {
    return [{ op: 'add', path, value: newObj }];
  }

  if (typeof newObj === 'undefined') {
    return [{ op: 'remove', path }];
  }

  return [{ op: 'replace', path, value: newObj }];
}

interface HandleArraysArgs {
  oldArray: any[];
  newArray: any[];
  params: CreateDiffOptions & { basePath: string };
}

function handleArrays({
  oldArray,
  newArray,
  params,
}: HandleArraysArgs): JsonPatch {
  const { basePath, detectMove, batchArrayOps, maxBatchSize, checkCircular } =
    params;

  if (detectMove) {
    return diffArrayWithLCS(oldArray, newArray, {
      basePath,
      checkCircular,
      batchArrayOps,
      maxBatchSize,
    });
  }
  return diffArraySimple(oldArray, newArray, { basePath });
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

interface HandleNestedArraysArgs {
  oldArray: any[];
  newArray: any[];
  params: HandleArrayParams;
}

function handleNestedArrays({
  oldArray,
  newArray,
  params,
}: HandleNestedArraysArgs): JsonPatch {
  const {
    basePath,
    currentDepth,
    maxDepth,
    checkCircular,
    detectMove,
    batchArrayOps,
    maxBatchSize,
  } = params;
  const patch: JsonPatch = [];
  const minLen = Math.min(oldArray.length, newArray.length);

  // Handle common length elements recursively
  for (let i = 0; i < minLen; i++) {
    const oldVal = oldArray[i];
    const newVal = newArray[i];
    if (!deepEqual(oldVal, newVal)) {
      patch.push(
        ...createPatch({
          oldObj: oldVal,
          newObj: newVal,
          params: {
            basePath: `${basePath}/${i}`,
            currentDepth: currentDepth + 1,
            maxDepth,
            checkCircular,
            detectMove,
            batchArrayOps,
            maxBatchSize,
          },
        })
      );
    }
  }

  // Handle added elements
  for (let i = minLen; i < newArray.length; i++) {
    patch.push({
      op: 'add',
      path: `${basePath}/${i}`,
      value: newArray[i],
    });
  }

  // Handle removed elements
  for (let i = newArray.length; i < oldArray.length; i++) {
    patch.push({
      op: 'remove',
      path: `${basePath}/${oldArray.length - 1 - (i - newArray.length)}`,
    });
  }

  return patch;
}

interface HandleObjectsArgs {
  oldObj: Record<string, any>;
  newObj: Record<string, any>;
  params: HandleArrayParams;
}

function handleObjects({
  oldObj,
  newObj,
  params,
}: HandleObjectsArgs): JsonPatch {
  const {
    basePath,
    currentDepth,
    maxDepth,
    checkCircular,
    detectMove,
    batchArrayOps,
    maxBatchSize,
  } = params;
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
    } else if (!deepEqual(oldObj[key], newObj[key])) {
      patch.push(
        ...createPatch({
          oldObj: oldObj[key],
          newObj: newObj[key],
          params: {
            basePath: newPath,
            currentDepth: currentDepth + 1,
            maxDepth,
            checkCircular,
            detectMove,
            batchArrayOps,
            maxBatchSize,
          },
        })
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
