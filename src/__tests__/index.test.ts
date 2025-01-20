import { describe, expect, it } from 'vitest';

import { DeltaSculptor } from '../index';
import { JsonPatch } from '../types';

describe('DeltaSculptor', () => {
  describe('createPatch', () => {
    it('should create patch between two objects', () => {
      const oldObj = { name: 'John', age: 30 };
      const newObj = { name: 'John', age: 31 };

      const patch = DeltaSculptor.createPatch(oldObj, newObj);
      expect(patch).toEqual([{ op: 'replace', path: '/age', value: 31 }]);
    });

    it('should handle nested object changes', () => {
      const oldObj = { user: { name: 'John', details: { age: 30 } } };
      const newObj = { user: { name: 'Jane', details: { age: 30 } } };

      const patch = DeltaSculptor.createPatch(oldObj, newObj);
      expect(patch).toEqual([
        { op: 'replace', path: '/user/name', value: 'Jane' },
      ]);
    });
  });

  describe('applyPatch', () => {
    it('should apply patch to object mutably', () => {
      const obj = { name: 'John', age: 30 };
      const patch: JsonPatch = [{ op: 'replace', path: '/age', value: 31 }];

      DeltaSculptor.applyPatch(obj, patch);
      expect(obj).toEqual({ name: 'John', age: 31 });
    });
  });

  describe('applyPatchImmutable', () => {
    it('should apply patch and return new object', () => {
      const obj = { name: 'John', age: 30 };
      const patch: JsonPatch = [{ op: 'replace', path: '/age', value: 31 }];

      const result = DeltaSculptor.applyPatchImmutable(obj, patch);
      expect(result).toEqual({ name: 'John', age: 31 });
      expect(obj).toEqual({ name: 'John', age: 30 }); // Original unchanged
    });
  });

  describe('applyPatchWithInverse', () => {
    it('should return inverse patch that can undo changes', () => {
      const obj = { name: 'John', age: 30 };
      const patch: JsonPatch = [{ op: 'replace', path: '/age', value: 31 }];

      const inversePatch = DeltaSculptor.applyPatchWithInverse(obj, patch);
      expect(obj).toEqual({ name: 'John', age: 31 }); // Original changed
      expect(inversePatch).toEqual([
        { op: 'replace', path: '/age', value: 30 },
      ]);
    });
  });

  describe('applyInversePatch', () => {
    it('should apply inverse patch to revert changes', () => {
      const obj = { name: 'John', age: 30 };
      const patch: JsonPatch = [{ op: 'replace', path: '/age', value: 31 }];

      DeltaSculptor.applyPatch(obj, patch);
      const inversePatch = DeltaSculptor.createInversePatch(
        { name: 'John', age: 30 },
        patch
      );
      DeltaSculptor.applyInversePatch(obj, inversePatch);

      expect(obj).toEqual({ name: 'John', age: 30 });
    });
  });

  describe('createInversePatch', () => {
    it('should create inverse patch from original object and patch', () => {
      const originalObj = { name: 'John', age: 30 };
      const patch: JsonPatch = [{ op: 'replace', path: '/age', value: 31 }];

      const inversePatch = DeltaSculptor.createInversePatch(originalObj, patch);
      expect(inversePatch).toEqual([
        { op: 'replace', path: '/age', value: 30 },
      ]);
    });
  });

  describe('applyPatchWithRollback', () => {
    it('should apply patch with rollback capability', () => {
      const obj = { name: 'John', age: 30 };
      const patch: JsonPatch = [{ op: 'replace', path: '/age', value: 31 }];

      DeltaSculptor.applyPatchWithRollback(obj, patch);
      expect(obj).toEqual({ name: 'John', age: 31 });
    });

    it('should rollback on error', () => {
      const obj = { name: 'John', age: 30 };
      const invalidPatch: JsonPatch = [
        { op: 'replace', path: '/nonexistent', value: 'something' },
      ];

      expect(() => {
        DeltaSculptor.applyPatchWithRollback(obj, invalidPatch);
      }).toThrow();
      expect(obj).toEqual({ name: 'John', age: 30 }); // Original state preserved
    });
  });
});
