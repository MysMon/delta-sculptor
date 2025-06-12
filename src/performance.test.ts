import { describe, it, expect } from 'vitest';

import { measurePerformance, PerformanceOptions } from './performance';

describe('Performance Metrics', () => {
  it('should measure execution time', (): void => {
    const operation = () => {
      // Simulate some work
      const arr = Array.from({ length: 1000 }, (_, i) => i);
      return arr.reduce((sum, val) => sum + val, 0);
    };

    const result = measurePerformance(operation);

    expect(result.result).toBe(499500); // Sum of 0 to 999
    expect(result.duration).toBeGreaterThan(0);
    expect(result.success).toBe(true);
  });

  it('should handle operation errors', (): void => {
    const operation = () => {
      throw new Error('Test error');
    };

    const result = measurePerformance(operation) as any;

    expect(result.success).toBe(false);
    expect(result.error).toBeInstanceOf(Error);
    expect(result.error?.message).toBe('Test error');
    expect(result.duration).toBeGreaterThan(0);
  });

  it('should measure memory usage when enabled', (): void => {
    const operation = () => {
      // Create some objects to use memory
      const data = Array.from({ length: 100 }, () => ({ test: 'data' }));
      return data.length;
    };

    const result = measurePerformance(operation, { includeMemory: true });

    expect(result.result).toBe(100);
    expect(result.memoryUsage).toBeTypeOf('object');
    expect(result.memoryUsage?.heapUsed).toBeGreaterThan(0);
    expect(result.memoryUsage?.heapTotal).toBeTypeOf('number');
  });

  it('should calculate operations per second', (): void => {
    const operation = () => 42;

    const result = measurePerformance(operation, {
      calculateOpsPerSecond: true,
      iterations: 100,
    });

    expect(result.result).toBe(42);
    expect(result.opsPerSecond).toBeGreaterThan(0);
    expect(result.totalIterations).toBe(100);
  });

  it('should provide detailed timing information', (): void => {
    const operation = () => 'test';

    const result = measurePerformance(operation, {
      includeDetailedTiming: true,
    });

    expect(result.result).toBe('test');
    expect(result.detailedTiming).toBeTypeOf('object');
    expect(result.detailedTiming?.startTime).toBeGreaterThan(0);
    expect(result.detailedTiming?.endTime).toBeGreaterThan(0);
    expect(result.detailedTiming?.endTime).toBeGreaterThanOrEqual(
      result.detailedTiming?.startTime || 0
    );
  });

  it('should handle async operations', async (): Promise<void> => {
    const asyncOperation = async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
      return 'async result';
    };

    const result = await measurePerformance(asyncOperation);

    expect(result.result).toBe('async result');
    expect(result.duration).toBeGreaterThan(9); // At least 10ms
    expect(result.success).toBe(true);
  });

  it('should validate performance options', (): void => {
    const operation = () => 'test';

    const invalidOptions: PerformanceOptions = {
      iterations: -1,
    };

    expect(() => measurePerformance(operation, invalidOptions)).toThrow(
      'Invalid iterations count'
    );
  });

  it('should handle complex operations with multiple metrics', (): void => {
    const complexOperation = () => {
      const data = Array.from({ length: 1000 }, (_, i) => ({
        id: i,
        name: `Item ${i}`,
        value: Math.random(),
      }));

      return data
        .filter(item => item.value > 0.5)
        .map(item => ({ ...item, processed: true }))
        .reduce((acc, item) => acc + item.value, 0);
    };

    const result = measurePerformance(complexOperation, {
      includeMemory: true,
      calculateOpsPerSecond: true,
      includeDetailedTiming: true,
      iterations: 10,
    });

    expect(result.success).toBe(true);
    expect(result.result).toBeTypeOf('number');
    expect(result.duration).toBeGreaterThan(0);
    expect(result.memoryUsage).toBeTypeOf('object');
    expect(result.opsPerSecond).toBeGreaterThan(0);
    expect(result.detailedTiming).toBeTypeOf('object');
    expect(result.totalIterations).toBe(10);
  });

  it('should provide performance comparison baseline', (): void => {
    const simpleOperation = () => 1 + 1;
    const complexOperation = () => {
      let sum = 0;
      for (let i = 0; i < 10000; i++) {
        sum += Math.sqrt(i);
      }
      return sum;
    };

    const simpleResult = measurePerformance(simpleOperation, {
      iterations: 1000,
      calculateOpsPerSecond: true,
    });
    const complexResult = measurePerformance(complexOperation, {
      iterations: 100,
      calculateOpsPerSecond: true,
    });

    expect(simpleResult.opsPerSecond).toBeGreaterThan(
      complexResult.opsPerSecond || 0
    );
    expect(complexResult.duration).toBeGreaterThan(simpleResult.duration);
  });
});
