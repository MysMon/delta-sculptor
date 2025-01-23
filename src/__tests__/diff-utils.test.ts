import { describe, test, expect } from 'vitest';

import { diffArrayWithLCS, diffArraySimple } from '../diff-utils';
import { PatchError } from '../errors';

describe('diffArrayWithLCS', () => {
  test('detects basic array changes', () => {
    const oldArr = [1, 2, 3];
    const newArr = [1, 4, 3];
    const patch = diffArrayWithLCS(oldArr, newArr, { basePath: '/arr' });

    expect(patch).toEqual([
      { op: 'remove', path: '/arr/1' },
      { op: 'add', path: '/arr/1', value: 4 },
    ]);
  });

  test('detects move operations', () => {
    const oldArr = [1, 2, 3, 4];
    const newArr = [1, 4, 2, 3];
    const patch = diffArrayWithLCS(oldArr, newArr, { basePath: '/arr' });

    expect(patch).toContainEqual({
      op: 'move',
      from: '/arr/3',
      path: '/arr/1',
    });
  });

  test('handles empty arrays', () => {
    expect(diffArrayWithLCS([], [], { basePath: '/arr' })).toEqual([]);
    expect(diffArrayWithLCS([1], [], { basePath: '/arr' })).toEqual([
      { op: 'remove', path: '/arr/0' },
    ]);
    expect(diffArrayWithLCS([], [1], { basePath: '/arr' })).toEqual([
      { op: 'add', path: '/arr/0', value: 1 },
    ]);
  });

  test('respects maxBatchSize parameter', () => {
    const oldArr = [1, 2, 3, 4, 5];
    const newArr = [6, 7, 8, 9, 10];

    // Test with small batch size
    const smallBatch = diffArrayWithLCS(oldArr, newArr, {
      basePath: '/arr',
      batchArrayOps: true,
      maxBatchSize: 2,
    });
    expect(smallBatch.length).toBeGreaterThan(1);
    smallBatch.forEach(op => {
      if (Array.isArray(op.value)) {
        expect(op.value.length).toBeLessThanOrEqual(2);
      }
    });

    // Test with default batch size
    const largeBatch = diffArrayWithLCS(oldArr, newArr, {
      basePath: '/arr',
      batchArrayOps: true,
    });
    expect(largeBatch.length).toBeLessThan(smallBatch.length);
  });

  test('handles basePath correctly', () => {
    const oldArr = [1, 2];
    const newArr = [2, 1];

    // Test with empty base path
    const noPath = diffArrayWithLCS(oldArr, newArr);
    expect(noPath[0].path.startsWith('/')).toBe(true);

    // Test with custom base path
    const withPath = diffArrayWithLCS(oldArr, newArr, {
      basePath: '/deeply/nested/array',
    });
    expect(withPath[0].path.startsWith('/deeply/nested/array/')).toBe(true);
    if (withPath[0].from) {
      expect(withPath[0].from.startsWith('/deeply/nested/array/')).toBe(true);
    }
  });

  test('handles complex optimized operations', () => {
    const oldArr = [1, 2, 3, 4, 5];
    const newArr = [5, 4, 6, 7, 1];

    // Test with optimization
    const optimized = diffArrayWithLCS(oldArr, newArr, {
      basePath: '/arr',
      batchArrayOps: true,
    });

    // Should use move operations where possible
    expect(optimized.some(op => op.op === 'move')).toBe(true);

    // Applied patch should result in correct array
    const result = [...oldArr];
    optimized.forEach(op => {
      switch (op.op) {
        case 'move':
          if (op.from) {
            const fromIndex = parseInt(op.from.split('/').pop() || '0', 10);
            const toIndex = parseInt(op.path.split('/').pop() || '0', 10);
            const [value] = result.splice(fromIndex, 1);
            result.splice(toIndex, 0, value);
          }
          break;
        case 'remove':
          const removeIndex = parseInt(op.path.split('/').pop() || '0', 10);
          result.splice(removeIndex, 1);
          break;
        case 'add':
          const addIndex = parseInt(op.path.split('/').pop() || '0', 10);
          result.splice(addIndex, 0, op.value);
          break;
      }
    });
    expect(result).toEqual(newArr);
  });

  test('throws on circular references', () => {
    const circular: any[] = [];
    circular.push(circular);

    expect(() =>
      diffArrayWithLCS([], circular, { basePath: '/arr', checkCircular: true })
    ).toThrow(PatchError);
  });
});

describe('diffArraySimple', () => {
  test('generates replace operations for changed elements', () => {
    const oldArr = [1, 2, 3];
    const newArr = [1, 4, 3];
    const patch = diffArraySimple(oldArr, newArr, { basePath: '/arr' });

    expect(patch).toEqual([{ op: 'replace', path: '/arr/1', value: 4 }]);
  });

  test('handles array length changes', () => {
    const oldArr = [1, 2];
    const newArr = [1, 2, 3, 4];
    const patch = diffArraySimple(oldArr, newArr, { basePath: '/arr' });

    expect(patch).toEqual([
      { op: 'add', path: '/arr/2', value: 3 },
      { op: 'add', path: '/arr/3', value: 4 },
    ]);
  });

  test('handles array truncation', () => {
    const oldArr = [1, 2, 3, 4];
    const newArr = [1, 2];
    const patch = diffArraySimple(oldArr, newArr, { basePath: '/arr' });

    expect(patch).toEqual([
      { op: 'remove', path: '/arr/3' },
      { op: 'remove', path: '/arr/2' },
    ]);
  });

  test('handles empty arrays', () => {
    expect(diffArraySimple([], [], { basePath: '/arr' })).toEqual([]);
    expect(diffArraySimple([1], [], { basePath: '/arr' })).toEqual([
      { op: 'remove', path: '/arr/0' },
    ]);
    expect(diffArraySimple([], [1], { basePath: '/arr' })).toEqual([
      { op: 'add', path: '/arr/0', value: 1 },
    ]);
  });
});
