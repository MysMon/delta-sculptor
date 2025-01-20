import { describe, it, expect } from 'vitest';

import {
  escapePointerSegment,
  unescapePointerSegment,
  parsePointer,
  getValueByPointer,
  setValueByPointer,
  removeValueByPointer,
  buildPointer,
} from '../utils';

describe('JSON Pointer utils', () => {
  describe('escapePointerSegment', () => {
    it('escapes special characters correctly', () => {
      expect(escapePointerSegment('a/b')).toBe('a~1b');
      expect(escapePointerSegment('c~d')).toBe('c~0d');
      expect(escapePointerSegment('e~/f')).toBe('e~0~1f');
      expect(escapePointerSegment('normal')).toBe('normal');
    });
  });

  describe('unescapePointerSegment', () => {
    it('unescapes special characters correctly', () => {
      expect(unescapePointerSegment('a~1b')).toBe('a/b');
      expect(unescapePointerSegment('c~0d')).toBe('c~d');
      expect(unescapePointerSegment('e~0~1f')).toBe('e~/f');
      expect(unescapePointerSegment('normal')).toBe('normal');
    });
  });

  describe('parsePointer', () => {
    it('parses root pointer correctly', () => {
      expect(parsePointer('')).toEqual([]);
      expect(parsePointer('/')).toEqual(['']);
    });

    it('parses normal paths correctly', () => {
      expect(parsePointer('/foo')).toEqual(['foo']);
      expect(parsePointer('/foo/bar')).toEqual(['foo', 'bar']);
      expect(parsePointer('/foo/0/bar')).toEqual(['foo', '0', 'bar']);
    });

    it('handles escaped characters', () => {
      expect(parsePointer('/foo~1bar')).toEqual(['foo/bar']);
      expect(parsePointer('/foo~0bar')).toEqual(['foo~bar']);
    });

    it('handles multiple consecutive slashes', () => {
      expect(parsePointer('/foo//bar')).toEqual(['foo', '', 'bar']);
      expect(parsePointer('/foo///bar')).toEqual(['foo', '', '', 'bar']);
    });

    it('handles empty segments', () => {
      expect(parsePointer('//')).toEqual(['', '']);
      expect(parsePointer('/foo///')).toEqual(['foo', '', '', '']);
    });

    it('throws on invalid pointers', () => {
      expect(() => parsePointer('foo')).toThrow('Invalid JSON Pointer');
    });
  });

  describe('getValueByPointer', () => {
    const obj = {
      foo: {
        bar: 'value',
        baz: [1, 2, 3],
      },
      'a/b': 'slash',
      'c~d': 'tilde',
    };

    it('gets values correctly', () => {
      expect(getValueByPointer(obj, '')).toBe(obj);
      expect(getValueByPointer(obj, '/foo')).toBe(obj.foo);
      expect(getValueByPointer(obj, '/foo/bar')).toBe('value');
      expect(getValueByPointer(obj, '/foo/baz/1')).toBe(2);
    });

    it('handles escaped characters in path', () => {
      expect(getValueByPointer(obj, '/a~1b')).toBe('slash');
      expect(getValueByPointer(obj, '/c~0d')).toBe('tilde');
    });

    it('returns undefined for non-existent paths', () => {
      expect(getValueByPointer(obj, '/nonexistent')).toBeUndefined();
      expect(getValueByPointer(obj, '/foo/nonexistent')).toBeUndefined();
      expect(getValueByPointer(obj, '/foo/baz/5')).toBeUndefined();
    });
  });

  describe('setValueByPointer', () => {
    it('sets object properties', () => {
      const obj = { foo: { bar: 'old' } };
      setValueByPointer(obj, '/foo/bar', 'new');
      expect(obj.foo.bar).toBe('new');
    });

    it('creates intermediate objects', () => {
      const obj = {};
      setValueByPointer(obj, '/foo/bar', 'value');
      expect(obj).toEqual({ foo: { bar: 'value' } });
    });

    it('creates intermediate arrays when needed', () => {
      const obj = {};
      setValueByPointer(obj, '/arr/0/nested/0', 'value');
      expect(obj).toEqual({ arr: [{ nested: ['value'] }] });
    });

    it('handles array operations', () => {
      const obj = { arr: [1, 2, 3] };

      // Set existing index
      setValueByPointer(obj, '/arr/1', 'two');
      expect(obj.arr[1]).toBe('two');

      // Append to array
      setValueByPointer(obj, '/arr/-', 4);
      expect(obj.arr).toEqual([1, 'two', 3, 4]);
    });

    it('handles array bounds correctly', () => {
      const obj = { arr: [1, 2, 3] };
      setValueByPointer(obj, '/arr/3', 4);
      expect(obj.arr).toEqual([1, 2, 3, 4]);

      // Sparse array
      setValueByPointer(obj, '/arr/6', 7);
      expect(obj.arr[6]).toBe(7);
      expect(obj.arr.length).toBe(7);
    });

    it('sets values with special characters in path', () => {
      const obj = {};
      setValueByPointer(obj, '/path~1with~1slashes/and~0tildes', 'value');
      expect(obj['path/with/slashes']['and~tildes']).toBe('value');
    });

    it('throws when trying to set root', () => {
      const obj = {};
      expect(() => setValueByPointer(obj, '', 'value')).toThrow(
        'Cannot set the root'
      );
    });

    it('throws on invalid array index', () => {
      const obj = { arr: [] };
      expect(() => setValueByPointer(obj, '/arr/invalid', 'value')).toThrow(
        'Invalid array index'
      );
    });
  });

  describe('removeValueByPointer', () => {
    it('removes object properties', () => {
      const obj = { foo: { bar: 'value', baz: 'keep' } };
      const removed = removeValueByPointer(obj, '/foo/bar');
      expect(removed).toBe('value');
      expect(obj).toEqual({ foo: { baz: 'keep' } });
    });

    it('removes array elements', () => {
      const obj = { arr: [1, 2, 3] };
      const removed = removeValueByPointer(obj, '/arr/1');
      expect(removed).toBe(2);
      expect(obj.arr).toEqual([1, 3]);
    });

    it('removes last array element with "-"', () => {
      const obj = { arr: [1, 2, 3] };
      const removed = removeValueByPointer(obj, '/arr/-');
      expect(removed).toBe(3);
      expect(obj.arr).toEqual([1, 2]);
    });

    it('handles array bounds validation', () => {
      const obj = { arr: [1, 2, 3] };
      expect(removeValueByPointer(obj, '/arr/5')).toBeUndefined();
      expect(removeValueByPointer(obj, '/arr/-2')).toBeUndefined();
      expect(obj.arr).toEqual([1, 2, 3]);
    });

    it('removes values with special characters in path', () => {
      const obj = {
        'path/with/slashes': {
          'and~tildes': 'value',
        },
      };
      const removed = removeValueByPointer(
        obj,
        '/path~1with~1slashes/and~0tildes'
      );
      expect(removed).toBe('value');
      expect(obj['path/with/slashes']).toEqual({});
    });

    it('returns undefined for non-existent paths', () => {
      const obj = { foo: { bar: 'value' } };
      expect(removeValueByPointer(obj, '/nonexistent')).toBeUndefined();
      expect(removeValueByPointer(obj, '/foo/nonexistent')).toBeUndefined();
    });

    it('throws when trying to remove root', () => {
      const obj = {};
      expect(() => removeValueByPointer(obj, '')).toThrow(
        'Cannot remove the entire root'
      );
    });
  });

  describe('buildPointer', () => {
    it('builds pointer strings correctly', () => {
      expect(buildPointer([])).toBe('/');
      expect(buildPointer(['foo'])).toBe('/foo');
      expect(buildPointer(['foo', 'bar'])).toBe('/foo/bar');
      expect(buildPointer(['foo', '0', 'bar'])).toBe('/foo/0/bar');
    });

    it('escapes special characters', () => {
      expect(buildPointer(['foo/bar'])).toBe('/foo~1bar');
      expect(buildPointer(['foo~bar'])).toBe('/foo~0bar');
      expect(buildPointer(['foo~/bar'])).toBe('/foo~0~1bar');
    });
  });
});
