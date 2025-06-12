/**
 * Debug utilities for Delta Sculptor patch operations
 */

import { JsonPatch } from './types';

export interface DebugOptions {
  /** Validate JSON Pointer paths */
  validatePaths?: boolean;
  /** Analyze patch complexity */
  analyzeComplexity?: boolean;
  /** Include detailed operation breakdown */
  includeOperationBreakdown?: boolean;
  /** Detect potential issues */
  detectIssues?: boolean;
}

export interface OperationBreakdown {
  add?: number;
  remove?: number;
  replace?: number;
  move?: number;
  copy?: number;
  test?: number;
}

export interface PatchAnalysis {
  /** Total number of operations */
  operationCount: number;
  /** Types of operations present */
  operationTypes: string[];
  /** All paths referenced in the patch */
  paths: string[];
  /** Maximum path depth */
  maxDepth?: number;
  /** Whether patch contains array operations */
  hasArrayOperations?: boolean;
  /** Whether patch contains move operations */
  hasMoveOperations?: boolean;
  /** Number of valid paths */
  validPaths?: number;
  /** Number of invalid paths */
  invalidPaths?: number;
}

export interface PathValidationResult {
  validPaths: number;
  invalidPaths: number;
  issues: string[];
}

export interface DebugInfo {
  /** Whether debugging was successful */
  success: boolean;
  /** Any error that occurred during debugging */
  error?: Error;
  /** Patch analysis results */
  analysis: PatchAnalysis;
  /** Complexity score (0-100) */
  complexity?: number;
  /** Breakdown of operations by type */
  operationBreakdown?: OperationBreakdown;
  /** List of warnings and potential issues */
  warnings: string[];
}

/**
 * Provides detailed debugging information about a patch
 * @param patch The JSON Patch to debug
 * @param options Debug configuration options
 * @returns Debug information and analysis
 */
export function debugPatch(
  patch: JsonPatch,
  options: DebugOptions = {}
): DebugInfo {
  const warnings: string[] = [];
  let analysis: PatchAnalysis;
  let success = true;
  let error: Error | undefined;

  try {
    // Basic analysis
    analysis = analyzePatch(patch);

    // Path validation
    if (options.validatePaths) {
      const pathValidation = validatePatchPaths(analysis.paths);
      analysis.validPaths = pathValidation.validPaths;
      analysis.invalidPaths = pathValidation.invalidPaths;
      warnings.push(...pathValidation.issues);
    }

    // Issue detection
    if (options.detectIssues) {
      warnings.push(...detectPatchIssues(patch));
    }
  } catch (err) {
    success = false;
    error = err instanceof Error ? err : new Error(String(err));
    analysis = {
      operationCount: 0,
      operationTypes: [],
      paths: [],
    };
    warnings.push('Failed to analyze patch structure');
  }

  const debugInfo: DebugInfo = {
    success,
    error,
    analysis,
    warnings,
  };

  // Complexity analysis
  if (options.analyzeComplexity && success) {
    debugInfo.complexity = analyzeComplexity(patch);
  }

  // Operation breakdown
  if (options.includeOperationBreakdown && success) {
    debugInfo.operationBreakdown = createOperationBreakdown(patch);
  }

  return debugInfo;
}

/**
 * Analyzes the basic structure of a patch
 */
function analyzePatch(patch: JsonPatch): PatchAnalysis {
  const operationTypes = new Set<string>();
  const paths = new Set<string>();
  let maxDepth = 0;
  let hasArrayOperations = false;
  let hasMoveOperations = false;

  for (const operation of patch) {
    if (!operation || typeof operation !== 'object') {
      throw new Error('Invalid operation in patch');
    }

    if (!operation.op) {
      throw new Error('Operation missing required "op" field');
    }

    operationTypes.add(operation.op);

    // Analyze paths
    if (operation.path) {
      paths.add(operation.path);
      const depth = operation.path.split('/').length - 1;
      maxDepth = Math.max(maxDepth, depth);

      // Check for array operations
      if (/\/\d+$/.test(operation.path)) {
        hasArrayOperations = true;
      }
    }

    if (operation.from) {
      paths.add(operation.from);
      const depth = operation.from.split('/').length - 1;
      maxDepth = Math.max(maxDepth, depth);
    }

    if (operation.op === 'move') {
      hasMoveOperations = true;
    }
  }

  return {
    operationCount: patch.length,
    operationTypes: Array.from(operationTypes),
    paths: Array.from(paths),
    maxDepth,
    hasArrayOperations,
    hasMoveOperations,
  };
}

/**
 * Calculates a complexity score for a patch
 */
export function analyzeComplexity(patch: JsonPatch): number {
  if (!patch || patch.length === 0) {
    return 0;
  }

  let complexity = 0;

  // Base complexity per operation
  complexity += patch.length;

  for (const operation of patch) {
    // Operation type complexity
    switch (operation.op) {
      case 'add':
      case 'remove':
        complexity += 1;
        break;
      case 'replace':
        complexity += 2;
        break;
      case 'move':
      case 'copy':
        complexity += 3;
        break;
      case 'test':
        complexity += 1;
        break;
      default:
        complexity += 4; // Unknown operations are complex
    }

    // Path depth complexity
    if (operation.path) {
      const depth = operation.path.split('/').length - 1;
      complexity += depth * 0.5;
    }

    if (operation.from) {
      const depth = operation.from.split('/').length - 1;
      complexity += depth * 0.5;
    }

    // Value complexity
    if (operation.value !== undefined) {
      complexity += calculateValueComplexity(operation.value);
    }
  }

  return Math.round(complexity * 10) / 10;
}

/**
 * Calculates complexity score for a value
 */
function calculateValueComplexity(value: any): number {
  if (value === null || value === undefined) {
    return 0;
  }

  if (typeof value === 'string') {
    return value.length > 100 ? 2 : 0.5;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return 0.2;
  }

  if (Array.isArray(value)) {
    return 1 + value.length * 0.1;
  }

  if (typeof value === 'object') {
    const keys = Object.keys(value);
    return (
      1 +
      keys.length * 0.2 +
      keys.reduce(
        (sum, key) => sum + calculateValueComplexity(value[key]) * 0.5,
        0
      )
    );
  }

  return 1;
}

/**
 * Validates JSON Pointer paths
 */
export function validatePatchPaths(paths: string[]): PathValidationResult {
  let validPaths = 0;
  let invalidPaths = 0;
  const issues: string[] = [];

  for (const path of paths) {
    if (isValidJsonPointer(path)) {
      validPaths++;
    } else {
      invalidPaths++;
      issues.push(`Invalid JSON Pointer path: ${path}`);
    }
  }

  return { validPaths, invalidPaths, issues };
}

/**
 * Checks if a string is a valid JSON Pointer
 */
function isValidJsonPointer(path: string): boolean {
  if (path === '') {
    return true; // Empty string is valid (root)
  }

  if (!path.startsWith('/')) {
    return false;
  }

  // Check for properly escaped characters
  const segments = path.split('/').slice(1); // Remove empty first element
  for (const segment of segments) {
    // Check for unescaped ~ and invalid escape sequences
    if (segment.includes('~') && !/^([^~]|~[01])*$/.test(segment)) {
      return false;
    }
  }

  return true;
}

/**
 * Detects potential issues in a patch
 */
function detectPatchIssues(patch: JsonPatch): string[] {
  const issues: string[] = [];

  for (const operation of patch) {
    // Root path operations
    if (operation.path === '/' || operation.path === '') {
      issues.push('Root path operation detected');
    }

    // Deep paths that might need parent creation
    if (operation.path && operation.op === 'add') {
      const depth = operation.path.split('/').length - 1;
      if (depth > 3) {
        issues.push('Deep path may require parent creation');
      }
    }

    // Circular references in move operations
    if (operation.op === 'move' && operation.from && operation.path) {
      if (operation.path.startsWith(operation.from + '/')) {
        issues.push('Potential circular reference in move operation');
      }
    }

    // Large array indices
    if (operation.path && /\/(\d+)$/.test(operation.path)) {
      const match = operation.path.match(/\/(\d+)$/);
      if (match && parseInt(match[1]) > 10000) {
        issues.push('Very large array index detected');
      }
    }

    // Missing required fields
    if (operation.op === 'move' && !operation.from) {
      issues.push('Move operation missing "from" field');
    }

    if (operation.op === 'copy' && !operation.from) {
      issues.push('Copy operation missing "from" field');
    }

    if (
      ['add', 'replace', 'test'].includes(operation.op) &&
      operation.value === undefined
    ) {
      issues.push(`${operation.op} operation missing "value" field`);
    }
  }

  return issues;
}

/**
 * Creates a breakdown of operations by type
 */
function createOperationBreakdown(patch: JsonPatch): OperationBreakdown {
  const breakdown: OperationBreakdown = {};

  for (const operation of patch) {
    const op = operation.op as keyof OperationBreakdown;
    breakdown[op] = (breakdown[op] || 0) + 1;
  }

  return breakdown;
}
