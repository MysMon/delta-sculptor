import { JsonPatch, JsonPatchOperation } from "./types";
import {
  getValueByPointer,
  setValueByPointer,
  removeValueByPointer
} from "./utils";

/**
 * 単一の Operation を適用し、オブジェクトを破壊的に更新する
 */
export function applyOperation(target: any, op: JsonPatchOperation): void {
  const { op: operation, path, from, value } = op;

  switch (operation) {
    case "add":
      setValueByPointer(target, path, value);
      break;
    case "remove":
      removeValueByPointer(target, path);
      break;
    case "replace":
      // remove + add のようなもの
      removeValueByPointer(target, path);
      setValueByPointer(target, path, value);
      break;
    case "move": {
      if (from === undefined) {
        throw new Error("'move' operation requires 'from' field.");
      }
      const val = getValueByPointer(target, from);
      removeValueByPointer(target, from);
      setValueByPointer(target, path, val);
      break;
    }
    case "copy": {
      if (from === undefined) {
        throw new Error("'copy' operation requires 'from' field.");
      }
      const val = getValueByPointer(target, from);
      // null や undefined のコピーもそのまま
      setValueByPointer(target, path, val);
      break;
    }
    case "test": {
      // 現在の値と value を比較し、一致しなければエラー
      const currentVal = getValueByPointer(target, path);
      const pass = isEquivalent(currentVal, value);
      if (!pass) {
        throw new Error(
          `Test operation failed at path: ${path} (expected: ${JSON.stringify(
            value
          )}, actual: ${JSON.stringify(currentVal)})`
        );
      }
      break;
    }
    default:
      throw new Error(`Unsupported operation: ${(op as any).op}`);
  }
}

/**
 * 複数の Operation (JsonPatch) を順に適用
 */
export function applyPatch(target: any, patch: JsonPatch): void {
  for (const op of patch) {
    applyOperation(target, op);
  }
}

/**
 * JSON 値同士の深い等価比較 (test operation用)
 * ここでは単純に JSON.stringify を使う簡易実装
 */
function isEquivalent(a: any, b: any): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * 非破壊的にパッチを適用し、新しいオブジェクトを返す
 * @param target 元オブジェクト
 * @param patch 適用パッチ
 * @returns 新しいオブジェクト
 */
export function applyPatchImmutable<T>(target: T, patch: JsonPatch): T {
  // シンプルにディープコピーして applyPatch
  const clone = cloneDeep(target);
  applyPatch(clone, patch);
  return clone;
}

/**
 * パッチ適用を行い、失敗時にロールバック（状態を戻す）する高レベル関数
 * ここでは apply 前にコピーを取り、エラー時はコピーを戻す。
 */
export function applyPatchWithRollback<T extends object>(
  target: T,
  patch: JsonPatch
): void {
  const backup = cloneDeep(target);
  try {
    applyPatch(target, patch);
  } catch (e) {
    // ロールバック
    Object.keys(target).forEach(k => delete (target as any)[k]);
    Object.assign(target, backup);
    throw e;
  }
}

/** 簡易ディープコピー*/
function cloneDeep<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}