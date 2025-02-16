/**
 * Type definitions for JSON Patch operations and related types.
 * Based on RFC 6902: https://www.rfc-editor.org/rfc/rfc6902
 */

/**
 * Base interface for all JSON Patch operations
 */
export interface BaseJsonPatchOperation {
  /** The operation type */
  op: 'add' | 'remove' | 'replace' | 'move' | 'copy' | 'test';
  /** JSON Pointer path where the operation should be performed */
  path: string;
  /** Source path for move/copy operations */
  from?: string;
  /** Value to add, replace, or test against */
  value?: any;
}

/**
 * Extended patch operation for batch removal of array elements
 */
export interface BatchRemoveOperation extends BaseJsonPatchOperation {
  op: 'remove';
  /** Number of sequential elements to remove */
  count?: number;
}

/**
 * Extended patch operation for batch addition of array elements
 */
export interface BatchAddOperation extends BaseJsonPatchOperation {
  op: 'add';
  /** Array of values for sequential addition */
  value: any[];
}

/**
 * Union type for all possible patch operations
 */
export interface JsonPatchOperation {
  op: 'add' | 'remove' | 'replace' | 'move' | 'copy' | 'test';
  path: string;
  from?: string;
  value?: unknown;
  count?: number;
}

/**
 * JSON Patch is an array of Operations
 */
export type JsonPatch = JsonPatchOperation[];

/**
 * Result of a patch operation
 */
export interface PatchResult<T = any> {
  /** The resulting object after applying the patch */
  result: T;
  /** Whether the patch was applied successfully */
  success: boolean;
  /** Any error that occurred during patching */
  error?: Error;
  /** The patch that was applied */
  appliedPatch?: JsonPatch;
  /** Inverse patch that can undo the changes */
  inversePatch?: JsonPatch;
}

/**
 * Status of a patch operation
 */
export interface PatchStatus {
  /** Index of the current operation */
  operationIndex: number;
  /** Total number of operations */
  totalOperations: number;
  /** Any error that occurred */
  error?: Error;
  /** Whether the operation was successful */
  success: boolean;
}

/**
 * Type for objects that can be patched
 */
export type Patchable = { [key: string]: any } | any[];

/**
 * Type for JSON pointers as defined in RFC 6901
 */
export type JsonPointer = string;

/**
 * Information about where in an object a reference was found
 */
export interface ReferenceInfo {
  /** The path to where the reference was found */
  path: JsonPointer;
  /** The value that was referenced */
  value: any;
  /** Whether this is a circular reference */
  isCircular: boolean;
}

export interface ArrayOperation {
  type: 'add' | 'remove' | 'move';
  index: number;
  value?: unknown;
  count?: number;
  from?: number;
}
