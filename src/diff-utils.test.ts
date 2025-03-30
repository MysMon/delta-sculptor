import { describe, test, expect } from 'vitest';

import { generateArrayOperations, batchArrayOperations } from './array-utils';
import { diffArrayWithLCS, diffArraySimple } from './diff-utils';
import { PatchError } from './errors';

describe('diffArrayWithLCS', () => {
  test('detects basic array changes', () => {
    const oldArr = [1, 2, 3];
    const newArr = [1, 4, 3];
    const patch = diffArrayWithLCS(oldArr, newArr, { basePath: '/arr' });

    expect(patch).toEqual([{ op: 'replace', path: '/arr/1', value: 4 }]);
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

  test('handles complex transformations', () => {
    const oldArr = [1, 2, 3, 4, 5];
    const newArr = [5, 4, 6, 7, 1];

    const operations = generateArrayOperations(oldArr, newArr);
    const patch = batchArrayOperations(operations);

    // Apply the patch to oldArr and verify the result
    const result = [...oldArr];
    patch.forEach(op => {
      const index = parseInt(op.path.slice(1));
      switch (op.op) {
        case 'move':
          if (!op.from) {
            throw new Error('Move operation missing from path');
          }
          const fromIndex = parseInt(op.from.slice(1));
          const [value] = result.splice(fromIndex, 1);
          result.splice(index, 0, value);
          break;
        case 'remove':
          if ('count' in op) {
            result.splice(index, op.count);
          } else {
            result.splice(index, 1);
          }
          break;
        case 'add':
          if (Array.isArray(op.value)) {
            // バッチ処理された値を個別に追加
            op.value.forEach((v, i) => {
              result.splice(index + i, 0, v as number);
            });
          } else {
            result.splice(index, 0, op.value as number);
          }
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
