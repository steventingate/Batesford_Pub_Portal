import { useEffect, useRef, useState } from 'react';
import { supabase } from './supabaseClient';
import { getDateRange, formatDateForQuery, type DatePreset } from './datePresets';
import type { DashboardAnalyticsResult } from './dashboardAnalytics';

/** Prefix applied to every dashboard analytics cache key in localStorage. */
export const CACHE_KEY_PREFIX = 'dashboard_cache';

/** Client-side cache time-to-live: 5 minutes, in milliseconds. */
export const CLIENT_CACHE_TTL = 5 * 60 * 1000;

/** Name of the Supabase Edge Function backing the dashboard. */
export const DASHBOARD_ANALYTICS_FUNCTION = 'get-dashboard-analytics';

/** Internal shape of a stored cache entry. */
interface CacheEntry {
  data: DashboardAnalyticsResult;
  timestamp: number;
}

export interface UseDashboardCacheReturn {
  data: DashboardAnalyticsResult | null;
  loading: boolean;
  error: Error | null;
}

export interface UseAnalyticsCacheOptions {
  onError?: (error: Error) => void;
}

/**
 * Builds the deterministic localStorage key for a preset / custom range pair.
 * Presets without a custom range use `dashboard_cache:<preset>`; anything with
 * custom bounds uses `dashboard_cache:<preset>:<start>:<end>` so that two
 * different custom ranges never share a slot.
 */
export function buildCacheKey(
  preset: DatePreset,
  customStart?: string,
  customEnd?: string,
): string {
  if (customStart || customEnd) {
    return `${CACHE_KEY_PREFIX}:${preset}:${customStart ?? ''}:${customEnd ?? ''}`;
  }
  return `${CACHE_KEY_PREFIX}:${preset}`;
}

/** Returns localStorage when it is reachable, otherwise null. */
function getStorage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    // Access can throw in privacy modes / sandboxed iframes.
    return null;
  }
}

/** Removes a key without ever throwing. */
function safeRemove(storage: Storage, key: string): void {
  try {
    storage.removeItem(key);
  } catch {
    // Ignore: removal is best-effort.
  }
}

function isCacheEntry(value: unknown): value is CacheEntry {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<CacheEntry>;
  return (
    typeof candidate.timestamp === 'number' &&
    Number.isFinite(candidate.timestamp) &&
    candidate.data !== undefined &&
    candidate.data !== null
  );
}

/**
 * Reads a cached analytics result. Returns null when the entry is missing,
 * malformed, or older than {@link CLIENT_CACHE_TTL}. Expired and corrupt
 * entries are evicted as a side effect. Never throws.
 */
export function getCachedData(
  preset: DatePreset,
  customStart?: string,
  customEnd?: string,
): DashboardAnalyticsResult | null {
  const storage = getStorage();
  if (!storage) return null;

  const key = buildCacheKey(preset, customStart, customEnd);

  let raw: string | null;
  try {
    raw = storage.getItem(key);
  } catch (error) {
    console.warn(`[analyticsCache] Unable to read cache key "${key}"`, error);
    return null;
  }

  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    console.warn(`[analyticsCache] Discarding unparseable cache entry "${key}"`, error);
    safeRemove(storage, key);
    return null;
  }

  if (!isCacheEntry(parsed)) {
    safeRemove(storage, key);
    return null;
  }

  if (Date.now() - parsed.timestamp > CLIENT_CACHE_TTL) {
    safeRemove(storage, key);
    return null;
  }

  return parsed.data;
}

/**
 * Writes an analytics result to the cache with the current timestamp.
 * Quota and serialisation failures are logged and swallowed. Never throws.
 */
export function setCachedData(
  preset: DatePreset,
  data: DashboardAnalyticsResult,
  customStart?: string,
  customEnd?: string,
): void {
  const storage = getStorage();
  if (!storage) return;

  const key = buildCacheKey(preset, customStart, customEnd);
  try {
    const entry: CacheEntry = { data, timestamp: Date.now() };
    storage.setItem(key, JSON.stringify(entry));
  } catch (error) {
    console.warn(`[analyticsCache] Unable to write cache key "${key}"`, error);
  }
}

/**
 * Clears cached analytics. With a preset, removes that preset's entry plus any
 * custom-range entries scoped to it. Without a preset, removes every
 * `dashboard_cache:*` key. Never throws.
 */
export function invalidateCache(preset?: DatePreset): void {
  const storage = getStorage();
  if (!storage) return;

  const exactKey = preset ? `${CACHE_KEY_PREFIX}:${preset}` : null;
  const scopedPrefix = preset ? `${CACHE_KEY_PREFIX}:${preset}:` : `${CACHE_KEY_PREFIX}:`;

  const doomed: string[] = [];
  try {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (!key) continue;
      if (key === exactKey || key.startsWith(scopedPrefix)) {
        doomed.push(key);
      }
    }
  } catch (error) {
    console.warn('[analyticsCache] Unable to enumerate cache keys', error);
    return;
  }

  doomed.forEach((key) => safeRemove(storage, key));
}

function toError(value: unknown): Error {
  if (value instanceof Error) return value;
  if (value && typeof value === 'object' && 'message' in value) {
    return new Error(String((value as { message: unknown }).message));
  }
  return new Error(String(value));
}

/**
 * Loads dashboard analytics for a date range, preferring the localStorage
 * cache and falling back to the `get-dashboard-analytics` Edge Function.
 * In-flight requests are cancelled on unmount or when the range changes.
 */
export function useDashboardCache(
  preset: DatePreset,
  customStart?: string,
  customEnd?: string,
  options?: UseAnalyticsCacheOptions,
): UseDashboardCacheReturn {
  const [state, setState] = useState<UseDashboardCacheReturn>(() => {
    const cached = getCachedData(preset, customStart, customEnd);
    return { data: cached, loading: cached === null, error: null };
  });

  // Kept in a ref so a new inline callback does not retrigger the fetch.
  const onErrorRef = useRef(options?.onError);
  onErrorRef.current = options?.onError;

  useEffect(() => {
    let cancelled = false;

    const cached = getCachedData(preset, customStart, customEnd);
    if (cached) {
      setState({ data: cached, loading: false, error: null });
      return () => {
        cancelled = true;
      };
    }

    setState({ data: null, loading: true, error: null });

    void (async () => {
      try {
        const range = getDateRange(preset, customStart, customEnd);
        const response = await supabase.functions.invoke(DASHBOARD_ANALYTICS_FUNCTION, {
          body: {
            startDate: formatDateForQuery(range.startDate),
            endDate: formatDateForQuery(range.endDate),
            preset,
          },
        });

        if (cancelled) return;

        if (response.error) {
          throw toError(response.error);
        }

        const result = response.data as DashboardAnalyticsResult | null;
        if (!result) {
          throw new Error('Dashboard analytics returned no data.');
        }

        setCachedData(preset, result, customStart, customEnd);
        setState({ data: result, loading: false, error: null });
      } catch (rawError) {
        if (cancelled) return;
        const error = toError(rawError);
        setState({ data: null, loading: false, error });
        onErrorRef.current?.(error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [preset, customStart, customEnd]);

  return state;
}
