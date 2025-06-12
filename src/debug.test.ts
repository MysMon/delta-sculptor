import { describe, it, expect } from 'vitest';

import {
  debugPatch,
  DebugOptions,
  analyzeComplexity,
  validatePatchPaths,
} from './debug';
import { JsonPatch } from './types';

describe('Debug Utilities', () => {
  describe('debugPatch', () => {
    it('should provide basic patch analysis', () => {
      const patch: JsonPatch = [
        { op: 'replace', path: '/a', value: 3 },
        { op: 'add', path: '/b', value: 4 },
        { op: 'remove', path: '/c' },
      ];

      const debugInfo = debugPatch(patch);

      expect(debugInfo.analysis.operationCount).toBe(3);
      expect(debugInfo.analysis.operationTypes).toEqual([
        'replace',
        'add',
        'remove',
      ]);
      expect(debugInfo.analysis.paths).toEqual(['/a', '/b', '/c']);
      expect(debugInfo.success).toBe(true);
    });

    it('should detect path validation issues', () => {
      const patch: JsonPatch = [
        { op: 'add', path: 'invalid-path', value: 1 },
        { op: 'replace', path: '/valid', value: 2 },
      ];

      const debugInfo = debugPatch(patch, { validatePaths: true });

      expect(debugInfo.warnings).toContain(
        'Invalid JSON Pointer path: invalid-path'
      );
      expect(debugInfo.analysis.validPaths).toBe(1);
      expect(debugInfo.analysis.invalidPaths).toBe(1);
    });

    it('should analyze patch complexity', () => {
      const patch: JsonPatch = [
        { op: 'move', from: '/a/b/c', path: '/x/y/z' },
        {
          op: 'add',
          path: '/deep/nested/path/to/value',
          value: { complex: 'object' },
        },
        { op: 'remove', path: '/array/10' },
      ];

      const debugInfo = debugPatch(patch, { analyzeComplexity: true });

      expect(debugInfo.complexity).toBeGreaterThan(0);
      expect(debugInfo.analysis.maxDepth).toBeGreaterThan(2);
      expect(debugInfo.analysis.hasArrayOperations).toBe(true);
      expect(debugInfo.analysis.hasMoveOperations).toBe(true);
    });

    it('should provide detailed operation breakdown', () => {
      const patch: JsonPatch = [
        { op: 'add', path: '/users/0', value: { name: 'John' } },
        { op: 'replace', path: '/settings/theme', value: 'dark' },
        { op: 'copy', from: '/template', path: '/new-item' },
        { op: 'test', path: '/version', value: '1.0.0' },
      ];

      const debugInfo = debugPatch(patch, { includeOperationBreakdown: true });

      expect(debugInfo.operationBreakdown).toBeDefined();
      expect(debugInfo.operationBreakdown?.add).toBe(1);
      expect(debugInfo.operationBreakdown?.replace).toBe(1);
      expect(debugInfo.operationBreakdown?.copy).toBe(1);
      expect(debugInfo.operationBreakdown?.test).toBe(1);
    });

    it('should detect potential issues', () => {
      const patch: JsonPatch = [
        { op: 'remove', path: '/' }, // Root removal
        { op: 'add', path: '/a/b/c', value: 1 }, // Deep addition without parent
        { op: 'move', from: '/x', path: '/x/child' }, // Circular move
      ];

      const debugInfo = debugPatch(patch, { detectIssues: true });

      expect(debugInfo.warnings.length).toBeGreaterThan(0);
      expect(debugInfo.warnings).toContain('Root path operation detected');
      expect(debugInfo.warnings).toContain(
        'Potential circular reference in move operation'
      );
    });

    it('should handle empty patches', () => {
      const patch: JsonPatch = [];

      const debugInfo = debugPatch(patch, { analyzeComplexity: true });

      expect(debugInfo.analysis.operationCount).toBe(0);
      expect(debugInfo.analysis.operationTypes).toEqual([]);
      expect(debugInfo.analysis.paths).toEqual([]);
      expect(debugInfo.complexity).toBe(0);
      expect(debugInfo.success).toBe(true);
    });

    it('should handle malformed patches', () => {
      const patch: any = [
        { op: 'invalid-op', path: '/test' },
        { path: '/missing-op', value: 1 },
        null,
        { op: 'add', value: 'missing-path' },
      ];

      const debugInfo = debugPatch(patch);

      expect(debugInfo.success).toBe(false);
      expect(debugInfo.error).toBeDefined();
      expect(debugInfo.warnings.length).toBeGreaterThan(0);
    });
  });

  describe('analyzeComplexity', () => {
    it('should calculate complexity for simple patches', () => {
      const patch: JsonPatch = [
        { op: 'add', path: '/a', value: 1 },
        { op: 'replace', path: '/b', value: 2 },
      ];

      const complexity = analyzeComplexity(patch);

      expect(complexity).toBeGreaterThan(0);
      expect(complexity).toBeLessThan(10); // Simple operations should have low complexity
    });

    it('should calculate higher complexity for complex patches', () => {
      const patch: JsonPatch = [
        { op: 'move', from: '/deep/nested/path', path: '/another/deep/path' },
        {
          op: 'add',
          path: '/array/100',
          value: { complex: { nested: { object: true } } },
        },
        { op: 'copy', from: '/source', path: '/target' },
      ];

      const complexity = analyzeComplexity(patch);

      expect(complexity).toBeGreaterThan(10); // Complex operations should have higher complexity
    });

    it('should consider operation types in complexity', () => {
      const simplePatch: JsonPatch = [
        { op: 'add', path: '/a', value: 1 },
        { op: 'replace', path: '/b', value: 2 },
      ];

      const complexPatch: JsonPatch = [
        { op: 'move', from: '/a', path: '/b' },
        { op: 'copy', from: '/c', path: '/d' },
      ];

      const simpleComplexity = analyzeComplexity(simplePatch);
      const complexComplexity = analyzeComplexity(complexPatch);

      expect(complexComplexity).toBeGreaterThan(simpleComplexity);
    });
  });

  describe('validatePatchPaths', () => {
    it('should validate correct JSON Pointer paths', () => {
      const paths = [
        '/a',
        '/b/c',
        '/array/0',
        '/escaped~0path',
        '/escaped~1path',
      ];

      const result = validatePatchPaths(paths);

      expect(result.validPaths).toBe(5);
      expect(result.invalidPaths).toBe(0);
      expect(result.issues).toEqual([]);
    });

    it('should detect invalid JSON Pointer paths', () => {
      const paths = ['invalid', 'also-invalid', '/valid'];

      const result = validatePatchPaths(paths);

      expect(result.validPaths).toBe(1);
      expect(result.invalidPaths).toBe(2);
      expect(result.issues.length).toBe(2);
    });

    it('should provide detailed path issues', () => {
      const paths = ['no-leading-slash', '/valid', 'also-invalid'];

      const result = validatePatchPaths(paths);

      expect(result.issues).toContain(
        'Invalid JSON Pointer path: no-leading-slash'
      );
      expect(result.issues).toContain(
        'Invalid JSON Pointer path: also-invalid'
      );
    });
  });

  describe('debug options', () => {
    it('should respect debug options', () => {
      const patch: JsonPatch = [{ op: 'add', path: '/test', value: 1 }];

      const options: DebugOptions = {
        validatePaths: false,
        analyzeComplexity: false,
        includeOperationBreakdown: false,
        detectIssues: false,
      };

      const debugInfo = debugPatch(patch, options);

      expect(debugInfo.complexity).toBeUndefined();
      expect(debugInfo.operationBreakdown).toBeUndefined();
      expect(debugInfo.analysis.validPaths).toBeUndefined();
      expect(debugInfo.warnings.length).toBe(0);
    });

    it('should enable all features when requested', () => {
      const patch: JsonPatch = [
        { op: 'move', from: '/a', path: '/b' },
        { op: 'add', path: '/c/d', value: { nested: true } },
      ];

      const options: DebugOptions = {
        validatePaths: true,
        analyzeComplexity: true,
        includeOperationBreakdown: true,
        detectIssues: true,
      };

      const debugInfo = debugPatch(patch, options);

      expect(debugInfo.complexity).toBeDefined();
      expect(debugInfo.operationBreakdown).toBeDefined();
      expect(debugInfo.analysis.validPaths).toBeDefined();
      expect(debugInfo.analysis.invalidPaths).toBeDefined();
    });
  });
});
