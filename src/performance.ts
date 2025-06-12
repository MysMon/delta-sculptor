/**
 * Performance monitoring utilities for Delta Sculptor operations
 * Enhanced with comprehensive benchmarking capabilities
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
  /** Warm up iterations before actual measurement */
  warmupIterations?: number;
  /** Enable garbage collection between measurements (Node.js only) */
  forceGC?: boolean;
}

export interface BenchmarkOptions {
  /** Minimum number of samples to collect */
  minSamples?: number;
  /** Maximum time to spend benchmarking in ms */
  maxTime?: number;
  /** Target margin of error (0-1) */
  targetMarginOfError?: number;
  /** Include statistical analysis */
  includeStats?: boolean;
}

export interface BenchmarkStats {
  /** Mean execution time */
  mean: number;
  /** Median execution time */
  median: number;
  /** Standard deviation */
  stdDev: number;
  /** Minimum time */
  min: number;
  /** Maximum time */
  max: number;
  /** 95th percentile */
  p95: number;
  /** 99th percentile */
  p99: number;
  /** Coefficient of variation */
  cv: number;
  /** Margin of error */
  marginOfError: number;
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

export interface BenchmarkResult<T = any> {
  /** The result of the operation */
  result?: T;
  /** Statistical analysis of execution times */
  stats: BenchmarkStats;
  /** All sample durations */
  samples: number[];
  /** Whether the benchmark succeeded */
  success: boolean;
  /** Any error that occurred */
  error?: Error;
  /** Total time spent benchmarking */
  totalTime: number;
  /** Number of samples collected */
  sampleCount: number;
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

  // Warmup if requested
  if (options.warmupIterations && options.warmupIterations > 0) {
    try {
      for (let i = 0; i < options.warmupIterations; i++) {
        void operation();
      }
    } catch {
      // Ignore warmup errors
    }
  }

  // Force GC if available and requested
  if (options.forceGC && typeof global !== 'undefined' && global.gc) {
    global.gc();
  }

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

/**
 * Runs a comprehensive benchmark of an operation
 * Collects multiple samples and provides statistical analysis
 */
export function benchmark<T>(
  operation: () => T,
  options: BenchmarkOptions = {}
): BenchmarkResult<T> {
  const {
    minSamples = 100,
    maxTime = 5000,
    targetMarginOfError = 0.01,
    includeStats = true,
  } = options;

  const samples: number[] = [];
  let result: T;
  let error: Error | undefined;
  let success = true;
  const startBenchmark = performance.now();

  // Warmup - run a few iterations to stabilize performance
  try {
    for (let i = 0; i < Math.min(10, minSamples); i++) {
      operation();
    }
  } catch (err) {
    // Ignore warmup errors
  }

  // Force garbage collection if available
  if (typeof global !== 'undefined' && global.gc) {
    global.gc();
  }

  try {
    while (
      samples.length < minSamples ||
      (samples.length < 1000 && performance.now() - startBenchmark < maxTime)
    ) {
      const start = performance.now();
      result = operation();
      const end = performance.now();

      samples.push(end - start);

      // Check if we've reached target precision
      if (samples.length >= minSamples && samples.length % 10 === 0) {
        const stats = calculateStats(samples);
        if (stats.marginOfError < targetMarginOfError) {
          break;
        }
      }
    }
  } catch (err) {
    error = err instanceof Error ? err : new Error(String(err));
    success = false;
  }

  const totalTime = performance.now() - startBenchmark;
  const stats = includeStats ? calculateStats(samples) : getBasicStats(samples);

  return {
    result: result!,
    stats,
    samples,
    success,
    error,
    totalTime,
    sampleCount: samples.length,
  };
}

/**
 * Calculates comprehensive statistics for benchmark samples
 */
function calculateStats(samples: number[]): BenchmarkStats {
  if (samples.length === 0) {
    return {
      mean: 0,
      median: 0,
      stdDev: 0,
      min: 0,
      max: 0,
      p95: 0,
      p99: 0,
      cv: 0,
      marginOfError: 0,
    };
  }

  const sorted = [...samples].sort((a, b) => a - b);
  const n = samples.length;
  const mean = samples.reduce((sum, val) => sum + val, 0) / n;

  // Calculate standard deviation
  const variance =
    samples.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / (n - 1);
  const stdDev = Math.sqrt(variance);

  // Percentiles
  const median = getPercentile(sorted, 0.5);
  const p95 = getPercentile(sorted, 0.95);
  const p99 = getPercentile(sorted, 0.99);

  // Coefficient of variation
  const cv = mean > 0 ? stdDev / mean : 0;

  // Margin of error (95% confidence interval)
  const marginOfError = (1.96 * stdDev) / Math.sqrt(n) / mean;

  return {
    mean,
    median,
    stdDev,
    min: sorted[0],
    max: sorted[n - 1],
    p95,
    p99,
    cv,
    marginOfError,
  };
}

/**
 * Calculates basic statistics for when full stats aren't needed
 */
function getBasicStats(samples: number[]): BenchmarkStats {
  if (samples.length === 0) {
    return {
      mean: 0,
      median: 0,
      stdDev: 0,
      min: 0,
      max: 0,
      p95: 0,
      p99: 0,
      cv: 0,
      marginOfError: 0,
    };
  }

  const mean = samples.reduce((sum, val) => sum + val, 0) / samples.length;
  const min = Math.min(...samples);
  const max = Math.max(...samples);

  return {
    mean,
    median: mean,
    stdDev: 0,
    min,
    max,
    p95: max,
    p99: max,
    cv: 0,
    marginOfError: 0,
  };
}

/**
 * Calculates percentile value from sorted array
 */
function getPercentile(sortedArray: number[], percentile: number): number {
  const index = percentile * (sortedArray.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index % 1;

  if (upper >= sortedArray.length) return sortedArray[sortedArray.length - 1];
  if (lower === upper) return sortedArray[lower];

  return sortedArray[lower] * (1 - weight) + sortedArray[upper] * weight;
}

/**
 * Compares the performance of multiple operations
 */
export function comparePerformance<T>(
  operations: Record<string, () => T>,
  options: BenchmarkOptions = {}
): Record<string, BenchmarkResult<T>> {
  const results: Record<string, BenchmarkResult<T>> = {};

  for (const [name, operation] of Object.entries(operations)) {
    results[name] = benchmark(operation, options);
  }

  return results;
}

/**
 * Creates a performance report comparing multiple benchmark results
 */
export function createPerformanceReport(
  results: Record<string, BenchmarkResult<any>>
): string {
  const entries = Object.entries(results);
  if (entries.length === 0) return 'No benchmark results to report.';

  // Find the fastest operation for comparison
  const fastest = entries.reduce(
    (best, [name, result]) =>
      result.stats.mean < best[1].stats.mean ? [name, result] : best,
    entries[0]
  );

  let report = `Performance Benchmark Report\n`;
  report += `===============================\n\n`;

  for (const [name, result] of entries) {
    const relative = result.stats.mean / fastest[1].stats.mean;
    const relativeText =
      relative === 1 ? ' (fastest)' : ` (${relative.toFixed(2)}x slower)`;

    report += `${name}${relativeText}:\n`;
    report += `  Mean: ${result.stats.mean.toFixed(3)}ms\n`;
    report += `  Median: ${result.stats.median.toFixed(3)}ms\n`;
    report += `  Min: ${result.stats.min.toFixed(3)}ms\n`;
    report += `  Max: ${result.stats.max.toFixed(3)}ms\n`;
    report += `  StdDev: ${result.stats.stdDev.toFixed(3)}ms\n`;
    report += `  Samples: ${result.sampleCount}\n`;
    report += `  Ops/sec: ${(1000 / result.stats.mean).toFixed(0)}\n\n`;
  }

  return report;
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
