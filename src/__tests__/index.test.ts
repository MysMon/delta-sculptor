import { describe, expect, it } from 'vitest';

import { DeltaSculptor } from '../index';
import { JsonPatch } from '../types';

describe('DeltaSculptor', () => {
  describe('validatePatch', () => {
    it('should validate correct patches', () => {
      const patch: JsonPatch = [{ op: 'replace', path: '/a', value: 1 }];
      expect(() => DeltaSculptor.validatePatch(patch)).not.toThrow();
    });

    it('should throw on invalid patches', () => {
      const invalidPatch = [{ op: 'invalid' as any, path: '/a' }];
      expect(() => DeltaSculptor.validatePatch(invalidPatch)).toThrow();
    });

    it('should throw on missing required fields', () => {
      const invalidPatch = [{ op: 'replace' } as any];
      expect(() => DeltaSculptor.validatePatch(invalidPatch)).toThrow();
    });

    it('should throw on invalid path format', () => {
      const invalidPatch: JsonPatch = [
        { op: 'replace' as const, path: 'invalid', value: 1 },
      ];
      expect(() => DeltaSculptor.validatePatch(invalidPatch)).toThrow();
    });
  });

  describe('tryApplyPatch', () => {
    it('should return success result on valid patch', () => {
      const obj = { a: 1, b: 2 };
      const patch: JsonPatch = [{ op: 'replace', path: '/a', value: 3 }];

      const result = DeltaSculptor.tryApplyPatch(obj, patch);
      expect(result.success).toBe(true);
      expect(result.result).toEqual({ a: 3, b: 2 });
      expect(result.error).toBeUndefined();
    });

    it('should return error result on invalid patch', () => {
      const obj = { a: 1 };
      const patch: JsonPatch = [
        { op: 'replace', path: '/nonexistent', value: 2 },
      ];

      const result = DeltaSculptor.tryApplyPatch(obj, patch);
      expect(result.success).toBe(false);
      expect(result.result).toEqual({ a: 1 });
      expect(result.error).toBeInstanceOf(Error);
    });

    it('should handle array operations', () => {
      const obj = { arr: [1, 2, 3] };
      const patch: JsonPatch = [
        { op: 'remove', path: '/arr/1', count: 2 },
        { op: 'add', path: '/arr/-', value: [4, 5] },
      ];

      const result = DeltaSculptor.tryApplyPatch(obj, patch);
      expect(result.success).toBe(true);
      expect(result.result.arr).toEqual([1, 4, 5]);
    });
  });

  describe('createPatch', () => {
    it('should create patch between two objects', () => {
      const oldObj = { name: 'John', age: 30 };
      const newObj = { name: 'John', age: 31 };

      const patch = DeltaSculptor.createPatch(oldObj, newObj);
      expect(patch).toEqual([{ op: 'replace', path: '/age', value: 31 }]);
    });

    it('should handle array moves when enabled', () => {
      const oldObj = { items: [1, 2, 3, 4] };
      const newObj = { items: [4, 2, 3, 1] };

      const patch = DeltaSculptor.createPatch(oldObj, newObj, {
        detectMove: true,
        batchArrayOps: true,
        maxDepth: 50,
      });

      // Should use move operations instead of remove+add
      expect(patch.some(op => op.op === 'move')).toBe(true);
    });

    it('should respect maxDepth option', () => {
      const createDeepObject = (depth: number): any => {
        let obj: any = { value: 1 };
        for (let i = 0; i < depth; i++) {
          obj = { nested: obj };
        }
        return obj;
      };

      const oldObj = createDeepObject(5);
      const newObj = createDeepObject(5);
      newObj.nested.nested.nested.nested.nested.value = 2;

      expect(() =>
        DeltaSculptor.createPatch(oldObj, newObj, { maxDepth: 3 })
      ).toThrow();
    });

    it('should detect circular references', () => {
      const oldObj: any = { a: 1 };
      oldObj.self = oldObj;

      const newObj = { a: 2 };
      expect(() => DeltaSculptor.createPatch(oldObj, newObj)).toThrow();
    });

    it('should optimize sequential operations', () => {
      const oldObj = { arr: [1, 2, 3, 4, 5] };
      const newObj = { arr: [1, 6, 7, 8, 5] };

      const patch = DeltaSculptor.createPatch(oldObj, newObj, {
        batchArrayOps: true,
      });

      // Should use single operation instead of multiple replace operations
      expect(patch.length).toBeLessThan(3);
      expect(patch.some(op => Array.isArray((op as any).value))).toBe(true);
    });
  });

  describe('patch operations', () => {
    it('should apply patch with rollback on failure', () => {
      const obj = { a: 1, b: { c: 2 } };
      const patch: JsonPatch = [
        { op: 'replace', path: '/a', value: 3 },
        { op: 'remove', path: '/nonexistent' }, // This will fail
      ];

      expect(() => DeltaSculptor.applyPatchWithRollback(obj, patch)).toThrow();
      expect(obj).toEqual({ a: 1, b: { c: 2 } }); // Original state preserved
    });

    it('should handle complex nested operations', () => {
      const obj = {
        users: [
          { id: 1, name: 'John', details: { age: 30 } },
          { id: 2, name: 'Jane', details: { age: 25 } },
        ],
      };

      const patch: JsonPatch = [
        { op: 'replace', path: '/users/0/details/age', value: 31 },
        { op: 'move', path: '/users/1/name', from: '/users/0/name' },
        { op: 'add', path: '/users/0/name', value: 'Johnny' },
      ];

      const result = DeltaSculptor.tryApplyPatch(obj, patch);
      expect(result.success).toBe(true);
      expect(result.result.users[0]).toEqual({
        id: 1,
        name: 'Johnny',
        details: { age: 31 },
      });
      expect(result.result.users[1].name).toBe('John');
    });
  });

  describe('inverse operations', () => {
    it('should create and apply inverse patches', () => {
      const original = {
        name: 'John',
        details: { age: 30, city: 'New York' },
        tags: ['a', 'b'],
      };

      const patch: JsonPatch = [
        { op: 'replace', path: '/details/age', value: 31 },
        { op: 'remove', path: '/details/city' },
        { op: 'add', path: '/tags/-', value: 'c' },
      ];

      // Apply original patch
      const inversePatch = DeltaSculptor.applyPatchWithInverse(original, patch);
      expect(original).toEqual({
        name: 'John',
        details: { age: 31 },
        tags: ['a', 'b', 'c'],
      });

      // Apply inverse patch to restore
      DeltaSculptor.applyInversePatch(original, inversePatch);
      expect(original).toEqual({
        name: 'John',
        details: { age: 30, city: 'New York' },
        tags: ['a', 'b'],
      });
    });

    it('should handle array operations in inverse patches', () => {
      const original = { items: [1, 2, 3] };
      const patch: JsonPatch = [
        { op: 'remove', path: '/items/1', count: 2 }, // Remove [2, 3]
      ];

      const inversePatch = DeltaSculptor.applyPatchWithInverse(original, patch);
      expect(original).toEqual({ items: [1] });

      DeltaSculptor.applyInversePatch(original, inversePatch);
      expect(original).toEqual({ items: [1, 2, 3] });
    });

    it('should validate inverse patches', () => {
      const original = { a: 1 };
      const patch: JsonPatch = [{ op: 'replace', path: '/a', value: 2 }];

      const inversePatch = DeltaSculptor.createInversePatch(original, patch, {
        validateInverse: true,
      });
      expect(inversePatch).toEqual([{ op: 'replace', path: '/a', value: 1 }]);
    });
  });
});
