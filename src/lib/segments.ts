export type SegmentFilters = {
  lastSeenDays?: number;
  returningOnly?: boolean;
  hasEmail?: boolean;
  hasMobile?: boolean;
  includeTags?: string[];
  excludeTags?: string[];
};

export const normalizeTags = (value: string) =>
  value
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);

export const buildSegmentSummary = (segment: SegmentFilters) => {
  const parts: string[] = [];
  if (segment.lastSeenDays) parts.push(`Seen in last ${segment.lastSeenDays} days`);
  if (segment.returningOnly) parts.push('Returning guests only');
  if (segment.hasEmail) parts.push('Has email');
  if (segment.hasMobile) parts.push('Has mobile');
  if (segment.includeTags?.length) parts.push(`Tagged: ${segment.includeTags.join(', ')}`);
  if (segment.excludeTags?.length) parts.push(`Exclude: ${segment.excludeTags.join(', ')}`);
  return parts.join(' | ');
};
