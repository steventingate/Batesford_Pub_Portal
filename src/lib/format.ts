import { format, parseISO } from 'date-fns';

export const formatDateTime = (value?: string | null) => {
  if (!value) return '';
  return format(parseISO(value), 'dd MMM yyyy, h:mm a');
};

export const formatDate = (value?: string | null) => {
  if (!value) return '';
  return format(parseISO(value), 'dd MMM');
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
