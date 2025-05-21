import { describe, test, expect } from 'vitest';

import { PatchError } from './errors';
import { createInversePatch, applyPatchWithInverse } from './inverse';
import { JsonPatch } from './types';

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

    // 実際の動作を検証
    const obj = JSON.parse(JSON.stringify(original));
    applyPatchWithInverse(obj, patch);
    expect(obj).toEqual({ b: { c: 2, d: 1 } });
    applyPatchWithInverse(obj, inverse);
    expect(obj).toEqual(original);
  });

  test('creates inverse for batch array operations', () => {
    const original = { arr: [1, 2, 3, 4, 5] };
    const patch: JsonPatch = [{ op: 'remove', path: '/arr/1', count: 3 }];

    const inverse = createInversePatch(original, patch);
    expect(inverse).toEqual([{ op: 'add', path: '/arr/1', value: [2, 3, 4] }]);
  });

  test('creates inverse for array insert operations', () => {
    const original = { arr: [1, 2, 3] };
    const patch: JsonPatch = [{ op: 'add', path: '/arr/1', value: [4, 5] }];

    const inverse = createInversePatch(original, patch);
    expect(inverse).toEqual([{ op: 'remove', path: '/arr/1', count: 2 }]);
  });

  test('creates inverse for sequential array operations with optimization', () => {
    const original = { arr: [1, 2, 3, 4, 5] };
    const patch: JsonPatch = [
      { op: 'remove', path: '/arr/1', count: 2 },
      { op: 'add', path: '/arr/3', value: [2, 3] },
    ];

    const inverse = createInversePatch(original, patch, {
      batchArrayOps: true,
    });
    expect(inverse).toEqual([
      { op: 'remove', path: '/arr/3', count: 2 },
      { op: 'add', path: '/arr/1', value: [2, 3] },
    ]);
  });

  test('handles complex array transformations', () => {
    const original = { arr: [1, 2, 3, 4, 5] };
    const patch: JsonPatch = [
      { op: 'remove', path: '/arr/0' }, // Remove 1
      { op: 'add', path: '/arr/-', value: 6 }, // Add 6 at end
      { op: 'move', path: '/arr/1', from: '/arr/3' }, // Move 4 to index 1
    ];

    const inverse = createInversePatch(original, patch);
    const expectedInverse: JsonPatch = [
      { op: 'move', path: '/arr/3', from: '/arr/1' },
      { op: 'remove', path: '/arr/4' }, // Corrected path
      { op: 'add', path: '/arr/0', value: 1 },
    ];
    expect(inverse).toEqual(expectedInverse);

    // Verify inverse works
    const obj = { arr: [1, 2, 3, 4, 5] };
    applyPatchWithInverse(obj, patch);
    expect(obj.arr).toEqual([2, 5, 3, 4, 6]); // Corrected intermediate state
    applyPatchWithInverse(obj, inverse);
    expect(obj.arr).toEqual([1, 2, 3, 4, 5]);
  });

  test('handles array bounds checking', () => {
    const original = { arr: [1, 2, 3] };
    const patch: JsonPatch = [{ op: 'add', path: '/arr/5', value: 4 }];

    expect(() => createInversePatch(original, patch)).toThrow(PatchError);
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

  test('handles array splice operations', () => {
    const original = { arr: [1, 2, 3, 4, 5] };
    const patch: JsonPatch = [
      { op: 'remove', path: '/arr/1', count: 2 }, // Remove [2, 3]
      { op: 'add', path: '/arr/1', value: [6, 7, 8] }, // Add [6, 7, 8]
    ];

    const inverse = createInversePatch(original, patch);
    // Should generate efficient inverse operations
    expect(inverse).toEqual([
      { op: 'remove', path: '/arr/1', count: 3 }, // Remove [6, 7, 8]
      { op: 'add', path: '/arr/1', value: [2, 3] }, // Restore [2, 3]
    ]);
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
    const obj = { arr: [1, 2, 3] };
    const patch: JsonPatch = [
      { op: 'remove', path: '/arr/1' },
      { op: 'add', path: '/arr/5', value: 4 }, // This will fail
    ];

    expect(() => applyPatchWithInverse(obj, patch)).toThrow(PatchError);
    expect(obj).toEqual({ arr: [1, 2, 3] }); // Original state preserved
  });

  test('handles nested array modifications', () => {
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
    applyPatchWithInverse(clone, inverse);
    expect(clone).toEqual({
      deep: {
        nested: {
          value: 1,
          arr: [1, 2, 3],
        },
      },
    });
  });

  test('respects array optimization options', () => {
    const obj = { arr: [1, 2, 3, 4, 5] };
    const patch: JsonPatch = [
      { op: 'remove', path: '/arr/1', count: 3 },
      { op: 'add', path: '/arr/1', value: [6, 7, 8] },
    ];

    // With optimization
    const inverseOptimized = applyPatchWithInverse(obj, patch, {
      batchArrayOps: true,
    });
    expect(inverseOptimized).toEqual([
      { op: 'remove', path: '/arr/1', count: 3 },
      { op: 'add', path: '/arr/1', value: [2, 3, 4] },
    ]);

    // Without optimization
    const objUnopt = { arr: [1, 2, 3, 4, 5] };
    const inverseUnopt = applyPatchWithInverse(objUnopt, patch, {
      batchArrayOps: false,
    });
    expect(inverseUnopt).toEqual([
      { op: 'remove', path: '/arr/1' },
      { op: 'remove', path: '/arr/1' },
      { op: 'remove', path: '/arr/1' },
      { op: 'add', path: '/arr/1', value: 2 },
      { op: 'add', path: '/arr/1', value: 3 },
      { op: 'add', path: '/arr/1', value: 4 },
    ]);

    // 両方のケースで元の状態に戻ることを確認
    applyPatchWithInverse(obj, inverseOptimized);
    expect(obj).toEqual({ arr: [1, 2, 3, 4, 5] });

    applyPatchWithInverse(objUnopt, inverseUnopt);
    expect(objUnopt).toEqual({ arr: [1, 2, 3, 4, 5] });
  });

  test('validates array indices', () => {
    const obj = { arr: [1, 2, 3] };
    const invalidPatch: JsonPatch = [{ op: 'add', path: '/arr/-1', value: 4 }];

    expect(() => applyPatchWithInverse(obj, invalidPatch)).toThrow(PatchError);
    expect(obj).toEqual({ arr: [1, 2, 3] }); // Original state preserved
  });
});

describe('operation validation', () => {
  test('handles copy operation correctly', () => {
    const original = { a: 1 };
    const patch: JsonPatch = [{ op: 'copy', path: '/b', from: '/a' }];

    const inverse = createInversePatch(original, patch);
    expect(inverse).toEqual([]); // Copy operations don't need inverse
  });

  test('handles test operation correctly', () => {
    const original = { a: 1 };
    const patch: JsonPatch = [{ op: 'test', path: '/a', value: 1 }];

    const inverse = createInversePatch(original, patch);
    expect(inverse).toEqual([]); // Test operations don't need inverse
  });

  test('validates operation types', () => {
    const original = { a: 1 };
    const patch: JsonPatch = [{ op: 'invalid' as any, path: '/a' }];

    expect(() => createInversePatch(original, patch)).toThrow(PatchError);
  });

  test('enforces validateInverse option', () => {
    const original = { a: 1 };
    const patch: JsonPatch = [{ op: 'add', path: '/b', value: 2 }];

    // With validation
    const withValidation = createInversePatch(original, patch, {
      validateInverse: true,
    });
    expect(withValidation).toEqual([{ op: 'remove', path: '/b' }]);

    // Should still work with validation disabled
    const withoutValidation = createInversePatch(original, patch, {
      validateInverse: false,
    });
    expect(withoutValidation).toEqual([{ op: 'remove', path: '/b' }]);
  });
});
