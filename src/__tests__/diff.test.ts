import { describe, test, expect } from 'vitest';

import { createPatch } from '../diff';
import { PatchError } from '../errors';

describe('createPatch', () => {
  test('handles primitive value changes', () => {
    expect(createPatch(1, 2)).toEqual([{ op: 'replace', path: '/', value: 2 }]);
    expect(createPatch('old', 'new')).toEqual([
      { op: 'replace', path: '/', value: 'new' },
    ]);
    expect(createPatch(true, false)).toEqual([
      { op: 'replace', path: '/', value: false },
    ]);
  });

  test('handles null and undefined', () => {
    expect(createPatch(null, 1)).toEqual([
      { op: 'replace', path: '/', value: 1 },
    ]);
    expect(createPatch(undefined, 1)).toEqual([
      { op: 'add', path: '/', value: 1 },
    ]);
    expect(createPatch(1, undefined)).toEqual([{ op: 'remove', path: '/' }]);
  });

  test('handles flat object changes', () => {
    const oldObj = { a: 1, b: 2, c: 3 };
    const newObj = { a: 1, b: 4, d: 5 };

    expect(createPatch(oldObj, newObj)).toEqual([
      { op: 'remove', path: '/c' },
      { op: 'replace', path: '/b', value: 4 },
      { op: 'add', path: '/d', value: 5 },
    ]);
  });

  test('handles nested object changes', () => {
    const oldObj = { a: { b: { c: 1 } } };
    const newObj = { a: { b: { c: 2 } } };

    expect(createPatch(oldObj, newObj)).toEqual([
      { op: 'replace', path: '/a/b/c', value: 2 },
    ]);
  });

  test('handles array changes with move detection', () => {
    const oldObj = { arr: [1, 2, 3] };
    const newObj = { arr: [1, 3, 2] };

    const patch = createPatch(oldObj, newObj, '', { detectMove: true });
    expect(patch).toContainEqual(
      expect.objectContaining({
        op: 'move',
        from: '/arr/2',
        path: '/arr/1',
      })
    );
  });

  test('handles array changes without move detection', () => {
    const oldObj = { arr: [1, 2, 3] };
    const newObj = { arr: [1, 3, 2] };

    const patch = createPatch(oldObj, newObj, '', { detectMove: false });
    expect(patch).not.toContainEqual(expect.objectContaining({ op: 'move' }));
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

    const patch = createPatch(oldObj, newObj);
    expect(patch).toContainEqual(
      expect.objectContaining({
        path: '/arr/1/a',
        value: 3,
      })
    );
    expect(patch).toContainEqual(
      expect.objectContaining({
        path: '/obj/arr/0',
        value: 5,
      })
    );
  });

  test('respects maxDepth option', () => {
    const deepObj = { a: { b: { c: { d: 1 } } } };
    expect(() => createPatch(deepObj, deepObj, '', { maxDepth: 2 })).toThrow(
      PatchError
    );
  });

  test('detects circular references', () => {
    const circular: any = { a: 1 };
    circular.self = circular;

    expect(() =>
      createPatch({}, circular, '', { checkCircular: true })
    ).toThrow(PatchError);
  });

  test('handles empty objects', () => {
    expect(createPatch({}, {})).toEqual([]);
    expect(createPatch({ a: 1 }, {})).toEqual([{ op: 'remove', path: '/a' }]);
    expect(createPatch({}, { a: 1 })).toEqual([
      { op: 'add', path: '/a', value: 1 },
    ]);
  });
});
