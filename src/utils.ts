/**
 * JSON Pointer (RFC 6901) におけるパスセグメントエスケープ
 * ~ -> ~0
 * / -> ~1
 */
export function escapePointerSegment(segment: string): string {
  return segment.replace(/~/g, '~0').replace(/\//g, '~1');
}

/**
 * JSON Pointer (RFC 6901) におけるパスセグメントアンエスケープ
 * ~1 -> /
 * ~0 -> ~
 */
export function unescapePointerSegment(segment: string): string {
  return segment.replace(/~1/g, '/').replace(/~0/g, '~');
}

/**
 * JSON Pointer の文字列をセグメント配列に変換
 * 例: "/foo/0/bar" -> ["foo", "0", "bar"]
 * ルート "/" -> [] (空配列)
 */
export function parsePointer(path: string): string[] {
  if (path === '') {
    // 空文字はルートを示す
    return [];
  }
  if (!path.startsWith('/')) {
    throw new Error(`Invalid JSON Pointer: must begin with "/". got: ${path}`);
  }
  // 先頭の "/" を除いたあと "/" で split
  const segments = path.substring(1).split('/').map(unescapePointerSegment);
  return segments;
}

/**
 * obj から JSON Pointer (path) に従って値を取得する
 * 存在しない場合は undefined を返す
 */
export function getValueByPointer(obj: any, path: string): any {
  const segments = parsePointer(path);
  let current = obj;
  for (const seg of segments) {
    if (current == null) {
      return undefined;
    }
    current = current[seg];
  }
  return current;
}

/**
 * obj の JSON Pointer (path) の位置に value を設定 (既存値を上書き)
 * - add, replace に使われる
 * - path が配列の index や '-' (末尾) の場合も考慮
 */
export function setValueByPointer(obj: any, path: string, value: any): void {
  const segments = parsePointer(path);
  if (segments.length === 0) {
    // ルート（obj 全体）を差し替える場合
    // JavaScript では参照を置き換えるだけでは呼び出し元のスコープに影響しない
    // ここではエラーにしておく。どうしてもやりたければ呼び出し側で調整。
    throw new Error('Cannot set the root object itself using JSON Pointer');
  }

  let current = obj;
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i];
    if (current[seg] === undefined) {
      // 次が数字なら配列、そうでなければオブジェクトを作る(簡易実装)
      const nextSeg = segments[i + 1];
      current[seg] = /^\d+$/.test(nextSeg) ? [] : {};
    }
    current = current[seg];
  }
  const lastSeg = segments[segments.length - 1];

  if (Array.isArray(current)) {
    // 配列への add
    if (lastSeg === '-') {
      // 末尾に追加
      current.push(value);
    } else {
      const index = parseInt(lastSeg, 10);
      if (Number.isNaN(index)) {
        throw new Error(`Invalid array index: ${lastSeg}`);
      }
      current[index] = value;
    }
  } else {
    // オブジェクトへの追加 or 置換
    current[lastSeg] = value;
  }
}

/**
 * obj の JSON Pointer (path) にある値を削除し、その「削除前の値」を返す
 * - remove に使われる
 */
export function removeValueByPointer(obj: any, path: string): any {
  const segments = parsePointer(path);
  if (segments.length === 0) {
    throw new Error('Cannot remove the entire root object');
  }

  let current = obj;
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i];
    if (current[seg] === undefined) {
      return undefined; // 削除対象がそもそもない
    }
    current = current[seg];
  }
  const lastSeg = segments[segments.length - 1];

  if (Array.isArray(current)) {
    const index = lastSeg === '-' ? current.length - 1 : parseInt(lastSeg, 10);
    if (index < 0 || index >= current.length) {
      return undefined; // 範囲外
    }
    const removed = current[index];
    current.splice(index, 1);
    return removed;
  } else {
    const removed = current[lastSeg];
    delete current[lastSeg];
    return removed;
  }
}

/**
 * JSON Pointer 文字列を組み立てるための簡易ヘルパー
 * segments をエスケープして "/" で連結
 */
export function buildPointer(segments: string[]): string {
  return '/' + segments.map(escapePointerSegment).join('/');
}
