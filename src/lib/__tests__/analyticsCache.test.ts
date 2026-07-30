// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import type { DashboardAnalyticsResult } from '../dashboardAnalytics';

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));

vi.mock('../supabaseClient', () => ({
  supabase: {
    functions: {
      invoke: invokeMock,
    },
  },
}));

import {
  getCachedData,
  setCachedData,
  invalidateCache,
  buildCacheKey,
  useDashboardCache,
  CACHE_KEY_PREFIX,
  CLIENT_CACHE_TTL,
} from '../analyticsCache';

/**
 * DashboardAnalyticsResult is a large structural type; tests only care about
 * round-tripping through JSON, so a marker object is cast to the type.
 */
const makeResult = (marker: string): DashboardAnalyticsResult =>
  ({ marker, metrics: [] } as unknown as DashboardAnalyticsResult);

const markerOf = (result: DashboardAnalyticsResult | null): string | undefined =>
  (result as unknown as { marker?: string } | null)?.marker;

describe('analyticsCache', () => {
  beforeEach(() => {
    localStorage.clear();
    invokeMock.mockReset();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  describe('buildCacheKey', () => {
    it('should build a preset-only key when no custom range is given', () => {
      expect(buildCacheKey('last7')).toBe(`${CACHE_KEY_PREFIX}:last7`);
    });

    it('should build a custom-range key when custom dates are given', () => {
      expect(buildCacheKey('custom', '2026-07-01', '2026-07-15')).toBe(
        `${CACHE_KEY_PREFIX}:custom:2026-07-01:2026-07-15`,
      );
    });
  });

  describe('getCachedData / setCachedData', () => {
    it('should store and retrieve data from cache', () => {
      const result = makeResult('stored');
      setCachedData('last7', result);

      const retrieved = getCachedData('last7');
      expect(retrieved).not.toBeNull();
      expect(markerOf(retrieved)).toBe('stored');
    });

    it('should return null when nothing is cached', () => {
      expect(getCachedData('last30')).toBeNull();
    });

    it('should return null for expired cache', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-07-30T10:00:00Z'));

      setCachedData('today', makeResult('expiring'));
      expect(getCachedData('today')).not.toBeNull();

      vi.advanceTimersByTime(CLIENT_CACHE_TTL + 1);

      expect(getCachedData('today')).toBeNull();
    });

    it('should still return data just before the TTL boundary', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-07-30T10:00:00Z'));

      setCachedData('today', makeResult('fresh'));
      vi.advanceTimersByTime(CLIENT_CACHE_TTL - 1000);

      expect(markerOf(getCachedData('today'))).toBe('fresh');
    });

    it('should clear expired entry on read', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-07-30T10:00:00Z'));

      setCachedData('thisWeek', makeResult('stale'));
      const key = buildCacheKey('thisWeek');
      expect(localStorage.getItem(key)).not.toBeNull();

      vi.advanceTimersByTime(CLIENT_CACHE_TTL + 1);
      getCachedData('thisWeek');

      expect(localStorage.getItem(key)).toBeNull();
    });

    it('should handle custom date range caching separately', () => {
      setCachedData('custom', makeResult('rangeA'), '2026-07-01', '2026-07-15');
      setCachedData('custom', makeResult('rangeB'), '2026-07-16', '2026-07-31');

      expect(markerOf(getCachedData('custom', '2026-07-01', '2026-07-15'))).toBe('rangeA');
      expect(markerOf(getCachedData('custom', '2026-07-16', '2026-07-31'))).toBe('rangeB');
      expect(getCachedData('custom', '2026-01-01', '2026-01-31')).toBeNull();
    });

    it('should not collide between a preset key and a custom key', () => {
      setCachedData('last7', makeResult('preset'));
      setCachedData('last7', makeResult('customised'), '2026-07-01', '2026-07-07');

      expect(markerOf(getCachedData('last7'))).toBe('preset');
      expect(markerOf(getCachedData('last7', '2026-07-01', '2026-07-07'))).toBe('customised');
    });

    it('should silently handle localStorage errors', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const setItem = vi
        .spyOn(Storage.prototype, 'setItem')
        .mockImplementation(() => {
          throw new Error('QuotaExceededError');
        });
      const getItem = vi
        .spyOn(Storage.prototype, 'getItem')
        .mockImplementation(() => {
          throw new Error('SecurityError');
        });

      expect(() => setCachedData('last7', makeResult('nope'))).not.toThrow();
      expect(getCachedData('last7')).toBeNull();
      expect(warn).toHaveBeenCalled();

      setItem.mockRestore();
      getItem.mockRestore();
    });

    it('should silently handle corrupt JSON and clear the entry', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const key = buildCacheKey('last30');
      localStorage.setItem(key, 'not-json{{{');

      expect(getCachedData('last30')).toBeNull();
      expect(warn).toHaveBeenCalled();
      expect(localStorage.getItem(key)).toBeNull();
    });

    it('should return null for a structurally invalid entry', () => {
      localStorage.setItem(buildCacheKey('today'), JSON.stringify({ nope: true }));
      expect(getCachedData('today')).toBeNull();
    });
  });

  describe('invalidateCache', () => {
    it('should invalidate specific preset cache', () => {
      setCachedData('last7', makeResult('seven'));
      setCachedData('last30', makeResult('thirty'));

      invalidateCache('last7');

      expect(getCachedData('last7')).toBeNull();
      expect(markerOf(getCachedData('last30'))).toBe('thirty');
    });

    it('should invalidate custom-range entries belonging to the preset', () => {
      setCachedData('custom', makeResult('rangeA'), '2026-07-01', '2026-07-15');
      setCachedData('custom', makeResult('rangeB'), '2026-07-16', '2026-07-31');
      setCachedData('last7', makeResult('seven'));

      invalidateCache('custom');

      expect(getCachedData('custom', '2026-07-01', '2026-07-15')).toBeNull();
      expect(getCachedData('custom', '2026-07-16', '2026-07-31')).toBeNull();
      expect(markerOf(getCachedData('last7'))).toBe('seven');
    });

    it('should invalidate all caches when no preset specified', () => {
      setCachedData('last7', makeResult('seven'));
      setCachedData('last30', makeResult('thirty'));
      setCachedData('custom', makeResult('rangeA'), '2026-07-01', '2026-07-15');
      localStorage.setItem('unrelated_key', 'keep-me');

      invalidateCache();

      expect(getCachedData('last7')).toBeNull();
      expect(getCachedData('last30')).toBeNull();
      expect(getCachedData('custom', '2026-07-01', '2026-07-15')).toBeNull();
      expect(localStorage.getItem('unrelated_key')).toBe('keep-me');
    });

    it('should not throw when localStorage access fails', () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
        throw new Error('SecurityError');
      });

      expect(() => invalidateCache('last7')).not.toThrow();
      expect(() => invalidateCache()).not.toThrow();
    });
  });

  describe('useDashboardCache', () => {
    it('should return cached data immediately without fetching', async () => {
      setCachedData('last7', makeResult('cached'));

      const { result } = renderHook(() => useDashboardCache('last7'));

      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(markerOf(result.current.data)).toBe('cached');
      expect(result.current.error).toBeNull();
      expect(invokeMock).not.toHaveBeenCalled();
    });

    it('should fetch from the edge function on cache miss and populate the cache', async () => {
      invokeMock.mockResolvedValue({ data: makeResult('fetched'), error: null });

      const { result } = renderHook(() => useDashboardCache('last7'));

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(markerOf(result.current.data)).toBe('fetched');
      expect(result.current.error).toBeNull();
      expect(invokeMock).toHaveBeenCalledTimes(1);

      const [fnName, invokeOptions] = invokeMock.mock.calls[0] as [
        string,
        { body: { startDate: string; endDate: string; preset: string } },
      ];
      expect(fnName).toBe('get-dashboard-analytics');
      expect(invokeOptions.body.preset).toBe('last7');
      expect(invokeOptions.body.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(invokeOptions.body.endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);

      expect(markerOf(getCachedData('last7'))).toBe('fetched');
    });

    it('should pass custom range dates through to the edge function', async () => {
      invokeMock.mockResolvedValue({ data: makeResult('custom'), error: null });

      const { result } = renderHook(() =>
        useDashboardCache('custom', '2026-07-01', '2026-07-15'),
      );

      await waitFor(() => expect(result.current.loading).toBe(false));

      const [, invokeOptions] = invokeMock.mock.calls[0] as [
        string,
        { body: { startDate: string; endDate: string; preset: string } },
      ];
      expect(invokeOptions.body.startDate).toBe('2026-07-01');
      expect(invokeOptions.body.endDate).toBe('2026-07-15');
      expect(markerOf(getCachedData('custom', '2026-07-01', '2026-07-15'))).toBe('custom');
    });

    it('should surface edge function errors and call onError', async () => {
      invokeMock.mockResolvedValue({ data: null, error: { message: 'boom' } });
      const onError = vi.fn();

      const { result } = renderHook(() =>
        useDashboardCache('last7', undefined, undefined, { onError }),
      );

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.error).toBeInstanceOf(Error);
      expect(result.current.error?.message).toBe('boom');
      expect(result.current.data).toBeNull();
      expect(onError).toHaveBeenCalledTimes(1);
      expect(getCachedData('last7')).toBeNull();
    });

    it('should surface thrown fetch errors', async () => {
      invokeMock.mockRejectedValue(new Error('network down'));

      const { result } = renderHook(() => useDashboardCache('last30'));

      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.error?.message).toBe('network down');
      expect(result.current.data).toBeNull();
    });

    it('should abandon an in-flight response after unmount', async () => {
      let resolveInvoke: ((value: unknown) => void) | undefined;
      invokeMock.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveInvoke = resolve;
          }),
      );

      const { result, unmount } = renderHook(() => useDashboardCache('last7'));
      await waitFor(() => expect(result.current.loading).toBe(true));

      unmount();

      await act(async () => {
        resolveInvoke?.({ data: makeResult('late'), error: null });
        await Promise.resolve();
      });

      // The cancellation flag must short-circuit before the cache write and
      // the setState, so a response arriving post-unmount leaves no trace.
      expect(getCachedData('last7')).toBeNull();
      expect(result.current.data).toBeNull();
      expect(result.current.loading).toBe(true);
    });

    it('should refetch when the preset changes', async () => {
      invokeMock.mockImplementation((_name: string, options: { body: { preset: string } }) =>
        Promise.resolve({ data: makeResult(options.body.preset), error: null }),
      );

      const { result, rerender } = renderHook(
        ({ preset }: { preset: 'last7' | 'last30' }) => useDashboardCache(preset),
        { initialProps: { preset: 'last7' as 'last7' | 'last30' } },
      );

      await waitFor(() => expect(markerOf(result.current.data)).toBe('last7'));

      rerender({ preset: 'last30' });

      await waitFor(() => expect(markerOf(result.current.data)).toBe('last30'));
      expect(invokeMock).toHaveBeenCalledTimes(2);
    });
  });
});
