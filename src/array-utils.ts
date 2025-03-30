import { PatchError, PatchErrorCode } from './errors';
import {
  JsonPatch,
  BatchAddOperation,
  BatchRemoveOperation,
  ArrayOperation,
} from './types';
import { deepEqual, validateArrayIndex } from './utils';

function buildArrayPath(basePath: string, index: number): string {
  return basePath === '' ? `/${index}` : `${basePath}/${index}`;
}

interface JsonPatchOptions {
  basePath: string;
}

export function toJsonPatch(
  operations: ArrayOperation[],
  options: JsonPatchOptions = { basePath: '' }
): JsonPatch {
  const basePath = options.basePath;
  return operations.map(op => {
    const path = buildArrayPath(basePath, op.index);

    switch (op.type) {
      case 'add':
        return {
          op: 'add',
          path,
          value: op.value,
        };
      case 'remove':
        if (op.count && op.count > 1) {
          return {
            op: 'remove',
            path,
            count: op.count,
          };
        }
        return {
          op: 'remove',
          path,
        };
      case 'move':
        if (op.from === undefined) {
          throw new PatchError(
            PatchErrorCode.MISSING_REQUIRED_FIELD,
            'From path is required for move operation'
          );
        }
        const fromPath = buildArrayPath(basePath, op.from);
        return {
          op: 'move',
          path,
          from: fromPath,
        };
      default:
        throw new PatchError(
          PatchErrorCode.INVALID_OPERATION,
          `Unknown operation type: ${(op as any).type}`
        );
    }
  });
}

/**
 * Validates array indices in patch operations
 */
export { validateArrayIndex };

/**
 * Generates array operations that transform source array into target array
 */
export function generateArrayOperations(
  oldArr: unknown[],
  newArr: unknown[]
): ArrayOperation[] {
  let operations: ArrayOperation[] = [];
  const valueToNewIndex = new Map<unknown, number>();
  const valueToOldIndex = new Map<unknown, number>();

  // 新しい配列の値とインデックスをマッピング
  newArr.forEach((value, index) => {
    valueToNewIndex.set(value, index);
  });

  // 古い配列の値とインデックスをマッピング
  oldArr.forEach((value, index) => {
    valueToOldIndex.set(value, index);
  });

  // 作業用の配列を準備
  const result = [...oldArr];

  // 移動と削除の計画を作成
  const moves: { value: unknown; from: number; to: number }[] = [];
  const removes: number[] = [];

  // 新しい配列の順序で処理を計画
  for (let i = 0; i < result.length; i++) {
    const value = result[i];
    if (!valueToNewIndex.has(value)) {
      // 削除対象
      removes.push(i);
    } else {
      const targetIndex = valueToNewIndex.get(value)!;
      if (i !== targetIndex) {
        moves.push({ value, from: i, to: targetIndex });
      }
    }
  }

  // 削除は後ろから実行して、インデックスのずれを防ぐ
  removes.reverse().forEach(index => {
    operations.push({
      type: 'remove',
      index,
      count: 1,
    });
    result.splice(index, 1);
  });

  // 移動の依存関係を考慮して順序を最適化
  moves.sort((a, b) => {
    // 移動先インデックスが小さい順に処理
    if (a.to !== b.to) {
      return a.to - b.to;
    }
    // 同じ移動先の場合は、移動元が大きい方を先に
    return b.from - a.from;
  });

  // 移動を実行
  for (const move of moves) {
    const currentIndex = result.indexOf(move.value);
    if (currentIndex !== -1 && currentIndex !== move.to) {
      operations.push({
        type: 'move',
        from: currentIndex,
        index: move.to,
      });
      const [movedValue] = result.splice(currentIndex, 1);
      result.splice(move.to, 0, movedValue);
    }
  }

  // 追加操作を実行
  const toAdd = newArr.filter(value => !valueToOldIndex.has(value));
  toAdd.forEach(value => {
    const targetIndex = newArr.indexOf(value);
    operations.push({
      type: 'add',
      index: targetIndex,
      value,
    });
    result.splice(targetIndex, 0, value);
  });

  // 結果を検証 - 個別操作を生成するように変更
  if (!deepEqual(result, newArr)) {
    operations = [];
    // 古い要素を後ろから削除
    for (let i = oldArr.length - 1; i >= 0; i--) {
      operations.push({
        type: 'remove',
        index: i,
        count: 1,
      });
    }
    // 新しい要素を前から追加
    newArr.forEach((value, i) => {
      operations.push({
        type: 'add',
        index: i,
        value,
      });
    });
  }

  return operations;
}

/**
 * Optimizes array operations by detecting moves and combining operations
 */
export function optimizeArrayOperations(
  operations: ArrayOperation[]
): ArrayOperation[] {
  const optimized: ArrayOperation[] = [];
  let i = 0;

  while (i < operations.length) {
    const current = operations[i];

    // Check for remove+add pattern that can be converted to move
    if (
      current.type === 'remove' &&
      i + 1 < operations.length &&
      operations[i + 1].type === 'add'
    ) {
      const removeOp = current;
      const addOp = operations[i + 1];

      // Convert to move operation
      optimized.push({
        type: 'move',
        index: addOp.index,
        from: removeOp.index,
        value: addOp.value,
      });
      i += 2;
      continue;
    }

    optimized.push(current);
    i++;
  }

  return optimized;
}

export type BatchedOperation = BatchAddOperation | BatchRemoveOperation;

export function batchArrayOperations(
  operations: ArrayOperation[],
  maxBatchSize: number = 10
): JsonPatch {
  const result: JsonPatch = [];
  let i = 0;

  while (i < operations.length) {
    const current = operations[i];

    if (current.type === 'add') {
      // 連続するadd操作を収集
      const values = [current.value];
      let j = i + 1;

      while (
        j < operations.length &&
        operations[j].type === 'add' &&
        operations[j].index === current.index + values.length &&
        values.length < maxBatchSize
      ) {
        values.push(operations[j].value);
        j++;
      }

      // バッチ処理せずに個別のadd操作を生成
      values.forEach((value, offset) => {
        result.push({
          op: 'add',
          path: `/${current.index + offset}`,
          value,
        });
      });

      i = j;
      continue;
    }

    if (current.type === 'remove') {
      // 連続するremove操作を収集
      let count = current.count || 1;
      let j = i + 1;

      while (
        j < operations.length &&
        operations[j].type === 'remove' &&
        (operations[j].index === current.index - count ||
          operations[j].index === current.index) &&
        count < maxBatchSize
      ) {
        count += operations[j].count || 1;
        j++;
      }

      // 単一の削除操作として出力
      result.push({
        op: 'remove',
        path: `/${current.index - count + 1}`,
        ...(count > 1 ? { count } : {}),
      });

      i = j;
      continue;
    }

    if (current.type === 'move') {
      result.push({
        op: 'move',
        path: `/${current.index}`,
        from: `/${current.from}`,
      });
      i++;
      continue;
    }

    i++;
  }

  return result;
}

/**
 * Optimizes JSON Patch operations by detecting moves
 */
export function optimizeJsonPatch(patch: JsonPatch): JsonPatch {
  const arrayOps = convertJsonPatchToArrayOps(patch);
  const optimizedOps = optimizeArrayOperations(arrayOps);
  return toJsonPatch(optimizedOps, { basePath: '' });
}

function convertJsonPatchToArrayOps(patch: JsonPatch): ArrayOperation[] {
  return patch.map(op => {
    const path = op.path;
    const segments = path.split('/');
    const index = parseInt(segments[segments.length - 1], 10);

    switch (op.op) {
      case 'add':
        return {
          type: 'add',
          index,
          value: op.value,
        };
      case 'remove':
        return {
          type: 'remove',
          index,
          count: (op as BatchRemoveOperation).count || 1,
        };
      case 'move':
        if (!op.from) {
          throw new PatchError(
            PatchErrorCode.MISSING_REQUIRED_FIELD,
            'From path is required for move operation'
          );
        }
        const fromSegments = op.from.split('/');
        const fromIndex = parseInt(fromSegments[fromSegments.length - 1], 10);
        return {
          type: 'move',
          index,
          from: fromIndex,
          value: undefined,
        };
      default:
        return {
          type: 'add',
          index,
          value: 'value' in op ? op.value : undefined,
        };
    }
  });
}

/**
 * Gets array path information from a JSON Pointer path
 */
export function getArrayPath(
  path: string
): { basePath: string; index: string } | null {
  const match = /^(.*?)\/(-|\d+)$/.exec(path);
  if (!match) return null;

  return {
    basePath: match[1],
    index: match[2],
  };
}

/**
 * Gets the base path for an array and its index
 */
export function getArrayBasePath(path: string): string {
  const lastSlash = path.lastIndexOf('/');
  return lastSlash >= 0 ? path.slice(0, lastSlash) : '';
}

/**
 * Checks if a path refers to an array element
 */
export function isArrayPath(path: string): boolean {
  const lastSegment = path.split('/').pop();
  return lastSegment === '-' || /^\d+$/.test(lastSegment ?? '');
}

/**
 * Splits batched array operations into individual operations
 */
export function expandArrayOperations(patch: JsonPatch): JsonPatch {
  const expanded: JsonPatch = [];

  for (const op of patch) {
    if (op.op === 'remove' && 'count' in op && typeof op.count === 'number') {
      // Expand batch remove into individual removes
      const arrayPath = getArrayPath(op.path);
      if (!arrayPath) {
        expanded.push(op);
        continue;
      }

      const { basePath, index } = arrayPath;
      const startIndex = parseInt(index, 10);

      for (let i = 0; i < op.count; i++) {
        expanded.push({
          op: 'remove',
          path: `${basePath}/${startIndex}`,
        });
      }
    } else if (op.op === 'add' && 'value' in op) {
      const value = op.value;
      if (Array.isArray(value)) {
        // Expand batch add into individual adds
        const arrayPath = getArrayPath(op.path);
        if (!arrayPath) {
          expanded.push(op);
          continue;
        }

        const { basePath, index } = arrayPath;
        const startIndex =
          index === '-'
            ? Infinity // Will be converted to actual index when applying
            : parseInt(index, 10);

        value.forEach((item, i) => {
          expanded.push({
            op: 'add',
            path: `${basePath}/${startIndex + i}`,
            value: item,
          });
        });
      } else {
        expanded.push(op);
      }
    } else {
      expanded.push(op);
    }
  }

  return expanded;
}

export type { ArrayOperation };
