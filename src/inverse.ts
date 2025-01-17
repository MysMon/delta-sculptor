import { JsonPatch, JsonPatchOperation } from "./types";
import { getValueByPointer } from "./utils";
import { applyOperation } from "./patch";

/**
 * Operation を逆に適用するための "inverse" Operation を作る
 * @param obj  パッチ適用前のオブジェクト
 * @param op   適用しようとしている Operation
 * @returns    逆パッチの Operation
 */
function invertOperation(
  obj: any,
  op: JsonPatchOperation
): JsonPatchOperation[] {
  const { op: operation, path, from, value } = op;
  const currentVal = getValueByPointer(obj, path);

  switch (operation) {
    case "add":
      // add の逆は remove
      return [
        {
          op: "remove",
          path,
          // remove では value 不要
        },
      ];
    case "remove":
      // remove の逆は add (古い値を追加)
      return [
        {
          op: "add",
          path,
          value: currentVal,
        },
      ];
    case "replace":
      // replace の逆は replace で値を元に戻す
      return [
        {
          op: "replace",
          path,
          value: currentVal,
        },
      ];
    case "move":
      // move の逆は逆方向への move
      // move は from -> path の移動
      // 逆は path -> from への移動
      // ただし適用前に from の値を知る必要がある
      if (!from) throw new Error("'move' operation requires 'from'");
      return [
        {
          op: "move",
          from: path,
          path: from,
        },
      ];
    case "copy":
      // copy の逆は remove (コピー先を削除)
      return [
        {
          op: "remove",
          path,
        },
      ];
    case "test":
      // test は実行しても副作用なし
      // 逆パッチは不要だが、「テストも逆に検証したい」なら push してもよい
      return [];
    default:
      throw new Error(`Unsupported operation: ${operation}`);
  }
}

/**
 * 逆パッチ（inverse patch）を生成する
 * @param obj   パッチ適用前のオブジェクト (現時点の状態)
 * @param patch これから適用しようとしているパッチ
 * @returns 逆パッチ
 */
export function generateInversePatch(obj: any, patch: JsonPatch): JsonPatch {
  // obj を複製してパッチを適用しながら進めることで
  // 適用「前」の各箇所の値を取り出しつつ進行する
  const clone = JSON.parse(JSON.stringify(obj));

  const inverseOps: JsonPatchOperation[] = [];

  for (const op of patch) {
    // オペレーション適用前の状態を元に逆操作を生成
    const inverses = invertOperation(clone, op);
    inverseOps.push(...inverses);

    // 今の操作を clone に適用して次へ進む
    applyOperation(clone, op);
  }

  return inverseOps;
}

/**
 * 生成した逆パッチを適用することで、オブジェクトを元に戻す
 */
export function applyInversePatch(obj: any, inversePatch: JsonPatch): void {
  for (const op of inversePatch) {
    applyOperation(obj, op);
  }
}

/**
 * パッチ適用と同時に逆パッチを返す便利関数
 * @param obj   パッチ適用前のオブジェクト
 * @param patch 適用するパッチ
 * @returns inversePatch (このパッチを適用すれば元に戻る)
 */
export function applyPatchWithInverse(obj: any, patch: JsonPatch): JsonPatch {
  const inversePatch = generateInversePatch(obj, patch);
  // 本体にパッチを適用
  patch.forEach(op => applyOperation(obj, op));
  return inversePatch;
}