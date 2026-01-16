import { supabase } from './supabaseClient';

const publicUrlCache = new Map<string, string>();

const isAbsoluteUrl = (value: string) => /^https?:\/\//i.test(value) || value.startsWith('data:');

export const getPublicUrl = (path: string) => {
  if (!path) return '';
  if (publicUrlCache.has(path)) {
    return publicUrlCache.get(path) ?? '';
  }
  const { data } = supabase.storage.from('campaign-assets').getPublicUrl(path);
  const publicUrl = data.publicUrl;
  publicUrlCache.set(path, publicUrl);
  return publicUrl;
};

export const resolveStorageUrl = (pathOrUrl?: string | null) => {
  if (!pathOrUrl) return '';
  if (isAbsoluteUrl(pathOrUrl)) return pathOrUrl;
  return getPublicUrl(pathOrUrl);
};
