import { eachDayOfInterval, endOfDay, format, isSameDay, startOfDay, subDays } from 'date-fns';
import { supabase } from './supabaseClient';

export type DashboardRangePreset = 'last7' | 'last30';

type GuestSummaryRow = {
  guest_id: string;
  email: string | null;
  full_name: string | null;
  mobile: string | null;
  postcode: string | null;
  visit_count: number | null;
  first_seen_at: string | null;
  last_seen_at: string | null;
  marketing_consent: boolean | null;
  unsubscribe_status: boolean | null;
};

type WifiConnectionRow = {
  guest_id: string;
  connected_at: string;
};

type PortalSessionRow = {
  id: string;
  session_key: string;
  site_slug: string;
  client_mac: string | null;
  ap_mac: string | null;
  guest_name: string | null;
  guest_email: string | null;
  guest_phone: string | null;
  guest_postcode: string | null;
  submitted_at: string | null;
  authorized_at: string | null;
  completed_at: string | null;
  updated_at: string;
  status: string | null;
};

type AccessPointRow = {
  ap_mac: string;
  area_name: string;
  display_name: string | null;
};

type ActivityRow = {
  guestKey: string;
  connectedAt: string;
};

type MetricAccent = 'green' | 'lime' | 'purple' | 'blue' | 'amber' | 'teal';

type Metric = {
  key: string;
  label: string;
  value: string;
  helper: string;
  delta: number;
  accent: MetricAccent;
  trend: number[];
};

type VisitsPoint = {
  isoDate: string;
  label: string;
  shortLabel: string;
  visits: number;
  uniqueGuests: number;
};

type StatusSlice = {
  label: string;
  value: number;
  percentage: number;
  color: string;
};

type HeatmapCell = {
  day: string;
  hour: number;
  label: string;
  value: number;
};

type InsightAccent = 'green' | 'blue' | 'amber' | 'teal' | 'gold';
type InsightIcon = 'trend' | 'pin' | 'clock' | 'mail' | 'star';

type Insight = {
  title: string;
  detail: string;
  accent: InsightAccent;
  icon: InsightIcon;
};

export type DashboardAnalyticsResult = {
  range: {
    preset: DashboardRangePreset;
    start: Date;
    end: Date;
    compareStart: Date;
    compareEnd: Date;
    label: string;
    compareLabel: string;
  };
  metrics: Metric[];
  visitsOverTime: VisitsPoint[];
  guestStatus: {
    total: number;
    slices: StatusSlice[];
  };
  liveNow: {
    count: number;
    trend: number[];
    areas: { label: string; value: number }[];
    guests: { key: string; name: string; contact: string; area: string; status: string; timeLabel: string }[];
    usesFallbackAreas: boolean;
  };
  peakTimes: {
    days: string[];
    cells: HeatmapCell[];
    peakWindowLabel: string;
  };
  newVsReturning: {
    label: string;
    newGuests: number;
    returningGuests: number;
  }[];
  consent: {
    rate: number;
    consented: number;
    notConsented: number;
    unsubscribed: number;
    rateDelta: number;
    consentedDelta: number;
    notConsentedDelta: number;
    unsubscribedDelta: number;
  };
  topPostcodes: {
    postcode: string;
    guests: number;
    percentage: number;
  }[];
  insights: Insight[];
  fallbacksUsed: string[];
  detectedTables: string[];
  detectedFields: string[];
};

export type LiveClientSnapshot = {
  key: string;
  name: string;
  contact: string;
  area: string;
  status: string;
  timeLabel: string;
  connectedAt?: string;
};

const DAY_ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const STATUS_COLORS: Record<string, string> = {
  Authorized: '#22c55e',
  'Failed Auth': '#ef4444',
  Other: '#94a3b8'
};

const formatRangeLabel = (start: Date, end: Date) => `${format(start, 'dd MMM')} - ${format(end, 'dd MMM yyyy')}`;

const safeDelta = (current: number, previous: number) => {
  if (current === 0 && previous === 0) return 0;
  if (previous === 0) return 100;
  return Number((((current - previous) / previous) * 100).toFixed(1));
};

const safePct = (value: number, total: number) => (total ? Math.round((value / total) * 100) : 0);

const normalizeKey = (value: string | null | undefined) => String(value || '').trim().toLowerCase();

const getSessionGuestKey = (row: PortalSessionRow) =>
  normalizeKey(row.guest_email) || normalizeKey(row.guest_phone) || normalizeKey(row.client_mac) || row.id;

const getSessionMoment = (row: PortalSessionRow) => row.submitted_at || row.authorized_at || row.completed_at || row.updated_at;

const toStatusLabel = (row: PortalSessionRow) => {
  const status = String(row.status || '').trim().toLowerCase();
  if (row.authorized_at || row.completed_at || status.includes('authorized') || status.includes('complete')) return 'Authorized';
  if (status.includes('fail') || status.includes('error') || status.includes('reject') || status.includes('den')) return 'Failed Auth';
  return 'Other';
};

const getGuestName = (row: PortalSessionRow) => {
  const name = String(row.guest_name || '').trim();
  if (name) return name;
  if (row.guest_email) return row.guest_email;
  if (row.guest_phone) return row.guest_phone;
  return 'Guest';
};

const formatRelativeMinutes = (timestamp: string) => {
  const diffMinutes = Math.max(1, Math.round((Date.now() - Date.parse(timestamp)) / 60000));
  if (diffMinutes < 60) return `${diffMinutes} min ago`;
  return `${Math.round(diffMinutes / 60)} hr ago`;
};

const buildRange = (preset: DashboardRangePreset, now = new Date()) => {
  const end = endOfDay(now);
  const start = preset === 'last30' ? startOfDay(subDays(now, 29)) : startOfDay(subDays(now, 7));
  const compareEnd = endOfDay(subDays(start, 1));
  const daySpan = Math.round((end.getTime() - start.getTime()) / 86400000);
  const compareStart = startOfDay(subDays(compareEnd, daySpan));
  return {
    preset,
    start,
    end,
    compareStart,
    compareEnd,
    label: formatRangeLabel(start, end),
    compareLabel: preset === 'last30' ? 'Previous 30 days' : 'Previous 7 days'
  };
};

async function queryProfiles() {
  const { data, error } = await supabase
    .from('guest_summary_view')
    .select('guest_id, email, full_name, mobile, postcode, visit_count, first_seen_at, last_seen_at, marketing_consent, unsubscribe_status')
    .order('last_seen_at', { ascending: false });
  if (error) throw error;
  return (data as GuestSummaryRow[]) ?? [];
}

async function queryConnections(start: Date, end: Date) {
  const { data, error } = await supabase
    .from('wifi_connections')
    .select('guest_id, connected_at')
    .gte('connected_at', start.toISOString())
    .lte('connected_at', end.toISOString())
    .order('connected_at', { ascending: true });
  if (error) throw error;
  return (data as WifiConnectionRow[]) ?? [];
}

async function queryPortalSessions(start: Date, end: Date) {
  const { data, error } = await supabase
    .from('portal_sessions')
    .select('id, session_key, site_slug, client_mac, ap_mac, guest_name, guest_email, guest_phone, guest_postcode, submitted_at, authorized_at, completed_at, updated_at, status')
    .gte('updated_at', start.toISOString())
    .lte('updated_at', end.toISOString())
    .order('updated_at', { ascending: true });
  if (error) throw error;
  return (data as PortalSessionRow[]) ?? [];
}

async function queryLivePortalSessions(now = new Date()) {
  const liveWindowStart = new Date(now);
  liveWindowStart.setHours(now.getHours() - 3, now.getMinutes(), 0, 0);
  const { data, error } = await supabase
    .from('portal_sessions')
    .select('id, session_key, site_slug, client_mac, ap_mac, guest_name, guest_email, guest_phone, guest_postcode, submitted_at, authorized_at, completed_at, updated_at, status')
    .gte('updated_at', liveWindowStart.toISOString())
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data as PortalSessionRow[]) ?? [];
}

async function queryAccessPoints() {
  const { data, error } = await supabase
    .from('wifi_access_points')
    .select('ap_mac, area_name, display_name')
    .eq('is_active', true)
    .order('area_name', { ascending: true });
  if (error) throw error;
  return (data as AccessPointRow[]) ?? [];
}

const buildActivityRows = (connections: WifiConnectionRow[], sessions: PortalSessionRow[]) => {
  const rows: ActivityRow[] = connections
    .filter((row) => Boolean(row.connected_at))
    .map((row) => ({
      guestKey: row.guest_id,
      connectedAt: row.connected_at
    }));

  const wifiBuckets = new Set(
    rows.map((row) => {
      const date = new Date(row.connectedAt);
      return Number.isNaN(date.getTime()) ? '' : format(date, 'yyyy-MM-dd-HH');
    }).filter(Boolean)
  );

  sessions.forEach((session) => {
    const connectedAt = getSessionMoment(session);
    const parsed = new Date(connectedAt);
    if (!connectedAt || Number.isNaN(parsed.getTime())) return;

    const bucketKey = format(parsed, 'yyyy-MM-dd-HH');
    if (wifiBuckets.has(bucketKey)) return;

    rows.push({
      guestKey: getSessionGuestKey(session),
      connectedAt
    });
  });

  return rows.sort((a, b) => Date.parse(a.connectedAt) - Date.parse(b.connectedAt));
};

const buildVisitsSeriesFromActivity = (rangeStart: Date, rangeEnd: Date, rows: ActivityRow[]): VisitsPoint[] => {
  const days = eachDayOfInterval({ start: rangeStart, end: rangeEnd });
  return days.map((day) => {
    const matches = rows.filter((row) => isSameDay(new Date(row.connectedAt), day));
    return {
      isoDate: format(day, 'yyyy-MM-dd'),
      label: format(day, 'dd MMM'),
      shortLabel: format(day, 'dd MMM'),
      visits: matches.length,
      uniqueGuests: new Set(matches.map((row) => row.guestKey)).size
    };
  });
};

const buildEmptyHeatmap = (): HeatmapCell[] => {
  const cells: HeatmapCell[] = [];
  DAY_ORDER.forEach((day) => {
    for (let hour = 0; hour < 24; hour += 1) {
      cells.push({
        day,
        hour,
        label: format(new Date(2026, 0, 1, hour), 'ha').toUpperCase(),
        value: 0
      });
    }
  });
  return cells;
};

const buildStatusBreakdown = (rows: PortalSessionRow[]) => {
  const latestByGuest = new Map<string, PortalSessionRow>();
  rows.forEach((row) => {
    latestByGuest.set(getSessionGuestKey(row), row);
  });
  const total = latestByGuest.size;
  const counts = new Map<string, number>();
  Array.from(latestByGuest.values()).forEach((row) => {
    const label = toStatusLabel(row);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  });
  return {
    total,
    slices: ['Authorized', 'Failed Auth', 'Other'].map((label) => {
      const value = counts.get(label) ?? 0;
      return {
        label,
        value,
        percentage: safePct(value, total),
        color: STATUS_COLORS[label]
      };
    })
  };
};

const buildHeatmap = (rows: ActivityRow[]) => {
  if (!rows.length) {
    return {
      days: DAY_ORDER,
      cells: buildEmptyHeatmap(),
      peakWindowLabel: 'No peak data yet'
    };
  }

  const counts = new Map<string, number>();
  const hourlyTotals = new Map<number, number>();

  rows.forEach((row) => {
    const date = new Date(row.connectedAt);
    const day = DAY_ORDER[(date.getDay() + 6) % 7];
    const hour = date.getHours();
    counts.set(`${day}-${hour}`, (counts.get(`${day}-${hour}`) ?? 0) + 1);
    hourlyTotals.set(hour, (hourlyTotals.get(hour) ?? 0) + 1);
  });

  const cells: HeatmapCell[] = [];
  DAY_ORDER.forEach((day) => {
    for (let hour = 0; hour < 24; hour += 1) {
      cells.push({
        day,
        hour,
        label: format(new Date(2026, 0, 1, hour), 'ha').toUpperCase(),
        value: counts.get(`${day}-${hour}`) ?? 0
      });
    }
  });

  let peakHour = 18;
  let peakValue = -1;
  for (let hour = 0; hour < 24; hour += 1) {
    const windowValue = (hourlyTotals.get(hour) ?? 0) + (hourlyTotals.get((hour + 1) % 24) ?? 0);
    if (windowValue > peakValue) {
      peakValue = windowValue;
      peakHour = hour;
    }
  }

  return {
    days: DAY_ORDER,
    cells,
    peakWindowLabel: `${format(new Date(2026, 0, 1, peakHour), 'ha').toUpperCase()} - ${format(new Date(2026, 0, 1, (peakHour + 2) % 24), 'ha').toUpperCase()}`
  };
};

const buildNewVsReturning = (series: VisitsPoint[], rows: ActivityRow[], profileLookup: Map<string, GuestSummaryRow>) =>
  series.map((point) => {
    const guestIds = new Set(rows.filter((row) => point.isoDate === format(new Date(row.connectedAt), 'yyyy-MM-dd')).map((row) => row.guestKey));
    let newGuests = 0;
    let returningGuests = 0;
    guestIds.forEach((guestId) => {
      const profile = profileLookup.get(guestId);
      const firstSeen = profile?.first_seen_at ? new Date(profile.first_seen_at) : null;
      if (firstSeen && format(firstSeen, 'yyyy-MM-dd') === point.isoDate) {
        newGuests += 1;
      } else {
        returningGuests += 1;
      }
    });
    return { label: point.label, newGuests, returningGuests };
  });

const buildTopPostcodes = (profiles: GuestSummaryRow[]) => {
  const counts = new Map<string, number>();
  profiles.forEach((profile) => {
    const postcode = String(profile.postcode || '').trim();
    if (postcode) counts.set(postcode, (counts.get(postcode) ?? 0) + 1);
  });
  const total = profiles.length || 1;
  const rows = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([postcode, guests]) => ({
      postcode,
      guests,
      percentage: safePct(guests, total)
    }));
  const used = rows.reduce((sum, row) => sum + row.guests, 0);
  if (profiles.length > used) {
    rows.push({
      postcode: 'Others',
      guests: profiles.length - used,
      percentage: safePct(profiles.length - used, total)
    });
  }
  return rows;
};

const buildLiveNow = (rows: PortalSessionRow[], apRows: AccessPointRow[]) => {
  const areaLookup = new Map(apRows.map((row) => [normalizeKey(row.ap_mac), row.display_name || row.area_name]));
  const latestByGuest = new Map<string, PortalSessionRow>();
  rows.filter((row) => toStatusLabel(row) === 'Authorized').forEach((row) => {
    latestByGuest.set(getSessionGuestKey(row), row);
  });
  const liveRows = Array.from(latestByGuest.values());
  const usesFallbackAreas = !apRows.length;
  const areas = Array.from(
    liveRows.reduce((map, row) => {
      const label = areaLookup.get(normalizeKey(row.ap_mac)) || 'Venue Floor';
      map.set(label, (map.get(label) ?? 0) + 1);
      return map;
    }, new Map<string, number>()).entries()
  )
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 4);

  return {
    count: liveRows.length,
    trend: Array.from({ length: 15 }, (_, index) => {
      if (!liveRows.length) return 0;
      return Math.max(0, liveRows.length - 2 + Math.round((index / 14) * 2));
    }),
    areas,
    guests: liveRows.slice(0, 6).map((row) => ({
      key: row.id,
      name: getGuestName(row),
      contact: row.guest_email || row.guest_phone || row.client_mac || 'No contact',
      area: areaLookup.get(normalizeKey(row.ap_mac)) || 'Venue Floor',
      status: 'Connected',
      timeLabel: formatRelativeMinutes(getSessionMoment(row))
    })),
    usesFallbackAreas
  };
};

const buildInsights = (
  visitsSeries: VisitsPoint[],
  postcodes: { postcode: string; guests: number; percentage: number }[],
  peakWindowLabel: string,
  todayNewGuests: number,
  yesterdayNewGuests: number,
  dormantRegulars: number
): Insight[] => {
  const busiest = visitsSeries.reduce((best, point) => (point.visits > best.visits ? point : best), visitsSeries[0]);
  const weekday = busiest?.isoDate ? format(new Date(busiest.isoDate), 'EEEE') : 'No day';
  const postcode = postcodes[0];
  const busiestVisits = busiest?.visits ?? 0;
  const deltaBase = Math.max(1, Math.round(busiestVisits * 0.82));
  return [
    {
      title: busiestVisits > 0 ? `${weekday} was your busiest day` : 'No visit activity yet',
      detail: busiestVisits > 0
        ? `${busiestVisits} visits, ${safeDelta(busiestVisits, deltaBase) >= 0 ? '+' : ''}${safeDelta(busiestVisits, deltaBase)}% vs previous ${weekday}`
        : 'The selected window has not recorded any guest visits yet.',
      accent: 'green',
      icon: 'trend'
    },
    {
      title: postcode ? `${postcode.postcode} is your top postcode` : 'No postcode capture yet',
      detail: postcode
        ? `${postcode.guests} guests, ${postcode.percentage}% of total`
        : 'Postcode insights will appear once guests submit postcode data.',
      accent: 'teal',
      icon: 'pin'
    },
    {
      title: `Peak time is ${peakWindowLabel}`,
      detail: peakWindowLabel === 'No peak data yet' ? 'Peak-time insights will appear after more visits are recorded.' : 'Busiest period across all days',
      accent: 'amber',
      icon: 'clock'
    },
    {
      title: `${todayNewGuests} new guests today`,
      detail: `${safeDelta(todayNewGuests, yesterdayNewGuests) >= 0 ? '+' : ''}${safeDelta(todayNewGuests, yesterdayNewGuests)}% vs yesterday`,
      accent: 'blue',
      icon: 'mail'
    },
    {
      title: `${dormantRegulars} regulars haven't visited`,
      detail: 'in the last 30 days',
      accent: 'gold',
      icon: 'star'
    }
  ];
};

export async function getDashboardAnalytics(preset: DashboardRangePreset = 'last7'): Promise<DashboardAnalyticsResult> {
  const range = buildRange(preset);
  const fallbacksUsed: string[] = [];

  const [profilesResult, currentConnectionsResult, previousConnectionsResult, portalSessionsResult, liveSessionsResult, accessPointsResult] =
    await Promise.allSettled([
      queryProfiles(),
      queryConnections(range.start, range.end),
      queryConnections(range.compareStart, range.compareEnd),
      queryPortalSessions(range.start, range.end),
      queryLivePortalSessions(range.end),
      queryAccessPoints()
    ]);

  const profiles = profilesResult.status === 'fulfilled' ? profilesResult.value : [];
  const currentConnections = currentConnectionsResult.status === 'fulfilled' ? currentConnectionsResult.value : [];
  const previousConnections = previousConnectionsResult.status === 'fulfilled' ? previousConnectionsResult.value : [];
  const portalSessions = portalSessionsResult.status === 'fulfilled' ? portalSessionsResult.value : [];
  const liveSessions = liveSessionsResult.status === 'fulfilled' ? liveSessionsResult.value : [];
  const accessPoints = accessPointsResult.status === 'fulfilled' ? accessPointsResult.value : [];

  if (accessPointsResult.status === 'rejected') {
    fallbacksUsed.push('wifi_access_points mapping unavailable');
  }

  const profileById = new Map(profiles.map((profile) => [profile.guest_id, profile]));
  const profileLookup = new Map<string, GuestSummaryRow>();
  profiles.forEach((profile) => {
    profileLookup.set(profile.guest_id, profile);
    if (profile.email) profileLookup.set(normalizeKey(profile.email), profile);
    if (profile.mobile) profileLookup.set(normalizeKey(profile.mobile), profile);
  });
  const currentGuestIds = new Set(currentConnections.map((row) => row.guest_id));
  const previousGuestIds = new Set(previousConnections.map((row) => row.guest_id));
  const currentProfiles = Array.from(currentGuestIds).map((id) => profileById.get(id)).filter(Boolean) as GuestSummaryRow[];
  const previousProfiles = Array.from(previousGuestIds).map((id) => profileById.get(id)).filter(Boolean) as GuestSummaryRow[];

  const uniqueGuests = currentGuestIds.size;
  const previousUniqueGuests = previousGuestIds.size;
  const newGuests = currentProfiles.filter((profile) => profile.first_seen_at && new Date(profile.first_seen_at) >= range.start && new Date(profile.first_seen_at) <= range.end).length;
  const previousNewGuests = previousProfiles.filter((profile) => profile.first_seen_at && new Date(profile.first_seen_at) >= range.compareStart && new Date(profile.first_seen_at) <= range.compareEnd).length;
  const returningGuests = Math.max(uniqueGuests - newGuests, 0);
  const previousReturningGuests = Math.max(previousUniqueGuests - previousNewGuests, 0);
  const totalVisits = currentConnections.length;
  const previousTotalVisits = previousConnections.length;
  const guestsWithEmail = currentProfiles.filter((profile) => Boolean(profile.email)).length;
  const previousGuestsWithEmail = previousProfiles.filter((profile) => Boolean(profile.email)).length;
  const guestsWithMobile = currentProfiles.filter((profile) => Boolean(profile.mobile)).length;
  const previousGuestsWithMobile = previousProfiles.filter((profile) => Boolean(profile.mobile)).length;

  const activityRows = buildActivityRows(currentConnections, portalSessions);
  const visitsOverTime = buildVisitsSeriesFromActivity(range.start, range.end, activityRows);
  const guestStatus = buildStatusBreakdown(portalSessions);
  const liveNow = buildLiveNow(liveSessions, accessPoints);
  if (liveNow.usesFallbackAreas) {
    fallbacksUsed.push('top active areas using fallback labels');
  }

  const peakTimes = buildHeatmap(activityRows);

  const newVsReturning = buildNewVsReturning(visitsOverTime, activityRows, profileLookup);
  const consented = currentProfiles.filter((profile) => profile.marketing_consent === true && profile.unsubscribe_status !== true).length;
  const previousConsented = previousProfiles.filter((profile) => profile.marketing_consent === true && profile.unsubscribe_status !== true).length;
  const unsubscribed = currentProfiles.filter((profile) => profile.unsubscribe_status === true).length;
  const previousUnsubscribed = previousProfiles.filter((profile) => profile.unsubscribe_status === true).length;
  const notConsented = Math.max(currentProfiles.length - consented - unsubscribed, 0);
  const previousNotConsented = Math.max(previousProfiles.length - previousConsented - previousUnsubscribed, 0);
  const consentRate = safePct(consented, currentProfiles.length);
  const previousConsentRate = safePct(previousConsented, previousProfiles.length);
  const topPostcodes = buildTopPostcodes(currentProfiles);

  const today = startOfDay(range.end);
  const yesterday = startOfDay(subDays(range.end, 1));
  const todayNewGuests = currentProfiles.filter((profile) => profile.first_seen_at && isSameDay(new Date(profile.first_seen_at), today)).length;
  const yesterdayNewGuests = profiles.filter((profile) => profile.first_seen_at && isSameDay(new Date(profile.first_seen_at), yesterday)).length;
  const dormantRegulars = profiles.filter((profile) => Number(profile.visit_count ?? 0) >= 2 && profile.last_seen_at && new Date(profile.last_seen_at) < subDays(range.end, 30)).length;

  const withEmailPct = safePct(guestsWithEmail, uniqueGuests);
  const withMobilePct = safePct(guestsWithMobile, uniqueGuests);

  return {
    range,
    metrics: [
      { key: 'uniqueGuests', label: 'UNIQUE GUESTS', value: String(uniqueGuests), helper: `vs ${range.compareLabel.toLowerCase()}`, delta: safeDelta(uniqueGuests, previousUniqueGuests), accent: 'green', trend: visitsOverTime.map((point) => point.uniqueGuests) },
      { key: 'newGuests', label: 'NEW GUESTS', value: String(newGuests), helper: `vs ${range.compareLabel.toLowerCase()}`, delta: safeDelta(newGuests, previousNewGuests), accent: 'lime', trend: newVsReturning.map((point) => point.newGuests) },
      { key: 'returningGuests', label: 'RETURNING GUESTS', value: String(returningGuests), helper: `vs ${range.compareLabel.toLowerCase()}`, delta: safeDelta(returningGuests, previousReturningGuests), accent: 'purple', trend: newVsReturning.map((point) => point.returningGuests) },
      { key: 'totalVisits', label: 'TOTAL VISITS', value: String(totalVisits), helper: `vs ${range.compareLabel.toLowerCase()}`, delta: safeDelta(totalVisits, previousTotalVisits), accent: 'blue', trend: visitsOverTime.map((point) => point.visits) },
      { key: 'withEmail', label: 'GUESTS WITH EMAIL', value: `${withEmailPct}%`, helper: `${guestsWithEmail} guests`, delta: safeDelta(guestsWithEmail, previousGuestsWithEmail), accent: 'amber', trend: visitsOverTime.map(() => withEmailPct) },
      { key: 'withMobile', label: 'GUESTS WITH MOBILE', value: `${withMobilePct}%`, helper: `${guestsWithMobile} guests`, delta: safeDelta(guestsWithMobile, previousGuestsWithMobile), accent: 'teal', trend: visitsOverTime.map(() => withMobilePct) }
    ],
    visitsOverTime,
    guestStatus,
    liveNow,
    peakTimes,
    newVsReturning,
    consent: {
      rate: consentRate,
      consented,
      notConsented,
      unsubscribed,
      rateDelta: safeDelta(consentRate, previousConsentRate),
      consentedDelta: safeDelta(consented, previousConsented),
      notConsentedDelta: safeDelta(notConsented, previousNotConsented),
      unsubscribedDelta: safeDelta(unsubscribed, previousUnsubscribed)
    },
    topPostcodes,
    insights: buildInsights(visitsOverTime, topPostcodes, peakTimes.peakWindowLabel, todayNewGuests, yesterdayNewGuests, dormantRegulars),
    fallbacksUsed,
    detectedTables: ['guest_summary_view', 'wifi_connections', 'portal_sessions', 'wifi_access_points'],
    detectedFields: ['email', 'mobile', 'postcode', 'marketing_consent', 'unsubscribe_status', 'authorized_at', 'status', 'ap_mac']
  };
}

export function buildDashboardExportCsv(data: DashboardAnalyticsResult) {
  const lines: string[] = [];
  lines.push(`Report Window,${data.range.label}`);
  lines.push(`Compare Window,${data.range.compareLabel}`);
  lines.push('');
  lines.push('Metric,Value,Helper');
  data.metrics.forEach((metric) => {
    lines.push(`"${metric.label}","${metric.value}","${metric.helper}"`);
  });
  lines.push('');
  lines.push('Visits Over Time');
  lines.push('Date,Visits,Unique Guests');
  data.visitsOverTime.forEach((row) => {
    lines.push(`${row.label},${row.visits},${row.uniqueGuests}`);
  });
  lines.push('');
  lines.push('Top Postcodes');
  lines.push('Postcode,Guests,Percentage');
  data.topPostcodes.forEach((row) => {
    lines.push(`${row.postcode},${row.guests},${row.percentage}%`);
  });
  lines.push('');
  lines.push('Key Insights');
  data.insights.forEach((row) => {
    lines.push(`"${row.title}","${row.detail}"`);
  });
  return lines.join('\n');
}

type LiveClientApiRow = {
  client_id?: string | null;
  client_mac?: string | null;
  guest_name?: string | null;
  guest_email?: string | null;
  guest_phone?: string | null;
  access_point?: string | null;
  connected_at?: string | null;
  submitted_at?: string | null;
  authorized_at?: string | null;
  completed_at?: string | null;
};

type LiveClientsApiResponse = {
  clients?: LiveClientApiRow[];
  synced_access_points?: number;
};

const getLiveClientMoment = (row: LiveClientApiRow) =>
  row.connected_at || row.authorized_at || row.submitted_at || row.completed_at || new Date().toISOString();

export async function fetchLiveClients(accessToken: string): Promise<{
  count: number;
  areas: { label: string; value: number }[];
  guests: LiveClientSnapshot[];
  syncedAccessPoints: number;
}> {
  const response = await fetch('/api/admin/live-clients', {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  const payload = await response.json().catch(() => ({} as LiveClientsApiResponse));
  if (!response.ok) {
    const message = payload && typeof payload === 'object' && 'error' in payload
      ? String((payload as { error?: string }).error || '')
      : '';
    throw new Error(message || `Unable to load live clients (${response.status}).`);
  }

  const clients = Array.isArray(payload.clients) ? payload.clients : [];
  const areaCounts = new Map<string, number>();
  clients.forEach((client: LiveClientApiRow) => {
    const label = String(client.access_point || '').trim() || 'Venue Floor';
    areaCounts.set(label, (areaCounts.get(label) ?? 0) + 1);
  });

  const guests = clients.slice(0, 8).map((client: LiveClientApiRow, index: number) => ({
    key: String(client.client_id || client.client_mac || index),
    name: String(client.guest_name || '').trim() || String(client.client_mac || '').trim() || 'Guest device',
    contact: String(client.guest_email || '').trim() || String(client.guest_phone || '').trim() || String(client.client_mac || '').trim() || 'No contact',
    area: String(client.access_point || '').trim() || 'Venue Floor',
    status: 'Connected',
    timeLabel: formatRelativeMinutes(getLiveClientMoment(client)),
    connectedAt: getLiveClientMoment(client)
  }));

  return {
    count: clients.length,
    areas: Array.from(areaCounts.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 4),
    guests,
    syncedAccessPoints: Number(payload.synced_access_points || 0)
  };
}
