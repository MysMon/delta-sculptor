import { describe, test, expect } from 'vitest';

import { createPatch } from '../diff';
import { PatchError } from '../errors';
import { JsonPatchOperation } from '../types';

interface MoveOperation extends Omit<JsonPatchOperation, 'op'> {
  op: 'move';
  from: string;
  path: string;
}

function isMoveOp(op: JsonPatchOperation): op is MoveOperation {
  return op.op === 'move';
}

interface ReplaceOperation extends Omit<JsonPatchOperation, 'op'> {
  op: 'replace';
  path: string;
  value: any;
}

function isReplaceOp(op: JsonPatchOperation): op is ReplaceOperation {
  return op.op === 'replace';
}

describe('createPatch', () => {
  test('handles primitive value changes', () => {
    expect(createPatch({ oldObj: 1, newObj: 2 })).toEqual([
      { op: 'replace', path: '/', value: 2 },
    ]);
    expect(createPatch({ oldObj: 'old', newObj: 'new' })).toEqual([
      { op: 'replace', path: '/', value: 'new' },
    ]);
    expect(createPatch({ oldObj: true, newObj: false })).toEqual([
      { op: 'replace', path: '/', value: false },
    ]);
  });

  test('handles null and undefined', () => {
    expect(createPatch({ oldObj: null, newObj: 1 })).toEqual([
      { op: 'replace', path: '/', value: 1 },
    ]);
    expect(createPatch({ oldObj: undefined, newObj: 1 })).toEqual([
      { op: 'add', path: '/', value: 1 },
    ]);
    expect(createPatch({ oldObj: 1, newObj: undefined })).toEqual([
      { op: 'remove', path: '/' },
    ]);
  });

  test('handles flat object changes', () => {
    const oldObj = { a: 1, b: 2, c: 3 };
    const newObj = { a: 1, b: 4, d: 5 };

    expect(createPatch({ oldObj, newObj })).toEqual([
      { op: 'remove', path: '/c' },
      { op: 'replace', path: '/b', value: 4 },
      { op: 'add', path: '/d', value: 5 },
    ]);
  });

  test('handles nested object changes', () => {
    const oldObj = { a: { b: { c: 1 } } };
    const newObj = { a: { b: { c: 2 } } };

    expect(createPatch({ oldObj, newObj })).toEqual([
      { op: 'replace', path: '/a/b/c', value: 2 },
    ]);
  });

  describe('array handling', () => {
    test('handles array changes without move detection', () => {
      const oldObj = { arr: [1, 2, 3, 4] };
      const newObj = { arr: [1, 4, 2, 3] };

      const patch = createPatch({
        oldObj,
        newObj,
        params: { detectMove: false },
      });

      // Should use replace operations
      expect(patch).toEqual([
        { op: 'replace', path: '/arr/1', value: 4 },
        { op: 'replace', path: '/arr/2', value: 2 },
        { op: 'replace', path: '/arr/3', value: 3 },
      ]);
    });

    test('handles array changes with move detection', () => {
      const oldObj = { arr: [1, 2, 3, 4] };
      const newObj = { arr: [1, 4, 2, 3] };

      const patch = createPatch({
        oldObj,
        newObj,
        params: { detectMove: true },
      });

      // Apply the operations and verify the result
      const result = [...oldObj.arr];
      patch.forEach((op: JsonPatchOperation) => {
        if (isReplaceOp(op)) {
          const index = parseInt(op.path.split('/').pop() || '0', 10);
          result[index] = op.value;
        } else if (isMoveOp(op)) {
          const fromIndex = parseInt(op.from.split('/').pop() || '0', 10);
          const toIndex = parseInt(op.path.split('/').pop() || '0', 10);
          const [item] = result.splice(fromIndex, 1);
          result.splice(toIndex, 0, item);
        }
      });

      // Verify the final array matches the expected result
      expect(result).toEqual(newObj.arr);
    });

    test('handles sequential array operations', () => {
      // Test add operations
      const oldObj1 = { arr: [1] };
      const newObj1 = { arr: [1, 2, 3, 4] };
      const addPatch = createPatch({
        oldObj: oldObj1,
        newObj: newObj1,
      });

      // Verify add operations work
      let result = [...oldObj1.arr];
      addPatch.forEach((op: JsonPatchOperation) => {
        if (op.op === 'add' && 'value' in op) {
          const index = parseInt(op.path.split('/').pop() || '0', 10);
          result.splice(index, 0, op.value);
        }
      });
      expect(result).toEqual(newObj1.arr);

      // Test remove operations
      const oldObj2 = { arr: [1, 2, 3, 4] };
      const newObj2 = { arr: [1] };
      const removePatch = createPatch({
        oldObj: oldObj2,
        newObj: newObj2,
      });

      // Verify remove operations work
      result = [...oldObj2.arr];
      removePatch.forEach((op: JsonPatchOperation) => {
        if (op.op === 'remove') {
          const index = parseInt(op.path.split('/').pop() || '0', 10);
          result.splice(index, 1);
        }
      });
      expect(result).toEqual(newObj2.arr);
    });
  });

  test('handles mixed nested changes', () => {
    const oldObj = {
      arr: [1, { a: 2 }, 3],
      obj: { arr: [4, 5] },
    };
    const newObj = {
      arr: [1, { a: 3 }, 3],
      obj: { arr: [5, 4] },
    };

    const patch = createPatch({ oldObj, newObj });

    expect(patch).toEqual([
      {
        op: 'replace',
        path: '/arr/1/a',
        value: 3,
      },
      {
        op: 'replace',
        path: '/obj/arr/0',
        value: 5,
      },
      {
        op: 'replace',
        path: '/obj/arr/1',
        value: 4,
      },
    ]);
  });

  test('respects maxDepth option', () => {
    const deepObj = { a: { b: { c: { d: 1 } } } };
    expect(() =>
      createPatch({
        oldObj: deepObj,
        newObj: deepObj,
        params: { maxDepth: 2 },
      })
    ).toThrow(PatchError);
  });

  test('detects circular references', () => {
    const circular: any = { a: 1 };
    circular.self = circular;

    expect(() =>
      createPatch({
        oldObj: {},
        newObj: circular,
        params: { checkCircular: true },
      })
    ).toThrow(PatchError);
  });

  test('handles empty objects', () => {
    expect(createPatch({ oldObj: {}, newObj: {} })).toEqual([]);
    expect(createPatch({ oldObj: { a: 1 }, newObj: {} })).toEqual([
      { op: 'remove', path: '/a' },
    ]);
    expect(createPatch({ oldObj: {}, newObj: { a: 1 } })).toEqual([
      { op: 'add', path: '/a', value: 1 },
    ]);
  });
});
