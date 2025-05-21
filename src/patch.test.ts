import { describe, test, expect } from 'vitest';

import { PatchError } from './errors';
import {
  applyPatch,
  applyPatchImmutable,
  applyPatchWithRollback,
  applyOperation,
} from './patch';
import { JsonPatch } from './types';

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

  test('validates json pointer format', () => {
    const obj = { a: 1 };
    // Missing leading slash
    expect(() =>
      applyOperation(obj, { op: 'add', path: 'invalid', value: 2 })
    ).toThrow(PatchError);
    // Invalid encoding
    expect(() =>
      applyOperation(obj, { op: 'add', path: '/foo%', value: 2 })
    ).toThrow(PatchError);
    // Invalid token
    expect(() =>
      applyOperation(obj, { op: 'add', path: '/foo/~x', value: 2 })
    ).toThrow(PatchError);
  });

  test('replace operation on non-existent path throws', () => {
    const obj = { a: 1 };
    expect(() =>
      applyOperation(obj, { op: 'replace', path: '/nonexistent', value: 2 })
    ).toThrow(PatchError);
  });

  test('validates required fields for operations', () => {
    const obj = { a: 1 };
    // Missing 'from' field for move
    expect(() =>
      applyOperation(obj, { op: 'move', path: '/b' } as any)
    ).toThrow(PatchError);
    // Missing 'from' field for copy
    expect(() =>
      applyOperation(obj, { op: 'copy', path: '/b' } as any)
    ).toThrow(PatchError);
  });

  test('handles test operation with missing value', () => {
    const obj = { a: 1 };
    // Path exists but value undefined
    expect(() =>
      applyOperation(obj, { op: 'test', path: '/a', value: undefined })
    ).toThrow(PatchError);
  });

  test('respects checkCircular option', () => {
    const circular: any = { a: 1 };
    circular.self = circular;
    const obj = { target: {} };

    // Should not throw with checkCircular: false
    expect(() =>
      applyOperation(
        obj,
        { op: 'add', path: '/target', value: circular },
        { checkCircular: false }
      )
    ).not.toThrow();

    // Should throw with checkCircular: true (default)
    expect(() =>
      applyOperation(obj, { op: 'add', path: '/target', value: circular })
    ).toThrow(PatchError);
  });

  test('detects circular references', () => {
    const circular: any = { a: 1 };
    circular.self = circular;
    const obj = { target: {} };

    expect(() =>
      applyOperation(obj, { op: 'add', path: '/target', value: circular })
    ).toThrow(PatchError);
  });

  test('validates move operation from/path relationship', () => {
    const obj = { a: { b: { c: 1 } } };

    expect(() =>
      applyOperation(obj, {
        op: 'move',
        path: '/a/b/c/d',
        from: '/a/b',
      })
    ).toThrow(PatchError);
  });

  test('handles deep copy operations correctly', () => {
    interface TestObj {
      source: {
        deep: {
          value: { id: number };
        };
      };
      target: {
        copied?: { id: number };
      };
    }

    const obj: TestObj = {
      source: { deep: { value: { id: 1 } } },
      target: {},
    };

    applyOperation(obj, {
      op: 'copy',
      path: '/target/copied',
      from: '/source/deep/value',
    });

    expect(obj.target.copied).toEqual({ id: 1 });
    expect(obj.target.copied).not.toBe(obj.source.deep.value);
  });

  test('handles array operations and validates indices', () => {
    const obj = { arr: [1, 2, 3] };

    // Add at end with -
    applyOperation(obj, { op: 'add', path: '/arr/-', value: 4 });
    expect(obj.arr).toEqual([1, 2, 3, 4]);

    // Add at middle
    applyOperation(obj, { op: 'add', path: '/arr/1', value: 'new' });
    expect(obj.arr).toEqual([1, 'new', 2, 3, 4]);

    // Remove from middle
    applyOperation(obj, { op: 'remove', path: '/arr/1' });
    expect(obj.arr).toEqual([1, 2, 3, 4]);

    // Invalid array index
    expect(() =>
      applyOperation(obj, { op: 'add', path: '/arr/invalid', value: 5 })
    ).toThrow(PatchError);

    // Out of bounds index
    expect(() =>
      applyOperation(obj, { op: 'add', path: '/arr/10', value: 5 })
    ).toThrow(PatchError);

    // Negative index (except -)
    expect(() =>
      applyOperation(obj, { op: 'add', path: '/arr/-2', value: 5 })
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

  test('respects validation option', () => {
    const obj = { a: 1 };
    const invalidPatch: any = [{ invalid: 'operation' }];

    // Should not throw with validate: false
    expect(() =>
      applyPatch(obj, invalidPatch, { validate: false })
    ).not.toThrow();

    // Should throw with validate: true (default)
    expect(() => applyPatch(obj, invalidPatch)).toThrow(PatchError);
  });

  test('validates patch before applying', () => {
    const obj = { a: 1 };
    const invalidPatch: any = [{ invalid: 'operation' }];

    expect(() => applyPatch(obj, invalidPatch)).toThrow(PatchError);
    expect(obj).toEqual({ a: 1 }); // Object should remain unchanged
  });

  test('handles nested modifications and validates depth', () => {
    const obj = {
      deep: {
        nested: {
          value: 1,
          arr: [1, 2, 3],
          deeper: {
            evenDeeper: {
              tooDeep: true,
            },
          },
        },
      },
    };

    const patch: JsonPatch = [
      { op: 'replace', path: '/deep/nested/value', value: 2 },
      { op: 'add', path: '/deep/nested/arr/-', value: 4 },
    ];

    // Should work with default depth
    applyPatch(obj, patch);
    expect(obj.deep.nested.value).toBe(2);
    expect(obj.deep.nested.arr).toEqual([1, 2, 3, 4]);

    // Should fail with shallow depth limit
    expect(() =>
      applyPatch(
        obj,
        [{ op: 'add', path: '/deep/nested/deeper/newValue', value: 1 }],
        { maxDepth: 2 }
      )
    ).toThrow(PatchError);

    // Should work with undefined maxDepth
    expect(() =>
      applyPatch(
        obj,
        [{ op: 'add', path: '/deep/nested/deeper/newValue', value: 1 }],
        { maxDepth: undefined }
      )
    ).not.toThrow();
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

  test('deep clones nested objects and handles circular references', () => {
    const circular: any = { nested: { value: 1 } };
    circular.self = circular;

    interface TestObj {
      a: { b: { c: number } };
      d?: { nested: { value: number }; self: any };
    }

    const original: TestObj = { a: { b: { c: 1 } } };
    const patch: JsonPatch = [
      { op: 'replace', path: '/a/b/c', value: 2 },
      { op: 'add', path: '/d', value: circular },
    ];

    // Should throw due to circular reference
    expect(() => applyPatchImmutable(original, patch)).toThrow(PatchError);
    expect(original.a.b.c).toBe(1); // Original should be unchanged

    // Should work with checkCircular disabled
    const result = applyPatchImmutable(original, patch, {
      checkCircular: false,
    });
    expect(result.a.b.c).toBe(2);
    // We know 'd' exists because we added it in the patch and it succeeded
    expect((result as Required<TestObj>).d.self).toBe(result.d);
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

  test('rolls back on non-PatchError', () => {
    const obj = { a: 1 };
    const throwingObj = {
      get prop() {
        throw new Error('Custom error');
      },
    };
    const patch: JsonPatch = [{ op: 'add', path: '/b', value: throwingObj }];

    expect(() => applyPatchWithRollback(obj, patch)).toThrow(PatchError);
    expect(obj).toEqual({ a: 1 }); // Original state restored
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
      { op: 'add', path: '/deep/nested/value/foo', value: 'error' }, // Changed operation
    ];

    expect(() => applyPatchWithRollback(obj, patch)).toThrow(PatchError);
    expect(obj.deep.nested.value).toBe(1); // Original value restored
    expect(obj.deep.nested.arr).toEqual([1, 2, 3]); // Array unchanged
  });
});
