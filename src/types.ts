/**
 * RFC 6902: JSON Patch Operation
 * https://www.rfc-editor.org/rfc/rfc6902
 */
export interface BaseJsonPatchOperation {
  op: 'add' | 'remove' | 'replace' | 'move' | 'copy' | 'test';
  path: string;
  from?: string;
  value?: any;
}

/**
 * Extended patch operation types for batched operations
 */
export interface BatchRemoveOperation extends BaseJsonPatchOperation {
  op: 'remove';
  count?: number; // Number of sequential elements to remove
}

export interface BatchAddOperation extends BaseJsonPatchOperation {
  op: 'add';
  value: any[]; // Array of values for sequential addition
}

export type JsonPatchOperation =
  | BaseJsonPatchOperation
  | BatchRemoveOperation
  | BatchAddOperation;

/** JSON Patch is an array of Operations */
export type JsonPatch = JsonPatchOperation[];
