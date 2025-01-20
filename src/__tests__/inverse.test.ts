import { describe, test, expect } from 'vitest';

import { PatchError } from '../errors';
import { createInversePatch, applyPatchWithInverse } from '../inverse';
import { JsonPatch } from '../types';

describe('createInversePatch', () => {
  test('creates inverse for add operation', () => {
    const original = { a: 1 };
    const patch: JsonPatch = [{ op: 'add', path: '/b', value: 2 }];

    const inverse = createInversePatch(original, patch);
    expect(inverse).toEqual([{ op: 'remove', path: '/b' }]);
  });

  test('creates inverse for remove operation', () => {
    const original = { a: 1, b: 2 };
    const patch: JsonPatch = [{ op: 'remove', path: '/b' }];

    const inverse = createInversePatch(original, patch);
    expect(inverse).toEqual([{ op: 'add', path: '/b', value: 2 }]);
  });

  test('creates inverse for replace operation', () => {
    const original = { a: 1 };
    const patch: JsonPatch = [{ op: 'replace', path: '/a', value: 2 }];

    const inverse = createInversePatch(original, patch);
    expect(inverse).toEqual([{ op: 'replace', path: '/a', value: 1 }]);
  });

  test('creates inverse for move operation', () => {
    const original = { a: 1, b: { c: 2 } };
    const patch: JsonPatch = [{ op: 'move', path: '/b/d', from: '/a' }];

    const inverse = createInversePatch(original, patch);
    expect(inverse).toEqual([{ op: 'move', path: '/a', from: '/b/d' }]);
  });

  test('creates inverse for batch operations', () => {
    const original = { arr: [1, 2, 3] };
    const patch: JsonPatch = [{ op: 'remove', path: '/arr/0', count: 2 }];

    const inverse = createInversePatch(original, patch);
    expect(inverse).toEqual([{ op: 'add', path: '/arr/0', value: [1, 2] }]);
  });

  test('handles nested operations', () => {
    const original = {
      obj: {
        nested: { value: 1 },
        arr: [1, 2],
      },
    };
    const patch: JsonPatch = [
      { op: 'replace', path: '/obj/nested/value', value: 2 },
      { op: 'add', path: '/obj/arr/-', value: 3 },
    ];

    const inverse = createInversePatch(original, patch);
    expect(inverse).toEqual([
      { op: 'remove', path: '/obj/arr/2' },
      { op: 'replace', path: '/obj/nested/value', value: 1 },
    ]);
  });

  test('throws error for invalid paths', () => {
    const original = { a: 1 };
    const patch: JsonPatch = [{ op: 'remove', path: '/b' }];

    expect(() => createInversePatch(original, patch)).toThrow(PatchError);
  });

  test('handles test operations', () => {
    const original = { a: 1 };
    const patch: JsonPatch = [
      { op: 'test', path: '/a', value: 1 },
      { op: 'replace', path: '/a', value: 2 },
    ];

    const inverse = createInversePatch(original, patch);
    expect(inverse).toEqual([{ op: 'replace', path: '/a', value: 1 }]);
  });
});

describe('applyPatchWithInverse', () => {
  test('applies patch and returns correct inverse', () => {
    const obj = { a: 1, b: 2 };
    const patch: JsonPatch = [
      { op: 'remove', path: '/b' },
      { op: 'add', path: '/c', value: 3 },
    ];

    const inverse = applyPatchWithInverse(obj, patch);
    expect(obj).toEqual({ a: 1, c: 3 });
    expect(inverse).toEqual([
      { op: 'remove', path: '/c' },
      { op: 'add', path: '/b', value: 2 },
    ]);
  });

  test('restores original state on error', () => {
    const obj = { a: 1, b: 2 };
    const patch: JsonPatch = [
      { op: 'add', path: '/c', value: 3 },
      { op: 'remove', path: '/nonexistent' }, // This will fail
    ];

    expect(() => applyPatchWithInverse(obj, patch)).toThrow(PatchError);
    expect(obj).toEqual({ a: 1, b: 2 }); // Original state should be restored
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
      { op: 'move', path: '/deep/nested/arr/0', from: '/deep/nested/arr/2' },
    ];

    const inverse = applyPatchWithInverse(obj, patch);
    expect(obj.deep.nested.value).toBe(2);
    expect(obj.deep.nested.arr).toEqual([3, 1, 2]);

    // Verify inverse patch can restore original state
    const clone = JSON.parse(JSON.stringify(obj));
    inverse.forEach(op => applyPatchWithInverse(clone, [op]));
    expect(clone).toEqual({
      deep: {
        nested: {
          value: 1,
          arr: [1, 2, 3],
        },
      },
    });
  });
});
