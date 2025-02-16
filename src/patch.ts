import { PatchError, PatchErrorCode } from './errors';
import { JsonPatch, JsonPatchOperation } from './types';
import { getValueByPointer, setValueByPointer, removeByPointer } from './utils';
import {
  validateJsonPointer,
  deepEqual,
  deepClone,
  detectCircular,
} from './validate';

export interface PatchOptions {
  /**
   * Validate the patch before applying
   * @default true
   */
  validate?: boolean;

  /**
   * Check for circular references
   * @default true
   */
  checkCircular?: boolean;

  /**
   * Maximum depth for recursive operations
   * @default 100
   */
  maxDepth?: number;
}

const defaultOptions: Required<PatchOptions> = {
  validate: true,
  checkCircular: true,
  maxDepth: 100,
};

function validateArrayIndex(
  current: any[],
  index: number,
  path: string,
  operation: string
): void {
  if (isNaN(index) || index < 0) {
    throw PatchError.arrayIndexError(path, String(index));
  }

  // 'add'操作の場合は配列の長さまでのインデックスを許可
  if (operation === 'add' && index > current.length) {
    throw PatchError.arrayIndexError(path, String(index));
  }
  // その他の操作では配列の範囲内のインデックスのみ許可
  else if (operation !== 'add' && index >= current.length) {
    throw PatchError.arrayIndexError(path, String(index));
  }
}

function handleAddOperation(target: any, path: string, value: any): void {
  const segments = path.split('/').slice(1);
  let current = target;

  for (let i = 0; i < segments.length - 1; i++) {
    const segment = segments[i];
    if (!(segment in current)) {
      current[segment] = /^\d+$/.test(segments[i + 1]) ? [] : {};
    }
    current = current[segment];
  }

  const lastSegment = segments[segments.length - 1];
  if (Array.isArray(current)) {
    if (lastSegment === '-') {
      if (Array.isArray(value)) {
        current.push(...value);
      } else {
        current.push(value);
      }
    } else {
      const index = parseInt(lastSegment, 10);
      validateArrayIndex(current, index, path, 'add');
      if (Array.isArray(value)) {
        current.splice(index, 0, ...value);
      } else {
        current.splice(index, 0, value);
      }
    }
  } else {
    current[lastSegment] = value;
  }
}

function handleRemoveOperation(
  target: any,
  path: string,
  op: JsonPatchOperation
): void {
  const segments = path.split('/').slice(1);
  let current = target;

  // 親要素まで移動
  for (let i = 0; i < segments.length - 1; i++) {
    const segment = segments[i];
    if (!(segment in current)) {
      throw PatchError.invalidPointer(path);
    }
    current = current[segment];
  }

  const lastSegment = segments[segments.length - 1];
  if (Array.isArray(current)) {
    if (lastSegment === '-') {
      throw PatchError.arrayIndexError(path, lastSegment);
    }
    const index = parseInt(lastSegment, 10);
    validateArrayIndex(current, index, path, 'remove');
    const count = (op as any).count || 1;
    if (index + count > current.length) {
      throw PatchError.arrayIndexError(path, String(index + count - 1));
    }
    const removed = current.splice(index, count);
    // 削除した要素を返す（逆パッチ生成のために必要）
    return removed.length === 1 ? removed[0] : removed;
  } else {
    if (!(lastSegment in current)) {
      throw PatchError.invalidPointer(path);
    }
    const removed = current[lastSegment];
    delete current[lastSegment];
    // 削除した要素を返す（逆パッチ生成のために必要）
    return removed;
  }
}

function handleReplaceOperation(target: any, path: string, value: any): void {
  const oldValue = removeByPointer(target, path);
  if (oldValue === undefined) {
    throw PatchError.invalidPointer(path);
  }
  setValueByPointer(target, path, value);
}

function handleMoveOperation(target: any, path: string, from?: string): void {
  if (!from) {
    throw PatchError.missingField('move', 'from');
  }
  validateJsonPointer(from);

  // Ensure 'from' path is not a prefix of 'path'
  if (path.startsWith(from + '/')) {
    throw new PatchError(
      PatchErrorCode.INVALID_OPERATION,
      `'move' operation: 'from' path cannot be a prefix of 'path'`
    );
  }

  const valueToMove = getValueByPointer(target, from);
  if (valueToMove === undefined) {
    throw PatchError.invalidPointer(from);
  }
  removeByPointer(target, from);
  setValueByPointer(target, path, valueToMove);
}

function handleCopyOperation(target: any, path: string, from?: string): void {
  if (!from) {
    throw PatchError.missingField('copy', 'from');
  }
  validateJsonPointer(from);
  const val = getValueByPointer(target, from);
  if (val === undefined) {
    throw PatchError.invalidPointer(from);
  }
  setValueByPointer(target, path, deepClone(val));
}

function handleTestOperation(target: any, path: string, value: any): void {
  const currentVal = getValueByPointer(target, path);
  if (currentVal === undefined) {
    throw PatchError.invalidPointer(path);
  }
  if (!deepEqual(currentVal, value)) {
    throw PatchError.testFailed(path, value, currentVal);
  }
}

function validatePathDepth(path: string, maxDepth?: number): void {
  if (maxDepth === undefined) return;

  const depth = path.split('/').length - 1;
  if (depth > maxDepth) {
    throw new PatchError(
      PatchErrorCode.MAX_DEPTH_EXCEEDED,
      `Maximum path depth of ${maxDepth} exceeded: ${path}`
    );
  }
}

/**
 * Applies a single operation to the target object
 */
export function applyOperation(
  target: any,
  op: JsonPatchOperation,
  options: PatchOptions = {}
): void {
  const {
    checkCircular = true,
    maxDepth,
    validate = true,
  } = {
    ...defaultOptions,
    ...options,
  };
  const { op: operation, path, from, value } = op;

  // validate: true の場合のみ実行する検証
  if (validate) {
    if (!operation) {
      throw PatchError.invalidOperation('undefined');
    }

    if (!path && operation !== 'test') {
      throw PatchError.missingField(operation || 'undefined', 'path');
    }

    // 必須フィールドの検証
    if (operation !== 'remove' && operation !== 'test' && value === undefined) {
      if (operation === 'add' || operation === 'replace') {
        throw PatchError.missingField(operation, 'value');
      }
    }

    if ((operation === 'move' || operation === 'copy') && !from) {
      throw PatchError.missingField(operation, 'from');
    }

    if (path) {
      validateJsonPointer(path);
      validatePathDepth(path, maxDepth);
    }

    // Check for circular references
    if (checkCircular && value !== undefined && detectCircular(value)) {
      throw PatchError.circularReference(path || '/');
    }

    // Validate 'from' path depth for move/copy operations
    if ((operation === 'move' || operation === 'copy') && from) {
      validateJsonPointer(from);
      validatePathDepth(from, maxDepth);
    }
  }

  // 操作の実行
  try {
    switch (operation) {
      case 'add':
        handleAddOperation(target, path, value);
        break;

      case 'remove':
        handleRemoveOperation(target, path, op);
        break;

      case 'replace':
        handleReplaceOperation(target, path, value);
        break;

      case 'move':
        handleMoveOperation(target, path, from);
        break;

      case 'copy':
        handleCopyOperation(target, path, from);
        break;

      case 'test':
        handleTestOperation(target, path, value);
        break;

      default:
        if (validate) {
          throw PatchError.invalidOperation(operation || 'undefined');
        }
    }
  } catch (error) {
    if (error instanceof PatchError) {
      throw error;
    }
    throw new PatchError(
      PatchErrorCode.INTERNAL_ERROR,
      `Internal error: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Applies multiple operations sequentially
 */
export function applyPatch(
  target: any,
  patch: JsonPatch,
  options: PatchOptions = {}
): void {
  const opts = { ...defaultOptions, ...options };

  // パッチの基本的な検証
  if (!Array.isArray(patch)) {
    throw new PatchError(
      PatchErrorCode.INVALID_PATCH,
      'Patch must be an array of operations'
    );
  }

  // 各操作を順番に適用
  for (const op of patch) {
    try {
      applyOperation(target, op, opts);
    } catch (error) {
      if (error instanceof PatchError) {
        throw error;
      }
      throw new PatchError(
        PatchErrorCode.INTERNAL_ERROR,
        `Internal error: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}

/**
 * Applies patch immutably, returning a new object
 */
export function applyPatchImmutable<T>(
  target: T,
  patch: JsonPatch,
  options: PatchOptions = {}
): T {
  const clone = deepClone(target);
  applyPatch(clone, patch, options);
  return clone;
}

/**
 * Applies patch with automatic rollback on failure
 */
export function applyPatchWithRollback(
  target: any,
  patch: JsonPatch,
  options: PatchOptions = {}
): void {
  const opts = { ...defaultOptions, ...options };
  const originalState = deepClone(target);
  const appliedOps: JsonPatchOperation[] = [];

  try {
    // パッチの基本的な検証
    if (!Array.isArray(patch)) {
      throw new PatchError(
        PatchErrorCode.INVALID_PATCH,
        'Patch must be an array of operations'
      );
    }

    // 各操作を順番に適用
    for (const op of patch) {
      try {
        applyOperation(target, op, opts);
        appliedOps.push(op);
      } catch (error) {
        // ロールバック処理
        for (let i = appliedOps.length - 1; i >= 0; i--) {
          const appliedOp = appliedOps[i];
          try {
            // 逆操作を適用
            switch (appliedOp.op) {
              case 'add':
                handleRemoveOperation(target, appliedOp.path, appliedOp);
                break;
              case 'remove':
                handleAddOperation(target, appliedOp.path, appliedOp.value);
                break;
              case 'replace':
                handleReplaceOperation(
                  target,
                  appliedOp.path,
                  getValueByPointer(originalState, appliedOp.path)
                );
                break;
              case 'move':
                if (appliedOp.from) {
                  handleMoveOperation(target, appliedOp.from, appliedOp.path);
                }
                break;
              case 'copy':
                handleRemoveOperation(target, appliedOp.path, appliedOp);
                break;
              case 'test':
                // テスト操作はロールバック不要
                break;
            }
          } catch (rollbackError) {
            // ロールバックに失敗した場合は元の状態に復元
            Object.assign(target, deepClone(originalState));
            throw new PatchError(
              PatchErrorCode.INTERNAL_ERROR,
              'Failed to rollback changes'
            );
          }
        }

        // 元のエラーを再スロー
        if (error instanceof PatchError) {
          throw error;
        }
        throw new PatchError(
          PatchErrorCode.INTERNAL_ERROR,
          `Internal error: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  } catch (error) {
    // 外側のtryブロックでもエラーをキャッチして状態を復元
    Object.assign(target, deepClone(originalState));
    throw error;
  }
}
