import { debugPatch, DebugOptions, DebugInfo } from './debug';
import { createPatch, CreateDiffOptions } from './diff';
import { createInversePatch, applyPatchWithInverse } from './inverse';
import {
  applyPatch,
  applyPatchImmutable,
  applyPatchWithRollback,
  PatchOptions,
} from './patch';
import {
  measurePerformance,
  PerformanceOptions,
  PerformanceResult,
} from './performance';
import {
  JsonPatch,
  JsonPatchOperation,
  PatchResult,
  PatchStatus,
  Patchable,
} from './types';
import { validatePatch } from './validate';

/**
 * Options for creating inverse patches
 */
export interface InversePatchOptions extends PatchOptions {
  /**
   * Whether to validate the inverse patch before returning
   */
  validateInverse?: boolean;
}

/**
 * Result of applying a patch operation
 */
export interface PatchApplyResult<T = any> {
  /** The resulting object after applying the patch */
  result: T;
  /** Whether the patch was applied successfully */
  success: boolean;
  /** The inverse patch that can undo the changes, if available */
  inverse?: JsonPatch;
  /** Any validation or application errors that occurred */
  error?: Error;
}

export {
  CreateDiffOptions,
  PatchOptions,
  JsonPatch,
  JsonPatchOperation,
  PatchResult,
  PatchStatus,
  Patchable,
  PerformanceOptions,
  PerformanceResult,
  DebugOptions,
  DebugInfo,
};

/**
 * Main class for JSON patch operations with enhanced functionality
 */
export class DeltaSculptor {
  /**
   * Validates a JSON Patch for correctness
   * @param patch The JSON Patch to validate
   * @throws {Error} If the patch is invalid
   */
  static validatePatch(patch: JsonPatch): void {
    validatePatch(patch);
  }

  /**
   * Safely validates and applies a patch, returning a result object
   * @param target The object to patch
   * @param patch The JSON Patch to apply
   * @param options Configuration options
   * @returns Object containing result and status information
   */
  static tryApplyPatch<T extends Patchable>(
    target: T,
    patch: JsonPatch,
    options?: PatchOptions
  ): PatchResult<T> {
    try {
      const result = applyPatchImmutable(target, patch, options);
      return {
        result,
        success: true,
        appliedPatch: patch,
      };
    } catch (error) {
      if (error instanceof Error) {
        return {
          result: target,
          success: false,
          error,
        };
      }
      return {
        result: target,
        success: false,
        error: new Error('Unknown error applying patch'),
      };
    }
  }

  /**
   * Creates a JSON Patch that transforms oldObj into newObj
   * @param oldObj The source object
   * @param newObj The target object
   * @param options Configuration options for diff creation
   * @returns A JSON Patch array that transforms oldObj into newObj
   * @throws {Error} If maxDepth is exceeded, circular reference is detected, or invalid input is provided
   */
  static createPatch<T extends Patchable>(
    oldObj: T,
    newObj: T,
    options: CreateDiffOptions = {}
  ): JsonPatch {
    const defaultOptions = {
      detectMove: false,
      batchArrayOps: true,
      maxDepth: 50,
    };
    return createPatch({
      oldObj,
      newObj,
      params: { ...defaultOptions, ...options },
    });
  }

  /**
   * Applies a patch to the target object, modifying it in place
   * @param target The object to patch
   * @param patch The JSON Patch to apply
   * @param options Configuration options for patch application
   * @throws {Error} If the patch is invalid or cannot be applied
   */
  static applyPatch<T extends Patchable>(
    target: T,
    patch: JsonPatch,
    options?: PatchOptions
  ): void {
    applyPatch(target, patch, options);
  }

  /**
   * Applies a patch and returns a new object, leaving the original unchanged
   * @param target The object to patch
   * @param patch The JSON Patch to apply
   * @param options Configuration options for patch application
   * @returns A new object with the patch applied
   * @throws {Error} If the patch is invalid or cannot be applied
   */
  static applyPatchImmutable<T extends Patchable>(
    target: T,
    patch: JsonPatch,
    options?: PatchOptions
  ): T {
    return applyPatchImmutable(target, patch, options);
  }

  /**
   * Applies a patch and returns an inverse patch that can undo the changes
   * @param target The object to patch
   * @param patch The JSON Patch to apply
   * @param options Configuration options for inverse patch creation
   * @returns An inverse JSON Patch that can undo the changes
   * @throws {Error} If the patch is invalid or cannot be applied
   */
  static applyPatchWithInverse<T extends Patchable>(
    target: T,
    patch: JsonPatch,
    options?: InversePatchOptions
  ): JsonPatch {
    return applyPatchWithInverse(target, patch, options || {});
  }

  /**
   * Applies an inverse patch to undo changes
   * @param target The object to restore
   * @param inversePatch The inverse JSON Patch to apply
   * @param options Configuration options for patch application
   * @throws {Error} If the inverse patch is invalid or cannot be applied
   */
  static applyInversePatch<T extends Patchable>(
    target: T,
    inversePatch: JsonPatch,
    options?: PatchOptions
  ): void {
    applyPatch(target, inversePatch, options);
  }

  /**
   * Creates an inverse patch from the original object and a forward patch
   * @param prePatchObj The original object before patching
   * @param patch The forward JSON Patch
   * @param options Configuration options for inverse patch creation
   * @returns An inverse JSON Patch that can undo the forward patch
   * @throws {Error} If the patch is invalid or cannot be inverted
   */
  static createInversePatch<T extends Patchable>(
    prePatchObj: T,
    patch: JsonPatch,
    options?: InversePatchOptions
  ): JsonPatch {
    return createInversePatch(prePatchObj, patch, options);
  }

  /**
   * Applies a patch with automatic rollback on failure
   * @param target The object to patch
   * @param patch The JSON Patch to apply
   * @param options Configuration options for patch application
   * @throws {Error} If the patch cannot be applied (target will be rolled back)
   */
  static applyPatchWithRollback<T extends Patchable>(
    target: T,
    patch: JsonPatch,
    options?: PatchOptions
  ): void {
    applyPatchWithRollback(target, patch, options);
  }

  /**
   * Measures the performance of an operation
   * @param operation The operation to measure
   * @param options Performance measurement options
   * @returns Performance metrics and operation result
   */
  static measurePerformance<T>(
    operation: () => T | Promise<T>,
    options?: PerformanceOptions
  ): PerformanceResult<T> | Promise<PerformanceResult<T>> {
    return measurePerformance(operation, options);
  }

  /**
   * Provides detailed debugging information about a patch
   * @param patch The JSON Patch to debug
   * @param options Debug configuration options
   * @returns Debug information and analysis
   */
  static debugPatch(patch: JsonPatch, options?: DebugOptions): DebugInfo {
    return debugPatch(patch, options);
  }
}
