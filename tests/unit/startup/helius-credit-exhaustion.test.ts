/**
 * Tests for Helius credit exhaustion detection.
 * DEPLOY-04: HeliusCreditExhaustedError thrown on 429 + max_usage_reached body.
 * Normal rate-limit 429s still retry with exponential backoff.
 */

import { HeliusFetcher, HeliusCreditExhaustedError } from '../../../src/fetchers/helius.js';

// Mock axios to simulate Helius 429 responses
jest.mock('axios', () => {
  const mockCreate = jest.fn();
  const axiosMock = {
    create: mockCreate,
    isAxiosError: (err: unknown) => err instanceof MockAxiosError,
  };
  return { ...axiosMock, default: axiosMock };
});

class MockAxiosError extends Error {
  response: { status: number; data: unknown };
  constructor(status: number, data: unknown) {
    super(`Request failed with status code ${status}`);
    this.name = 'AxiosError';
    this.response = { status, data };
  }
}

// Mock p-queue to execute immediately
jest.mock('p-queue', () => {
  return jest.fn().mockImplementation(() => ({
    add: jest.fn().mockImplementation((fn: () => Promise<unknown>) => fn()),
  }));
});

// Mock p-retry to expose onFailedAttempt so we can simulate retries
jest.mock('p-retry', () => {
  return jest.fn().mockImplementation(
    async (fn: () => Promise<unknown>, options: {
      retries: number;
      onFailedAttempt?: (error: { attemptNumber: number; retriesLeft: number; response?: { status?: number; data?: unknown } }) => Promise<void>;
    }) => {
      // Simulate the first attempt throwing, then call onFailedAttempt
      // We call fn() directly — the test controls whether it throws
      try {
        return await fn();
      } catch (err) {
        const axiosErr = err as MockAxiosError & { attemptNumber: number; retriesLeft: number };
        axiosErr.attemptNumber = 1;
        axiosErr.retriesLeft = options.retries - 1;
        if (options.onFailedAttempt) {
          await options.onFailedAttempt(axiosErr);
        }
        throw err;
      }
    }
  );
});

describe('HeliusCreditExhaustedError detection', () => {
  let fetcher: HeliusFetcher;
  let mockGet: jest.Mock;

  beforeEach(() => {
    mockGet = jest.fn();
    const mockClient = { get: mockGet };
    const axios = require('axios');
    (axios.create as jest.Mock).mockReturnValue(mockClient);
    fetcher = new HeliusFetcher('test-api-key');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('Test 1: When Helius 429 response body is {"error":"max_usage_reached"}, HeliusCreditExhaustedError is thrown', async () => {
    mockGet.mockRejectedValue(
      new MockAxiosError(429, { error: 'max_usage_reached' })
    );

    await expect(fetcher.fetchSwapHistory('addr1', 0)).rejects.toThrow(HeliusCreditExhaustedError);
  });

  test('Test 2: When Helius 429 response body contains "max_usage_reached" as substring, HeliusCreditExhaustedError is thrown', async () => {
    mockGet.mockRejectedValue(
      new MockAxiosError(429, { message: 'Error: max_usage_reached — upgrade plan', code: 429 })
    );

    await expect(fetcher.fetchSwapHistory('addr2', 0)).rejects.toThrow(HeliusCreditExhaustedError);
  });

  test('Test 3: When Helius 429 body does NOT contain "max_usage_reached", standard retry proceeds (error is NOT HeliusCreditExhaustedError)', async () => {
    const rateLimitError = new MockAxiosError(429, { error: 'rate_limit_exceeded' });
    mockGet.mockRejectedValue(rateLimitError);

    let caught: Error | null = null;
    try {
      await fetcher.fetchSwapHistory('addr3', 0);
    } catch (err) {
      caught = err as Error;
    }

    // The error should NOT be HeliusCreditExhaustedError
    expect(caught).not.toBeInstanceOf(HeliusCreditExhaustedError);
    // It should be the original axios error (or wrapped), not credit exhaustion
    expect(caught).toBeTruthy();
  });

  test('Test 4: HeliusCreditExhaustedError.message includes the string "max_usage_reached" for log clarity', () => {
    const err = new HeliusCreditExhaustedError();
    expect(err.message).toContain('max_usage_reached');
  });
});
