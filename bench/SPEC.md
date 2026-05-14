# Benchmark Specification: registry-alloc

## Goal

Measure the heap memory allocation of the `SectorRegistry` constructor when parsing a map bitmap.

## Command

`npx playwright test bench/registry-alloc.spec.ts`

## Requirements

1.  **Measurement Method:** Use `performance.measureUserAgentSpecificMemory()` if available (requires COOP/COEP headers in the test environment). Fall back to `performance.memory.usedJSHeapSize` if necessary, documenting the fallback.
2.  **Procedure:**
    - Initialize environment.
    - Measure baseline memory.
    - Instantiate `new SectorRegistry(bitmap)`.
    - Measure memory after instantiation.
    - Calculate delta.
3.  **Iteration:** Perform at least 10 runs and calculate the median.
4.  **Output:** Update `bench/baselines.json` with the median value under the key `b1.constructor_alloc_bytes`.
5.  **Hardware/Environment:** Capture and record hardware info and measurement method.

## Principles Compliance

- **PR-3 (Performance ROI):** Enables objective measurement of flattening optimizations.
- **PR-1 (Hobbyist Deployability):** While the benchmark may use specialized headers, the production engine must remain header-free.
