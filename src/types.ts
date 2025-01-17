/**
 * RFC 6902: JSON Patch Operation
 * https://www.rfc-editor.org/rfc/rfc6902
 */
export interface JsonPatchOperation {
    op: "add" | "remove" | "replace" | "move" | "copy" | "test";
    path: string;
    from?: string; // move/copyで使用
    value?: any;   // add/replace/test などで使用
  }
  
/** JSON Patch は Operation の配列 */
export type JsonPatch = JsonPatchOperation[];