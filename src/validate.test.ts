import { describe, test, expect } from 'vitest';

import { PatchError } from './errors';
import { JsonPatch } from './types';
import {
  validateJsonPointer,
  detectCircular,
  validateMaxDepth,
  deepEqual,
  deepClone,
  validatePatch,
} from './validate';

describe('validateJsonPointer', () => {
  test('validates valid pointers', () => {
    expect(() => validateJsonPointer('')).not.toThrow();
    expect(() => validateJsonPointer('/')).not.toThrow();
    expect(() => validateJsonPointer('/a')).not.toThrow();
    expect(() => validateJsonPointer('/a/b/c')).not.toThrow();
    expect(() => validateJsonPointer('/a/0/b')).not.toThrow();
    expect(() => validateJsonPointer('/a/~0b')).not.toThrow(); // Escaped ~
    expect(() => validateJsonPointer('/a/~1b')).not.toThrow(); // Escaped /
  });

  test('rejects invalid pointers', () => {
    expect(() => validateJsonPointer('a')).toThrow(PatchError);
    expect(() => validateJsonPointer('a/b')).toThrow(PatchError);
    expect(() => validateJsonPointer('/a/~')).toThrow(PatchError);
    expect(() => validateJsonPointer('/a/~2')).toThrow(PatchError);
  });
});

describe('detectCircular', () => {
  test('detects simple circular references', () => {
    const obj: any = { a: 1 };
    obj.self = obj;
    expect(detectCircular(obj)).toBeTruthy();
  });

  test('detects nested circular references', () => {
    const obj: any = { a: { b: { c: {} } } };
    obj.a.b.c.back = obj.a;
    expect(detectCircular(obj)).toBeTruthy();
  });

  test('detects circular references in arrays', () => {
    const arr: any[] = [1, 2, 3];
    arr.push(arr);
    expect(detectCircular(arr)).toBeTruthy();
  });

  test('handles non-circular structures', () => {
    expect(detectCircular({ a: 1, b: { c: 2 } })).toBeNull();
    expect(detectCircular([1, [2, 3], { a: 4 }])).toBeNull();
    expect(detectCircular(null)).toBeNull();
    expect(detectCircular(undefined)).toBeNull();
    expect(detectCircular(123)).toBeNull();
  });
});

describe('validateMaxDepth', () => {
  test('validates within max depth', () => {
    const obj = { a: { b: { c: 1 } } };
    expect(() => validateMaxDepth(obj, 3)).not.toThrow();
  });

  test('throws on exceeding max depth', () => {
    const obj = { a: { b: { c: { d: 1 } } } };
    expect(() => validateMaxDepth(obj, 2)).toThrow(PatchError);
  });

  test('handles arrays', () => {
    const arr = [1, [2, [3]]];
    expect(() => validateMaxDepth(arr, 3)).not.toThrow();
    expect(() => validateMaxDepth(arr, 2)).toThrow(PatchError);
  });

  test('handles mixed nested structures', () => {
    const obj = { a: [{ b: [1] }] };
    expect(() => validateMaxDepth(obj, 4)).not.toThrow();
    expect(() => validateMaxDepth(obj, 3)).toThrow(PatchError);
  });
});

describe('deepEqual', () => {
  test('compares primitive values', () => {
    expect(deepEqual(1, 1)).toBe(true);
    expect(deepEqual('a', 'a')).toBe(true);
    expect(deepEqual(true, true)).toBe(true);
    expect(deepEqual(null, null)).toBe(true);
    expect(deepEqual(undefined, undefined)).toBe(true);
    expect(deepEqual(1, 2)).toBe(false);
    expect(deepEqual(null, undefined)).toBe(false);
  });

  test('compares objects', () => {
    expect(deepEqual({ a: 1 }, { a: 1 })).toBe(true);
    expect(deepEqual({ a: 1 }, { a: 2 })).toBe(false);
    expect(deepEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
  });

  test('compares arrays', () => {
    expect(deepEqual([1, 2, 3], [1, 2, 3])).toBe(true);
    expect(deepEqual([1, 2, 3], [1, 3, 2])).toBe(false);
    expect(deepEqual([1, [2, 3]], [1, [2, 3]])).toBe(true);
  });

  test('handles circular references', () => {
    const obj1: any = { a: 1 };
    const obj2: any = { a: 1 };
    obj1.self = obj1;
    obj2.self = obj2;
    expect(deepEqual(obj1, obj2)).toBe(true);
  });
});

describe('deepClone', () => {
  test('clones primitive values', () => {
    expect(deepClone(1)).toBe(1);
    expect(deepClone('a')).toBe('a');
    expect(deepClone(true)).toBe(true);
    expect(deepClone(null)).toBe(null);
    expect(deepClone(undefined)).toBe(undefined);
  });

  test('clones objects', () => {
    const obj = { a: 1, b: { c: 2 } };
    const clone = deepClone(obj);
    expect(clone).toEqual(obj);
    expect(clone).not.toBe(obj);
    expect(clone.b).not.toBe(obj.b);
  });

  test('clones arrays', () => {
    const arr = [1, [2, 3], { a: 4 }];
    const clone = deepClone(arr);
    expect(clone).toEqual(arr);
    expect(clone).not.toBe(arr);
    expect(clone[1]).not.toBe(arr[1]);
    expect(clone[2]).not.toBe(arr[2]);
  });

  test('handles circular references', () => {
    const obj: any = { a: 1 };
    obj.self = obj;
    const clone = deepClone(obj);
    expect(clone.a).toBe(1);
    expect(clone.self).toBe(clone);
    expect(clone.self).not.toBe(obj);
  });
});

describe('validatePatch', () => {
  test('validates valid patches', () => {
    const validPatch: JsonPatch = [
      { op: 'add', path: '/a', value: 1 },
      { op: 'remove', path: '/b' },
      { op: 'replace', path: '/c', value: 2 },
      { op: 'move', path: '/d', from: '/e' },
      { op: 'copy', path: '/f', from: '/g' },
      { op: 'test', path: '/h', value: 3 },
    ];

    expect(() => validatePatch(validPatch)).not.toThrow();
  });

  test('rejects invalid patch format', () => {
    expect(() => validatePatch('not an array' as any)).toThrow(PatchError);
    expect(() => validatePatch([{ invalid: 'op' }] as any)).toThrow(PatchError);
  });

  test('validates required fields', () => {
    expect(() => validatePatch([{ op: 'add' } as any])).toThrow(PatchError);
    expect(() => validatePatch([{ path: '/a' } as any])).toThrow(PatchError);
  });

  test('validates operation-specific requirements', () => {
    expect(() => validatePatch([{ op: 'add', path: '/a' } as any])).toThrow(
      PatchError
    );
    expect(() => validatePatch([{ op: 'move', path: '/a' } as any])).toThrow(
      PatchError
    );
    expect(() => validatePatch([{ op: 'test', path: '/a' } as any])).toThrow(
      PatchError
    );
  });

  test('validates JSON pointers', () => {
    expect(() =>
      validatePatch([{ op: 'add', path: 'invalid', value: 1 }])
    ).toThrow(PatchError);
    expect(() =>
      validatePatch([{ op: 'move', path: '/a', from: 'invalid' }])
    ).toThrow(PatchError);
  });
});
