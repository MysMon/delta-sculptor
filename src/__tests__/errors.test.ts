import { describe, test, expect } from 'vitest';

import { PatchError, PatchErrorCode } from '../errors';

describe('PatchError', () => {
  test('creates basic error instance', () => {
    const error = new PatchError(
      PatchErrorCode.INVALID_POINTER,
      'Test error message'
    );

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(PatchError);
    expect(error.code).toBe(PatchErrorCode.INVALID_POINTER);
    expect(error.message).toBe('Test error message');
    expect(error.name).toBe('PatchError');
  });

  test('creates error with path and operation', () => {
    const error = new PatchError(
      PatchErrorCode.INVALID_OPERATION,
      'Invalid operation',
      '/test/path',
      'add'
    );

    expect(error.code).toBe(PatchErrorCode.INVALID_OPERATION);
    expect(error.path).toBe('/test/path');
    expect(error.operation).toBe('add');
  });

  test('invalidPointer static method', () => {
    const error = PatchError.invalidPointer('/invalid/path');

    expect(error.code).toBe(PatchErrorCode.INVALID_POINTER);
    expect(error.path).toBe('/invalid/path');
    expect(error.message).toContain('/invalid/path');
  });

  test('invalidOperation static method', () => {
    const error = PatchError.invalidOperation('invalid_op');

    expect(error.code).toBe(PatchErrorCode.INVALID_OPERATION);
    expect(error.operation).toBe('invalid_op');
    expect(error.message).toContain('invalid_op');
  });

  test('testFailed static method', () => {
    const error = PatchError.testFailed('/test', 'expected', 'actual');

    expect(error.code).toBe(PatchErrorCode.TEST_OPERATION_FAILED);
    expect(error.path).toBe('/test');
    expect(error.operation).toBe('test');
    expect(error.message).toContain('expected');
    expect(error.message).toContain('actual');
  });

  test('arrayIndexError static method', () => {
    const error = PatchError.arrayIndexError('/arr/5', '5');

    expect(error.code).toBe(PatchErrorCode.ARRAY_INDEX_ERROR);
    expect(error.path).toBe('/arr/5');
    expect(error.message).toContain('5');
  });

  test('missingField static method', () => {
    const error = PatchError.missingField('move', 'from');

    expect(error.code).toBe(PatchErrorCode.MISSING_REQUIRED_FIELD);
    expect(error.operation).toBe('move');
    expect(error.message).toContain('from');
  });

  test('rootOperationError static method', () => {
    const error = PatchError.rootOperationError('remove');

    expect(error.code).toBe(PatchErrorCode.ROOT_OPERATION_ERROR);
    expect(error.path).toBe('/');
    expect(error.operation).toBe('remove');
  });

  test('circularReference static method', () => {
    const error = PatchError.circularReference('/obj/self');

    expect(error.code).toBe(PatchErrorCode.CIRCULAR_REFERENCE);
    expect(error.path).toBe('/obj/self');
    expect(error.message).toContain('Circular reference');
  });

  test('typeMismatch static method', () => {
    const error = PatchError.typeMismatch('/data', 'array', 'object');

    expect(error.code).toBe(PatchErrorCode.TYPE_MISMATCH);
    expect(error.path).toBe('/data');
    expect(error.message).toContain('array');
    expect(error.message).toContain('object');
  });

  test('error codes are correctly defined', () => {
    expect(Object.keys(PatchErrorCode)).toEqual([
      'INVALID_POINTER',
      'INVALID_OPERATION',
      'TEST_OPERATION_FAILED',
      'ARRAY_INDEX_ERROR',
      'MISSING_REQUIRED_FIELD',
      'ROOT_OPERATION_ERROR',
      'CIRCULAR_REFERENCE',
      'TYPE_MISMATCH',
      'INTERNAL_ERROR',
    ]);
  });
});
