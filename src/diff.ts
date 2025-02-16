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

/**
 * Creates a JSON Patch that transforms oldObj into newObj
 */
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
  if (currentDepth > maxDepth) {
    throw PatchError.maxDepthExceeded(basePath, maxDepth);
  }

  // 循環参照のチェック
  if (checkCircular) {
    if (detectCircular(oldObj) || detectCircular(newObj)) {
      throw PatchError.circularReference(basePath);
    }
  }

  // プリミティブ値の処理
  if (!isObject(oldObj) || !isObject(newObj)) {
    return handlePrimitiveValues({ oldObj, newObj, basePath });
  }

  // 配列の処理
  if (Array.isArray(oldObj) && Array.isArray(newObj)) {
    return handleArrays({
      oldArray: oldObj,
      newArray: newObj,
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

  // オブジェクトの処理
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
  const { detectMove, batchArrayOps, maxBatchSize = 100 } = params;

  // 配列の差分を計算
  const operations = detectMove
    ? diffArrayWithLCS(oldArray, newArray, params)
    : diffArraySimple(oldArray, newArray, params);

  // 配列操作の最適化を無効にする場合は、そのまま返す
  if (!batchArrayOps) {
    return operations.reduce((acc: JsonPatch, op) => {
      if (op.op === 'add' && Array.isArray(op.value)) {
        // 配列の追加を個別の操作に分解
        const basePath = op.path.slice(0, op.path.lastIndexOf('/'));
        const index = Number(op.path.slice(op.path.lastIndexOf('/') + 1));
        op.value.forEach((value, i) => {
          acc.push({
            op: 'add',
            path: `${basePath}/${index + i}`,
            value,
          });
        });
      } else if (op.op === 'remove' && op.count && op.count > 1) {
        // 複数要素の削除を個別の操作に分解
        const basePath = op.path.slice(0, op.path.lastIndexOf('/'));
        const index = Number(op.path.slice(op.path.lastIndexOf('/') + 1));
        for (let i = 0; i < op.count; i++) {
          acc.push({
            op: 'remove',
            path: `${basePath}/${index}`,
          });
        }
      } else {
        acc.push(op);
      }
      return acc;
    }, []);
  }

  // 配列操作の最適化
  if (operations.length > 1) {
    const optimizedOps: JsonPatch = [];
    let currentBatch: any[] = [];
    let currentOp = operations[0];
    const pathParts = currentOp.path.split('/');
    let batchStartIndex = Number(pathParts[pathParts.length - 1] || '0');

    for (let i = 0; i < operations.length; i++) {
      const op = operations[i];
      const pathParts = op.path.split('/');
      const index = Number(pathParts[pathParts.length - 1] || '0');
      const isSameBasePath =
        op.path.slice(0, op.path.lastIndexOf('/')) ===
        currentOp.path.slice(0, currentOp.path.lastIndexOf('/'));

      if (
        op.op === currentOp.op &&
        isSameBasePath &&
        index === batchStartIndex + currentBatch.length &&
        currentBatch.length < maxBatchSize &&
        (op.op === 'add' || op.op === 'replace' || op.op === 'remove')
      ) {
        if (op.op === 'add' || op.op === 'replace') {
          currentBatch.push(op.value);
        } else if (op.op === 'remove') {
          currentBatch.push(null);
        }
      } else {
        // 現在のバッチを処理
        if (currentBatch.length > 0) {
          if (currentOp.op === 'remove') {
            optimizedOps.push({
              op: 'remove',
              path: currentOp.path,
              count: currentBatch.length,
            });
          } else {
            optimizedOps.push({
              op: currentOp.op,
              path: currentOp.path,
              value:
                currentBatch.length === 1 ? currentBatch[0] : [...currentBatch],
            });
          }
        }

        // 新しいバッチを開始
        currentBatch = [];
        if (op.op === 'add' || op.op === 'replace') {
          currentBatch.push(op.value);
        } else if (op.op === 'remove') {
          currentBatch.push(null);
        } else {
          optimizedOps.push(op);
        }
        currentOp = op;
        batchStartIndex = index;
      }
    }

    // 最後のバッチを処理
    if (currentBatch.length > 0) {
      if (currentOp.op === 'remove') {
        optimizedOps.push({
          op: 'remove',
          path: currentOp.path,
          count: currentBatch.length,
        });
      } else {
        optimizedOps.push({
          op: currentOp.op,
          path: currentOp.path,
          value:
            currentBatch.length === 1 ? currentBatch[0] : [...currentBatch],
        });
      }
    }

    return optimizedOps;
  }

  return operations;
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
