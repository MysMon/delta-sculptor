import { diffArrayWithLCS, diffArraySimple } from './diff-utils';
import { PatchError } from './errors';
import { JsonPatch } from './types';
import { escapePointerSegment } from './utils';
import { deepEqual, detectCircular } from './validate';

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

  /**
   * Base path for the current operation
   */
  basePath?: string;

  /**
   * Current depth in the recursion
   */
  currentDepth?: number;
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

function isObject(obj: any): boolean {
  return obj !== null && typeof obj === 'object';
}

function concatPath(basePath: string, key: string | number): string {
  return basePath + '/' + escapePointerSegment(String(key));
}

interface HandleObjectsArgs {
  oldObj: Record<string, any>;
  newObj: Record<string, any>;
  params: HandleArrayParams;
}

function isNestedObjEqual(
  oldVal: any,
  newVal: any,
  key: string,
  path: string
): boolean {
  if (!isObject(oldVal) || !isObject(newVal)) {
    return false;
  }

  // 浅い階層（2レベル以下）では常に再帰的に処理
  const depth = path.split('/').filter(Boolean).length;
  if (depth <= 2) {
    return true;
  }

  // 深い階層では一部のプロパティのみが変更された場合のみ再帰
  const oldKeys = Object.keys(oldVal);
  const newKeys = Object.keys(newVal);
  const commonKeys = oldKeys.filter(k => newKeys.includes(k));

  if (commonKeys.length === 0) {
    return false;
  }

  const hasUnchanged = commonKeys.some(k => deepEqual(oldVal[k], newVal[k]));
  const hasChanged = commonKeys.some(k => !deepEqual(oldVal[k], newVal[k]));

  return hasUnchanged && hasChanged;
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
    const oldVal = oldObj[key];
    const newVal = newObj[key];

    if (!oldKeys.includes(key)) {
      patch.push({
        op: 'add',
        path: newPath,
        value: newVal,
      });
    } else if (!deepEqual(oldVal, newVal)) {
      if (isNestedObjEqual(oldVal, newVal, key, newPath)) {
        const nestedPatch = createPatch({
          oldObj: oldVal,
          newObj: newVal,
          params: {
            basePath: newPath,
            currentDepth: currentDepth + 1,
            maxDepth,
            checkCircular,
            detectMove,
            batchArrayOps,
            maxBatchSize,
          },
        });

        patch.push(...nestedPatch);
      } else {
        // 完全な置換が必要な場合
        patch.push({
          op: 'replace',
          path: newPath,
          value: newVal,
        });
      }
    }
  }

  return patch;
}

export function createPatch({
  oldObj,
  newObj,
  params = {},
}: CreatePatchArgs): JsonPatch {
  const {
    detectMove = true,
    batchArrayOps = true,
    maxDepth = 100,
    checkCircular = true,
    maxBatchSize = 100,
    basePath = '',
    currentDepth = 0,
  } = params;

  // 深さの検証
  const effectiveMaxDepth = maxDepth ?? 50;
  if (currentDepth > effectiveMaxDepth) {
    throw PatchError.maxDepthExceeded(basePath, effectiveMaxDepth);
  }

  const checkDepth = (obj: any, depth: number): number => {
    if (depth > effectiveMaxDepth) {
      throw PatchError.maxDepthExceeded(basePath, effectiveMaxDepth);
    }
    if (typeof obj !== 'object' || obj === null) {
      return depth;
    }
    return Math.max(
      depth,
      ...Object.values(obj).map(val => checkDepth(val, depth + 1))
    );
  };

  checkDepth(oldObj, currentDepth);
  checkDepth(newObj, currentDepth);

  if (checkCircular) {
    if (detectCircular(oldObj) || detectCircular(newObj)) {
      throw PatchError.circularReference(basePath);
    }
  }

  if (!isObject(oldObj) || !isObject(newObj)) {
    return handlePrimitiveValues({ oldObj, newObj, basePath });
  }

  if (Array.isArray(oldObj) && Array.isArray(newObj)) {
    const internalCreatePatch = (localOld: any, localNew: any, localBasePath: string): JsonPatch => {
      return createPatch({
        oldObj: localOld,
        newObj: localNew,
        params: { ...params, basePath: localBasePath, currentDepth: (params.currentDepth || 0) + 1 },
      });
    };
    const useSimpleDiff = !detectMove;
    if (useSimpleDiff) {
      return diffArraySimple(oldObj, newObj, { basePath, batchArrayOps }, internalCreatePatch);
    }
    return diffArrayWithLCS(
      oldObj,
      newObj,
      {
        batchArrayOps,
        maxBatchSize,
        basePath,
        checkCircular,
        detectMove,
        maxDepth,
        currentDepth,
      },
      internalCreatePatch
    );
  }

  return handleObjects({
    oldObj,
    newObj,
    params: {
      detectMove,
      batchArrayOps,
      maxDepth,
      checkCircular,
      maxBatchSize,
      basePath,
      currentDepth: currentDepth + 1,
    },
  });
}
