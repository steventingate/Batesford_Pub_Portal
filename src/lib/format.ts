export const VENUE_TIMEZONE = 'Australia/Melbourne';

const dateTimeFormatter = new Intl.DateTimeFormat('en-AU', {
  timeZone: VENUE_TIMEZONE,
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
  timeZoneName: 'short'
});

const dateFormatter = new Intl.DateTimeFormat('en-AU', {
  timeZone: VENUE_TIMEZONE,
  day: '2-digit',
  month: 'short'
});

export const formatDateTime = (value?: string | null) => {
  if (!value) return '';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '' : dateTimeFormatter.format(parsed);
};

export const formatDate = (value?: string | null) => {
  if (!value) return '';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '' : dateFormatter.format(parsed);
};

export const toCsv = (rows: Record<string, string | number | boolean | null | undefined>[]) => {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const escape = (value: unknown) => {
    if (value === null || value === undefined) return '';
    const text = String(value).replace(/"/g, '""');
    return `"${text}"`;
  };
  const lines = [headers.join(',')];
  rows.forEach((row) => {
    lines.push(headers.map((header) => escape(row[header])).join(','));
  });
  return lines.join('\n');
};
