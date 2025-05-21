import { PatchError, PatchErrorCode } from './errors';
import { applyOperation } from './patch';
import { JsonPatch, BatchRemoveOperation } from './types';
import { getValueByPointer } from './utils';
import { deepClone } from './validate';

/**
 * Normalizes array paths by converting '-' to the actual index
 */
function normalizeArrayPath(target: any, path: string): string {
  const segments = path.split('/');
  if (segments[segments.length - 1] === '-') {
    const parent = segments.slice(0, -1).reduce((obj, segment, i) => {
      return i === 0 ? obj : obj[segment];
    }, target);
    if (Array.isArray(parent)) {
      segments[segments.length - 1] = String(parent.length);
    }
  }
  return segments.join('/');
}

function validateArrayIndex(
  array: any[],
  index: number,
  path: string,
  isAdd: boolean = false
): void {
  if (isNaN(index) || index < 0) {
    throw PatchError.arrayIndexError(path, String(index));
  }
  // add操作の場合は配列の長さまでのインデックスを許可
  if (isAdd) {
    if (index > array.length) {
      throw PatchError.arrayIndexError(path, String(index));
    }
  } else {
    if (index >= array.length) {
      throw PatchError.arrayIndexError(path, String(index));
    }
  }
}

export interface InverseOptions {
  batchArrayOps?: boolean;
  validate?: boolean;
  checkCircular?: boolean;
  maxDepth?: number;
}

const defaultOptions: Required<InverseOptions> = {
  batchArrayOps: true,
  validate: true,
  checkCircular: true,
  maxDepth: 100,
};

/**
 * Creates an inverse patch that will undo the effects of the original patch
 */
export function createInversePatch(
  originalState: any,
  patch: JsonPatch,
  options: InverseOptions = {}
): JsonPatch {
  const inverse: JsonPatch = [];
  const { batchArrayOps = true } = options;

  // パッチを逆順に処理し、深さ優先で適用
  for (let i = patch.length - 1; i >= 0; i--) {
    const operation = patch[i];
    const normalizedPath = normalizeArrayPath(originalState, operation.path);
    const pathSegments = normalizedPath.split('/');
    const parentPath =
      pathSegments.length > 1 ? pathSegments.slice(0, -1).join('/') : '';

    // 親パスが存在するか確認
    const parent =
      parentPath === ''
        ? originalState
        : getValueByPointer(originalState, parentPath);
    if (parent === undefined) {
      throw PatchError.pathNotFound(parentPath || '/');
    }

    // 配列操作の特別な処理
    if (Array.isArray(parent)) {
      const lastSegment = pathSegments[pathSegments.length - 1];
      const index = parseInt(lastSegment, 10);

      switch (operation.op) {
        case 'add': {
          validateArrayIndex(parent, index, normalizedPath, true);
          if (batchArrayOps) {
            const count = Array.isArray(operation.value)
              ? operation.value.length
              : 1;
            inverse.push({
              op: 'remove',
              path: normalizedPath,
              ...(count > 1 && { count }),
            });
          } else {
            // 配列操作の最適化が無効の場合は個別の操作を生成
            if (Array.isArray(operation.value)) {
              for (let i = operation.value.length - 1; i >= 0; i--) {
                inverse.push({
                  op: 'remove',
                  path: `${normalizedPath.slice(0, normalizedPath.lastIndexOf('/'))}/${index + i}`,
                });
              }
            } else {
              inverse.push({
                op: 'remove',
                path: normalizedPath,
              });
            }
          }
          break;
        }
        case 'remove': {
          validateArrayIndex(parent, index, normalizedPath);
          const count = (operation as BatchRemoveOperation).count || 1;
          const values = parent.slice(index, index + count);
          if (batchArrayOps) {
            inverse.push({
              op: 'add',
              path: normalizedPath,
              value: count === 1 ? values[0] : values,
            });
          } else {
            // 配列操作の最適化が無効の場合は個別の操作を生成
            for (let i = values.length - 1; i >= 0; i--) {
              inverse.push({
                op: 'add',
                path: `${normalizedPath.slice(0, normalizedPath.lastIndexOf('/'))}/${index}`,
                value: values[i],
              });
            }
          }
          break;
        }
        case 'move': {
          if (!operation.from) {
            throw PatchError.missingField('move', 'from');
          }
          const fromPath = normalizeArrayPath(originalState, operation.from);
          const toPath = normalizeArrayPath(originalState, normalizedPath);

          // 移動元の値を確認
          const value = getValueByPointer(originalState, fromPath);
          if (value === undefined) {
            throw PatchError.pathNotFound(fromPath);
          }

          // 移動先のパスが移動元のパスのプレフィックスでないことを確認
          if (toPath.startsWith(fromPath + '/')) {
            throw new PatchError(
              PatchErrorCode.INVALID_OPERATION,
              `'move' operation: destination path cannot be a prefix of source path`
            );
          }

          // 移動先の親パスを検証
          const toSegments = toPath.split('/').filter(Boolean);
          if (toSegments.length > 0) {
            let current = originalState;

            // 親パスが存在するか確認し、必要に応じて作成
            if (toSegments.length > 1) {
              for (let i = 0; i < toSegments.length - 1; i++) {
                const segment = toSegments[i];
                const parentPath = '/' + toSegments.slice(0, i + 1).join('/');
                let parent = getValueByPointer(originalState, parentPath);

                if (parent === undefined) {
                  // 次のセグメントが数値の場合は配列を作成、そうでない場合はオブジェクトを作成
                  const nextSegment = toSegments[i + 1];
                  const newValue = /^\d+$/.test(nextSegment) ? [] : {};

                  if (i === 0) {
                    originalState[segment] = newValue;
                    parent = newValue;
                  } else {
                    const prevParent = getValueByPointer(
                      originalState,
                      '/' + toSegments.slice(0, i).join('/')
                    );
                    if (prevParent) {
                      prevParent[segment] = newValue;
                      parent = newValue;
                    }
                  }
                }
                current = parent;
              }
            }

            // 移動先に値を設定
            const lastSegment = toSegments[toSegments.length - 1];
            const valueCopy = deepClone(value); // 値のディープコピーを作成

            if (Array.isArray(current)) {
              const index = parseInt(lastSegment, 10);
              validateArrayIndex(current, index, toPath, true);
              current.splice(index, 0, valueCopy);
            } else {
              current[lastSegment] = valueCopy;
            }

            // 移動元の値を削除（移動先の値を設定した後に削除）
            const fromSegments = fromPath.split('/').filter(Boolean);
            const fromParent =
              fromSegments.length > 1
                ? getValueByPointer(
                    originalState,
                    '/' + fromSegments.slice(0, -1).join('/')
                  )
                : originalState;
            const fromLastSegment = fromSegments[fromSegments.length - 1];

            if (Array.isArray(fromParent)) {
              const fromIndex = parseInt(fromLastSegment, 10);
              validateArrayIndex(fromParent, fromIndex, fromPath);
              fromParent.splice(fromIndex, 1);
            } else {
              delete fromParent[fromLastSegment];
            }

            // 逆操作を生成
            inverse.push({
              op: 'move',
              path: fromPath,
              from: toPath,
            });
          } else {
            // ルートパスへの移動の場合
            const valueCopy = deepClone(value);
            originalState = valueCopy;

            // 移動元の値を削除
            const fromSegments = fromPath.split('/').filter(Boolean);
            const fromParent =
              fromSegments.length > 1
                ? getValueByPointer(
                    originalState,
                    '/' + fromSegments.slice(0, -1).join('/')
                  )
                : originalState;
            const fromLastSegment = fromSegments[fromSegments.length - 1];

            if (Array.isArray(fromParent)) {
              const fromIndex = parseInt(fromLastSegment, 10);
              validateArrayIndex(fromParent, fromIndex, fromPath);
              fromParent.splice(fromIndex, 1);
            } else {
              delete fromParent[fromLastSegment];
            }

            // 逆操作を生成
            inverse.push({
              op: 'move',
              path: fromPath,
              from: toPath,
            });
          }
          break;
        }
        case 'replace': {
          const originalValue = getValueByPointer(
            originalState,
            normalizedPath
          );
          if (originalValue === undefined) {
            throw PatchError.pathNotFound(normalizedPath);
          }
          inverse.push({
            op: 'replace',
            path: normalizedPath,
            value: deepClone(originalValue),
          });
          break;
        }
        case 'copy':
        case 'test':
          continue;
        default:
          throw PatchError.invalidOperation(String(operation.op));
      }
    } else {
      // 非配列操作の処理
      switch (operation.op) {
        case 'add': {
          inverse.push({
            op: 'remove',
            path: normalizedPath,
          });
          break;
        }
        case 'remove': {
          const originalValue = getValueByPointer(
            originalState,
            normalizedPath
          );
          if (originalValue === undefined) {
            throw PatchError.pathNotFound(normalizedPath);
          }
          inverse.push({
            op: 'add',
            path: normalizedPath,
            value: deepClone(originalValue),
          });
          break;
        }
        case 'replace': {
          const originalValue = getValueByPointer(
            originalState,
            normalizedPath
          );
          if (originalValue === undefined) {
            throw PatchError.pathNotFound(normalizedPath);
          }
          inverse.push({
            op: 'replace',
            path: normalizedPath,
            value: deepClone(originalValue),
          });
          break;
        }
        case 'move': {
          if (!operation.from) {
            throw PatchError.missingField('move', 'from');
          }
          // 移動元パスの存在を確認
          const fromValue = getValueByPointer(originalState, operation.from);
          if (fromValue === undefined) {
            throw PatchError.pathNotFound(operation.from);
          }

          // 移動先パスの存在を確認 (Removed as per request)
          // const toValue = getValueByPointer(originalState, normalizedPath);
          // if (toValue === undefined) {
          //   throw PatchError.pathNotFound(normalizedPath);
          // }

          const inverseToPath = normalizeArrayPath(originalState, operation.from); // Original operation's source
          const inverseFromPath = normalizedPath; // Original operation's destination
          inverse.push({
            op: 'move',
            path: inverseToPath,
            from: inverseFromPath,
          });
          break;
        }
        case 'copy':
        case 'test':
          continue;
        default:
          throw PatchError.invalidOperation(String(operation.op));
      }
    }
  }

  // 配列操作の最適化
  if (batchArrayOps) {
    optimizeArrayOperations(inverse);
  }

  return inverse;
}

/**
 * 配列操作を最適化する
 */
function optimizeArrayOperations(patch: JsonPatch): void {
  // 連続する配列操作をマージ
  for (let i = patch.length - 1; i > 0; i--) {
    const current = patch[i];
    const prev = patch[i - 1];

    if (
      current.op === 'add' &&
      prev.op === 'add' &&
      current.path === prev.path &&
      Array.isArray(current.value) &&
      Array.isArray(prev.value)
    ) {
      // 連続するadd操作をマージ
      prev.value = [...prev.value, ...current.value];
      patch.splice(i, 1);
    } else if (
      current.op === 'remove' &&
      prev.op === 'remove' &&
      current.path === prev.path
    ) {
      // 連続するremove操作をマージ
      const currentCount = (current as BatchRemoveOperation).count || 1;
      const prevCount = (prev as BatchRemoveOperation).count || 1;
      (prev as BatchRemoveOperation).count = prevCount + currentCount;
      patch.splice(i, 1);
    } else if (
      current.op === 'add' &&
      prev.op === 'add' &&
      current.path.slice(0, current.path.lastIndexOf('/')) ===
        prev.path.slice(0, prev.path.lastIndexOf('/'))
    ) {
      // 同じ配列への連続するadd操作を個別の操作として保持
      const currentIndex = parseInt(
        current.path.slice(current.path.lastIndexOf('/') + 1),
        10
      );
      const prevIndex = parseInt(
        prev.path.slice(prev.path.lastIndexOf('/') + 1),
        10
      );
      if (currentIndex === prevIndex + 1) {
        // インデックスが連続している場合はマージ
        if (Array.isArray(prev.value)) {
          prev.value = [...prev.value, current.value];
        } else {
          prev.value = [prev.value, current.value];
        }
        patch.splice(i, 1);
      }
    }
  }
}

/**
 * Applies a patch and returns its inverse patch
 */
export function applyPatchWithInverse(
  target: any,
  patch: JsonPatch,
  options: InverseOptions = {}
): JsonPatch {
  const opts = { ...defaultOptions, ...options };
  const original = deepClone(target);
  const inversePatch = createInversePatch(original, patch, opts);

  try {
    for (const op of patch) {
      applyOperation(target, op, opts);
    }
  } catch (error) {
    // エラーが発生した場合は、元の状態に戻す
    Object.assign(target, original);
    throw error;
  }

  return inversePatch;
}
