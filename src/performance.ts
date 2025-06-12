/**
 * Performance monitoring utilities for Delta Sculptor operations
 */

export interface PerformanceOptions {
  /** Include memory usage statistics */
  includeMemory?: boolean;
  /** Calculate operations per second */
  calculateOpsPerSecond?: boolean;
  /** Number of iterations for ops/sec calculation */
  iterations?: number;
  /** Include detailed timing information */
  includeDetailedTiming?: boolean;
}

export interface MemoryUsage {
  /** Heap memory used in bytes */
  heapUsed: number;
  /** Total heap memory in bytes */
  heapTotal: number;
  /** External memory in bytes */
  external: number;
  /** RSS memory in bytes */
  rss: number;
}

export interface DetailedTiming {
  /** Start time in milliseconds */
  startTime: number;
  /** End time in milliseconds */
  endTime: number;
  /** High resolution start time */
  hrStartTime: [number, number];
  /** High resolution end time */
  hrEndTime: [number, number];
}

export interface PerformanceResult<T = any> {
  /** The result of the operation */
  result?: T;
  /** Execution duration in milliseconds */
  duration: number;
  /** Whether the operation succeeded */
  success: boolean;
  /** Any error that occurred */
  error?: Error;
  /** Memory usage information */
  memoryUsage?: MemoryUsage;
  /** Operations per second */
  opsPerSecond?: number;
  /** Total iterations performed */
  totalIterations?: number;
  /** Detailed timing information */
  detailedTiming?: DetailedTiming;
}

/**
 * Measures the performance of an operation
 * @param operation The operation to measure
 * @param options Performance measurement options
 * @returns Performance metrics and operation result
 */
export function measurePerformance<T>(
  operation: () => T | Promise<T>,
  options: PerformanceOptions = {}
): PerformanceResult<T> | Promise<PerformanceResult<T>> {
  // Validate options
  if (options.iterations !== undefined && options.iterations < 1) {
    throw new Error('Invalid iterations count: must be at least 1');
  }

  const _iterations = options.iterations || 1;
  const _includeMemory = options.includeMemory || false;
  const _calculateOps = options.calculateOpsPerSecond || false;
  const _includeDetailedTiming = options.includeDetailedTiming || false;

  // Check if operation is async by testing the operation type
  let isAsync = false;
  try {
    const testResult = operation();
    isAsync = testResult instanceof Promise;

    if (isAsync) {
      return measureAsync(operation as () => Promise<T>, options);
    }
  } catch {
    // If the operation throws an error, we'll handle it in sync mode
  }

  return measureSync(operation as () => T, options);
}

function measureSync<T>(
  operation: () => T,
  options: PerformanceOptions
): PerformanceResult<T> {
  const iterations = options.iterations || 1;
  const includeMemory = options.includeMemory || false;
  const calculateOps = options.calculateOpsPerSecond || false;
  const includeDetailedTiming = options.includeDetailedTiming || false;

  let result: T;
  let memoryBefore: MemoryUsage | undefined;
  let memoryAfter: MemoryUsage | undefined;
  let detailedTiming: DetailedTiming | undefined;
  let error: Error | undefined;
  let success = true;

  // Memory measurement before
  if (includeMemory && typeof process !== 'undefined' && process.memoryUsage) {
    const memUsage = process.memoryUsage();
    memoryBefore = {
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      external: memUsage.external,
      rss: memUsage.rss,
    };
  }

  // Detailed timing setup
  if (includeDetailedTiming) {
    detailedTiming = {
      startTime: Date.now(),
      endTime: 0,
      hrStartTime:
        typeof process !== 'undefined' && process.hrtime
          ? process.hrtime()
          : [0, 0],
      hrEndTime: [0, 0],
    };
  }

  const startTime = performance.now();

  try {
    // Run iterations
    for (let i = 0; i < iterations; i++) {
      result = operation();
    }
  } catch (err) {
    error = err instanceof Error ? err : new Error(String(err));
    success = false;
  }

  const endTime = performance.now();
  const duration = endTime - startTime;

  // Detailed timing completion
  if (includeDetailedTiming && detailedTiming) {
    detailedTiming.endTime = Date.now();
    if (typeof process !== 'undefined' && process.hrtime) {
      detailedTiming.hrEndTime = process.hrtime();
    }
  }

  // Memory measurement after
  if (includeMemory && typeof process !== 'undefined' && process.memoryUsage) {
    const memUsage = process.memoryUsage();
    memoryAfter = {
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      external: memUsage.external,
      rss: memUsage.rss,
    };
  }

  // Calculate ops per second
  let opsPerSecond: number | undefined;
  if (calculateOps && success && duration > 0) {
    opsPerSecond = (iterations / duration) * 1000;
  }

  const performanceResult: PerformanceResult<T> = {
    result: result!,
    duration,
    success,
    error,
    totalIterations: success ? iterations : undefined,
    opsPerSecond,
    detailedTiming,
  };

  // Add memory usage delta if available
  if (memoryBefore && memoryAfter) {
    performanceResult.memoryUsage = {
      heapUsed: memoryAfter.heapUsed - memoryBefore.heapUsed,
      heapTotal: memoryAfter.heapTotal - memoryBefore.heapTotal,
      external: memoryAfter.external - memoryBefore.external,
      rss: memoryAfter.rss - memoryBefore.rss,
    };
  }

  return performanceResult;
}

async function measureAsync<T>(
  operation: () => Promise<T>,
  options: PerformanceOptions
): Promise<PerformanceResult<T>> {
  const iterations = options.iterations || 1;
  const includeMemory = options.includeMemory || false;
  const calculateOps = options.calculateOpsPerSecond || false;
  const includeDetailedTiming = options.includeDetailedTiming || false;

  let result: T;
  let memoryBefore: MemoryUsage | undefined;
  let memoryAfter: MemoryUsage | undefined;
  let detailedTiming: DetailedTiming | undefined;
  let error: Error | undefined;
  let success = true;

  // Memory measurement before
  if (includeMemory && typeof process !== 'undefined' && process.memoryUsage) {
    const memUsage = process.memoryUsage();
    memoryBefore = {
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      external: memUsage.external,
      rss: memUsage.rss,
    };
  }

  // Detailed timing setup
  if (includeDetailedTiming) {
    detailedTiming = {
      startTime: Date.now(),
      endTime: 0,
      hrStartTime:
        typeof process !== 'undefined' && process.hrtime
          ? process.hrtime()
          : [0, 0],
      hrEndTime: [0, 0],
    };
  }

  const startTime = performance.now();

  try {
    // Run iterations
    for (let i = 0; i < iterations; i++) {
      result = await operation();
    }
  } catch (err) {
    error = err instanceof Error ? err : new Error(String(err));
    success = false;
  }

  const endTime = performance.now();
  const duration = endTime - startTime;

  // Detailed timing completion
  if (includeDetailedTiming && detailedTiming) {
    detailedTiming.endTime = Date.now();
    if (typeof process !== 'undefined' && process.hrtime) {
      detailedTiming.hrEndTime = process.hrtime();
    }
  }

  // Memory measurement after
  if (includeMemory && typeof process !== 'undefined' && process.memoryUsage) {
    const memUsage = process.memoryUsage();
    memoryAfter = {
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      external: memUsage.external,
      rss: memUsage.rss,
    };
  }

  // Calculate ops per second
  let opsPerSecond: number | undefined;
  if (calculateOps && success && duration > 0) {
    opsPerSecond = (iterations / duration) * 1000;
  }

  const performanceResult: PerformanceResult<T> = {
    result: result!,
    duration,
    success,
    error,
    totalIterations: success ? iterations : undefined,
    opsPerSecond,
    detailedTiming,
  };

  // Add memory usage delta if available
  if (memoryBefore && memoryAfter) {
    performanceResult.memoryUsage = {
      heapUsed: memoryAfter.heapUsed - memoryBefore.heapUsed,
      heapTotal: memoryAfter.heapTotal - memoryBefore.heapTotal,
      external: memoryAfter.external - memoryBefore.external,
      rss: memoryAfter.rss - memoryBefore.rss,
    };
  }

  return performanceResult;
}
