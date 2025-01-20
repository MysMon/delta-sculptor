import { describe, test, expect } from 'vitest';

import { diffArrayWithLCS, diffArraySimple } from '../diff-utils';
import { PatchError } from '../errors';

describe('diffArrayWithLCS', () => {
  test('detects basic array changes', () => {
    const oldArr = [1, 2, 3];
    const newArr = [1, 4, 3];
    const patch = diffArrayWithLCS(oldArr, newArr, '/arr');

    expect(patch).toEqual([
      { op: 'remove', path: '/arr/1' },
      { op: 'add', path: '/arr/1', value: 4 },
    ]);
  });

  test('detects move operations', () => {
    const oldArr = [1, 2, 3, 4];
    const newArr = [1, 4, 2, 3];
    const patch = diffArrayWithLCS(oldArr, newArr, '/arr');

    expect(patch).toContainEqual({
      op: 'move',
      from: '/arr/3',
      path: '/arr/1',
    });
  });

  test('handles empty arrays', () => {
    expect(diffArrayWithLCS([], [], '/arr')).toEqual([]);
    expect(diffArrayWithLCS([1], [], '/arr')).toEqual([
      { op: 'remove', path: '/arr/0' },
    ]);
    expect(diffArrayWithLCS([], [1], '/arr')).toEqual([
      { op: 'add', path: '/arr/0', value: 1 },
    ]);
  });

  test('batches sequential operations when enabled', () => {
    const oldArr = [1, 2, 3];
    const newArr = [4, 5, 6];
    const patch = diffArrayWithLCS(oldArr, newArr, '/arr', {
      batchArrayOps: true,
    });

    expect(patch.length).toBeLessThan(6); // Should have fewer operations than non-batched
    expect(patch.some(op => Array.isArray(op.value))).toBe(true);
  });

  test('throws on circular references', () => {
    const circular: any[] = [];
    circular.push(circular);

    expect(() =>
      diffArrayWithLCS([], circular, '/arr', { checkCircular: true })
    ).toThrow(PatchError);
  });
});

describe('diffArraySimple', () => {
  test('generates replace operations for changed elements', () => {
    const oldArr = [1, 2, 3];
    const newArr = [1, 4, 3];
    const patch = diffArraySimple(oldArr, newArr, '/arr');

    expect(patch).toEqual([{ op: 'replace', path: '/arr/1', value: 4 }]);
  });

  test('handles array length changes', () => {
    const oldArr = [1, 2];
    const newArr = [1, 2, 3, 4];
    const patch = diffArraySimple(oldArr, newArr, '/arr');

    expect(patch).toEqual([
      { op: 'add', path: '/arr/2', value: 3 },
      { op: 'add', path: '/arr/3', value: 4 },
    ]);
  });

  test('handles array truncation', () => {
    const oldArr = [1, 2, 3, 4];
    const newArr = [1, 2];
    const patch = diffArraySimple(oldArr, newArr, '/arr');

    expect(patch).toEqual([
      { op: 'remove', path: '/arr/3' },
      { op: 'remove', path: '/arr/2' },
    ]);
  });

  test('handles empty arrays', () => {
    expect(diffArraySimple([], [], '/arr')).toEqual([]);
    expect(diffArraySimple([1], [], '/arr')).toEqual([
      { op: 'remove', path: '/arr/0' },
    ]);
    expect(diffArraySimple([], [1], '/arr')).toEqual([
      { op: 'add', path: '/arr/0', value: 1 },
    ]);
  });
});
