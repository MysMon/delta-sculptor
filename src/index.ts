import { JsonPatch } from "./types";
import {
  applyPatch,
  applyPatchImmutable,
  applyPatchWithRollback,
} from "./patch";
import { createPatch, CreateDiffOptions } from "./diff";
import {
  generateInversePatch,
  applyInversePatch,
  applyPatchWithInverse,
} from "./inverse";

export class DeltaSculptor {
  /**
   * 2つのオブジェクトの差分 (JSON Patch) を作成
   */
  static createPatch(
    oldObj: any,
    newObj: any,
    options?: CreateDiffOptions
  ): JsonPatch {
    return createPatch(oldObj, newObj, "", options || {});
  }

  /**
   * パッチを破壊的に適用
   */
  static applyPatch(target: any, patch: JsonPatch): void {
    applyPatch(target, patch);
  }

  /**
   * パッチを非破壊的に適用して新しいオブジェクトを返す
   */
  static applyPatchImmutable<T>(target: T, patch: JsonPatch): T {
    return applyPatchImmutable(target, patch);
  }

  /**
   * パッチ適用と同時に逆パッチを返す
   */
  static applyPatchWithInverse(target: any, patch: JsonPatch): JsonPatch {
    return applyPatchWithInverse(target, patch);
  }

  /**
   * 逆パッチを適用してロールバック
   */
  static applyInversePatch(target: any, inversePatch: JsonPatch): void {
    applyInversePatch(target, inversePatch);
  }

  /**
   * 逆パッチを生成 (パッチ適用前のオブジェクトが必要)
   */
  static generateInversePatch(prePatchObj: any, patch: JsonPatch): JsonPatch {
    return generateInversePatch(prePatchObj, patch);
  }

  /**
   * ロールバック付きパッチ適用
   * 適用に失敗したら元の状態に戻す
   */
  static applyPatchWithRollback<T extends object>(
    target: T,
    patch: JsonPatch
  ): void {
    applyPatchWithRollback(target, patch);
  }
}
