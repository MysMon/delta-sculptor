export enum PatchErrorCode {
  INVALID_POINTER = 'INVALID_POINTER',
  INVALID_OPERATION = 'INVALID_OPERATION',
  INVALID_PATCH = 'INVALID_PATCH',
  INVALID_TARGET = 'INVALID_TARGET',
  TEST_OPERATION_FAILED = 'TEST_OPERATION_FAILED',
  ARRAY_INDEX_ERROR = 'ARRAY_INDEX_ERROR',
  MISSING_REQUIRED_FIELD = 'MISSING_REQUIRED_FIELD',
  ROOT_OPERATION_ERROR = 'ROOT_OPERATION_ERROR',
  CIRCULAR_REFERENCE = 'CIRCULAR_REFERENCE',
  TYPE_MISMATCH = 'TYPE_MISMATCH',
  MAX_DEPTH_EXCEEDED = 'MAX_DEPTH_EXCEEDED',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  PATH_NOT_FOUND = 'PATH_NOT_FOUND',
}

export class PatchError extends Error {
  constructor(
    public readonly code: PatchErrorCode,
    message: string,
    public readonly path?: string,
    public readonly operation?: string
  ) {
    super(message);
    this.name = 'PatchError';
    Object.setPrototypeOf(this, PatchError.prototype);
  }

  static invalidPointer(path: string): PatchError {
    return new PatchError(
      PatchErrorCode.INVALID_POINTER,
      `Invalid JSON Pointer: ${path}`,
      path
    );
  }

  static pathNotFound(path: string): PatchError {
    return new PatchError(
      PatchErrorCode.PATH_NOT_FOUND,
      `Path not found: ${path}`,
      path
    );
  }

  static invalidOperation(operation: string): PatchError {
    return new PatchError(
      PatchErrorCode.INVALID_OPERATION,
      `Invalid operation: ${operation}`,
      undefined,
      operation
    );
  }

  static invalidPatch(message: string): PatchError {
    return new PatchError(PatchErrorCode.INVALID_PATCH, message);
  }

  static invalidTarget(message: string): PatchError {
    return new PatchError(PatchErrorCode.INVALID_TARGET, message);
  }

  static testFailed(path: string, expected: any, actual: any): PatchError {
    return new PatchError(
      PatchErrorCode.TEST_OPERATION_FAILED,
      `Test operation failed at path: ${path} (expected: ${JSON.stringify(
        expected
      )}, actual: ${JSON.stringify(actual)})`,
      path,
      'test'
    );
  }

  static arrayIndexError(path: string, index: string): PatchError {
    return new PatchError(
      PatchErrorCode.ARRAY_INDEX_ERROR,
      `Invalid array index: ${index} at path: ${path}`,
      path
    );
  }

  static missingField(operation: string, field: string): PatchError {
    return new PatchError(
      PatchErrorCode.MISSING_REQUIRED_FIELD,
      `'${operation}' operation requires '${field}' field`,
      undefined,
      operation
    );
  }

  static rootOperationError(operation: string): PatchError {
    return new PatchError(
      PatchErrorCode.ROOT_OPERATION_ERROR,
      `Cannot ${operation} the root object`,
      '/',
      operation
    );
  }

  static circularReference(path: string): PatchError {
    return new PatchError(
      PatchErrorCode.CIRCULAR_REFERENCE,
      `Circular reference detected at path: ${path}`,
      path
    );
  }

  static typeMismatch(
    path: string,
    expected: string,
    actual: string
  ): PatchError {
    return new PatchError(
      PatchErrorCode.TYPE_MISMATCH,
      `Type mismatch at path: ${path} (expected: ${expected}, actual: ${actual})`,
      path
    );
  }

  static maxDepthExceeded(path: string, maxDepth: number): PatchError {
    return new PatchError(
      PatchErrorCode.MAX_DEPTH_EXCEEDED,
      `Maximum depth of ${maxDepth} exceeded at path: ${path}`,
      path
    );
  }

  static invalidPointerFormat(message: string): PatchError {
    return new PatchError(PatchErrorCode.INVALID_POINTER, message);
  }
}
