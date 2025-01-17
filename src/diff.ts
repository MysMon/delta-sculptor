import { JsonPatch, JsonPatchOperation } from "./types";
import { escapePointerSegment } from "./utils";

/**
 * createDiffOptions
 * - detectMove: 配列の移動を検出して "move" として表現する（簡易版）
 * - ...
 */
export interface CreateDiffOptions {
  detectMove?: boolean;
  // move/copy をさらに検出したい場合は別途フラグを追加
}

/**
 * 2つのオブジェクトを比較して JSON Patch を生成する
 */
export function createPatch(
  oldObj: any,
  newObj: any,
  basePath: string = "",
  options: CreateDiffOptions = {}
): JsonPatch {
  const patch: JsonPatch = [];

  // 両方がプリミティブ or どちらかが null/undefined の場合
  if (!isObject(oldObj) || !isObject(newObj)) {
    // 値が同じなら変更なし
    if (oldObj === newObj) {
      return patch;
    }
    // 違えば replace or add/remove
    if (typeof oldObj === "undefined") {
      patch.push({
        op: "add",
        path: basePath || "/",
        value: newObj,
      });
    } else if (typeof newObj === "undefined") {
      patch.push({
        op: "remove",
        path: basePath || "/",
      });
    } else {
      patch.push({
        op: "replace",
        path: basePath || "/",
        value: newObj,
      });
    }
    return patch;
  }

  // 両方オブジェクト/配列
  if (Array.isArray(oldObj) && Array.isArray(newObj)) {
    // 配列同士の差分
    // detectMove オプションがオンなら移動を検出
    if (options.detectMove) {
      patch.push(...diffArrayWithMoveDetection(oldObj, newObj, basePath));
    } else {
      patch.push(...diffArrayNaive(oldObj, newObj, basePath));
    }
  } else if (!Array.isArray(oldObj) && !Array.isArray(newObj)) {
    // オブジェクト同士
    const oldKeys = Object.keys(oldObj);
    const newKeys = Object.keys(newObj);

    // 削除されたキー
    for (const key of oldKeys) {
      if (!newKeys.includes(key)) {
        patch.push({
          op: "remove",
          path: concatPath(basePath, key),
        });
      }
    }

    // 追加 or 更新されたキー
    for (const key of newKeys) {
      if (!oldKeys.includes(key)) {
        // add
        patch.push({
          op: "add",
          path: concatPath(basePath, key),
          value: newObj[key],
        });
      } else {
        // 再帰的に比較
        patch.push(
          ...createPatch(
            oldObj[key],
            newObj[key],
            concatPath(basePath, key),
            options
          )
        );
      }
    }
  } else {
    // 片方が配列、もう片方がオブジェクトの場合は全置換
    if (JSON.stringify(oldObj) !== JSON.stringify(newObj)) {
      patch.push({
        op: "replace",
        path: basePath || "/",
        value: newObj,
      });
    }
  }

  return patch;
}

/**
 * 配列の差分をナイーブに生成 (add/remove/replace)
 * move は検出しない
 */
function diffArrayNaive(
  oldArr: any[],
  newArr: any[],
  basePath: string
): JsonPatch {
  const patch: JsonPatch = [];
  const minLen = Math.min(oldArr.length, newArr.length);

  // 先頭から順に比較
  for (let i = 0; i < minLen; i++) {
    patch.push(...createPatch(oldArr[i], newArr[i], concatPath(basePath, i)));
  }

  // 新しい配列が長い場合は追加
  for (let i = minLen; i < newArr.length; i++) {
    patch.push({
      op: "add",
      path: concatPath(basePath, i),
      value: newArr[i],
    });
  }

  // 古い配列が長い場合は remove
  for (let i = minLen; i < oldArr.length; i++) {
    patch.push({
      op: "remove",
      path: concatPath(basePath, i),
    });
  }

  return patch;
}

/**
 * 配列の要素移動を検出して "move" にする簡易実装例
 * - 完璧な move 検出には最長共通部分列(LCS)などのアルゴリズムが必要
 * - ここでは "=== で同じ要素" が見つかったら move と見なすごく簡単なアプローチ
 */
function diffArrayWithMoveDetection(
  oldArr: any[],
  newArr: any[],
  basePath: string
): JsonPatch {
  // ここでは非常に単純なロジックを例示
  // 1. すべての newArr[i] をスキャンし、oldArr に同じ要素があれば move で処理
  // 2. 見つからなければ add
  // 3. oldArr で使われなかった要素は remove
  const patch: JsonPatch = [];
  const used = new Set<number>();

  // newArr の位置を順にみていく
  for (let newIndex = 0; newIndex < newArr.length; newIndex++) {
    const newVal = newArr[newIndex];
    let foundOldIndex = -1;
    for (let oldIndex = 0; oldIndex < oldArr.length; oldIndex++) {
      if (!used.has(oldIndex) && oldArr[oldIndex] === newVal) {
        foundOldIndex = oldIndex;
        break;
      }
    }
    if (foundOldIndex >= 0) {
      // 同じ値を発見 => 位置が違えば move
      if (foundOldIndex !== newIndex) {
        patch.push({
          op: "move",
          from: concatPath(basePath, foundOldIndex),
          path: concatPath(basePath, newIndex),
        });
      }
      used.add(foundOldIndex);
    } else {
      // 見つからない => add
      patch.push({
        op: "add",
        path: concatPath(basePath, newIndex),
        value: newVal,
      });
    }
  }

  // oldArr でまだ使われていない要素 => remove
  for (let oldIndex = 0; oldIndex < oldArr.length; oldIndex++) {
    if (!used.has(oldIndex)) {
      patch.push({
        op: "remove",
        path: concatPath(basePath, oldIndex),
      });
    }
  }
  return patch;
}

function isObject(obj: any): boolean {
  return obj !== null && typeof obj === "object";
}

function concatPath(basePath: string, key: string | number): string {
  if (!basePath) {
    return "/" + escapePointerSegment(String(key));
  }
  return basePath + "/" + escapePointerSegment(String(key));
}
