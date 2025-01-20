import { describe, test, expect } from 'vitest';

import { PatchError } from '../errors';
import {
  applyPatch,
  applyPatchImmutable,
  applyPatchWithRollback,
  applyOperation,
} from '../patch';
import { JsonPatch } from '../types';

describe('applyOperation', () => {
  test('applies add operation', () => {
    const obj = { a: 1 };
    applyOperation(obj, { op: 'add', path: '/b', value: 2 });
    expect(obj).toEqual({ a: 1, b: 2 });
  });

  test('applies remove operation', () => {
    const obj = { a: 1, b: 2 };
    applyOperation(obj, { op: 'remove', path: '/b' });
    expect(obj).toEqual({ a: 1 });
  });

  test('applies replace operation', () => {
    const obj = { a: 1 };
    applyOperation(obj, { op: 'replace', path: '/a', value: 2 });
    expect(obj).toEqual({ a: 2 });
  });

  test('applies move operation', () => {
    const obj = { a: 1, b: { c: 2 } };
    applyOperation(obj, { op: 'move', path: '/b/d', from: '/a' });
    expect(obj).toEqual({ b: { c: 2, d: 1 } });
  });

  test('applies copy operation', () => {
    const obj = { a: 1 };
    applyOperation(obj, { op: 'copy', path: '/b', from: '/a' });
    expect(obj).toEqual({ a: 1, b: 1 });
  });

  test('applies test operation', () => {
    const obj = { a: 1 };
    expect(() =>
      applyOperation(obj, { op: 'test', path: '/a', value: 1 })
    ).not.toThrow();
    expect(() =>
      applyOperation(obj, { op: 'test', path: '/a', value: 2 })
    ).toThrow(PatchError);
  });

  test('handles array operations', () => {
    const obj = { arr: [1, 2, 3] };
    applyOperation(obj, { op: 'add', path: '/arr/-', value: 4 });
    expect(obj.arr).toEqual([1, 2, 3, 4]);
  });

  test('validates operation type', () => {
    const obj = { a: 1 };
    expect(() =>
      applyOperation(obj, { op: 'invalid' as any, path: '/a' })
    ).toThrow(PatchError);
  });
});

describe('applyPatch', () => {
  test('applies multiple operations sequentially', () => {
    const obj = { a: 1 };
    const patch: JsonPatch = [
      { op: 'add', path: '/b', value: 2 },
      { op: 'remove', path: '/a' },
      { op: 'add', path: '/c', value: 3 },
    ];

    applyPatch(obj, patch);
    expect(obj).toEqual({ b: 2, c: 3 });
  });

  test('validates patch before applying', () => {
    const obj = { a: 1 };
    const invalidPatch: any = [{ invalid: 'operation' }];

    expect(() => applyPatch(obj, invalidPatch)).toThrow(PatchError);
    expect(obj).toEqual({ a: 1 }); // Object should remain unchanged
  });

  test('handles nested modifications', () => {
    const obj = {
      deep: {
        nested: {
          value: 1,
          arr: [1, 2, 3],
        },
      },
    };

    const patch: JsonPatch = [
      { op: 'replace', path: '/deep/nested/value', value: 2 },
      { op: 'add', path: '/deep/nested/arr/-', value: 4 },
    ];

    applyPatch(obj, patch);
    expect(obj.deep.nested.value).toBe(2);
    expect(obj.deep.nested.arr).toEqual([1, 2, 3, 4]);
  });

  test('stops on first error', () => {
    const obj = { a: 1, b: 2 };
    const patch: JsonPatch = [
      { op: 'add', path: '/c', value: 3 },
      { op: 'remove', path: '/nonexistent' },
      { op: 'add', path: '/d', value: 4 },
    ];

    expect(() => applyPatch(obj, patch)).toThrow(PatchError);
    expect(obj).toEqual({ a: 1, b: 2, c: 3 }); // First operation applied
  });
});

describe('applyPatchImmutable', () => {
  test('returns new object without modifying original', () => {
    const original = { a: 1, b: { c: 2 } };
    const patch: JsonPatch = [
      { op: 'add', path: '/d', value: 3 },
      { op: 'remove', path: '/b' },
    ];

    const result = applyPatchImmutable(original, patch);
    expect(result).toEqual({ a: 1, d: 3 });
    expect(original).toEqual({ a: 1, b: { c: 2 } }); // Original unchanged
  });

  test('deep clones nested objects', () => {
    const original = { a: { b: { c: 1 } } };
    const patch: JsonPatch = [{ op: 'replace', path: '/a/b/c', value: 2 }];

    const result = applyPatchImmutable(original, patch);
    expect(result.a.b.c).toBe(2);
    expect(original.a.b.c).toBe(1);
    expect(result.a).not.toBe(original.a); // Different object reference
  });
});

describe('applyPatchWithRollback', () => {
  test('applies patch successfully', () => {
    const obj = { a: 1 };
    const patch: JsonPatch = [{ op: 'add', path: '/b', value: 2 }];

    applyPatchWithRollback(obj, patch);
    expect(obj).toEqual({ a: 1, b: 2 });
  });

  test('rolls back on error', () => {
    const obj = { a: 1, b: 2 };
    const patch: JsonPatch = [
      { op: 'add', path: '/c', value: 3 },
      { op: 'remove', path: '/nonexistent' }, // This will fail
      { op: 'add', path: '/d', value: 4 },
    ];

    expect(() => applyPatchWithRollback(obj, patch)).toThrow(PatchError);
    expect(obj).toEqual({ a: 1, b: 2 }); // Original state restored
  });

  test('handles nested rollbacks', () => {
    const obj = {
      deep: {
        nested: {
          value: 1,
          arr: [1, 2, 3],
        },
      },
    };
    const patch: JsonPatch = [
      { op: 'replace', path: '/deep/nested/value', value: 2 },
      { op: 'add', path: '/deep/nested/invalid/path', value: 'error' },
    ];

    expect(() => applyPatchWithRollback(obj, patch)).toThrow(PatchError);
    expect(obj.deep.nested.value).toBe(1); // Original value restored
    expect(obj.deep.nested.arr).toEqual([1, 2, 3]); // Array unchanged
  });
});
