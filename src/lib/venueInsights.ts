import { format, eachDayOfInterval, endOfDay, isWithinInterval, startOfDay, subDays } from 'date-fns';
import { supabase } from './supabaseClient';

export type DatePreset = 'today' | 'last7' | 'last30' | 'month' | 'custom';

export type GuestSummaryRow = {
  guest_id: string;
  email: string | null;
  full_name: string | null;
  mobile: string | null;
  postcode: string | null;
  segment: string | null;
  visit_count: number | null;
  first_seen_at: string | null;
  last_seen_at: string | null;
  visits_by_weekday: Record<string, number> | null;
  visits_by_hour: Record<string, number> | null;
  last_device_type: string | null;
  last_os_family: string | null;
  last_user_agent: string | null;
  marketing_consent: boolean | null;
  consent_timestamp: string | null;
  consent_source: string | null;
  privacy_policy_version: string | null;
  unsubscribe_status: boolean | null;
  unsubscribe_timestamp: string | null;
  unsubscribe_source: string | null;
  tags: string[] | null;
};

export type PortalSessionRow = {
  id: string;
  session_key: string;
  site_slug: string;
  client_mac: string | null;
  guest_email: string | null;
  guest_phone: string | null;
  guest_postcode: string | null;
  status: string | null;
  submitted_at: string | null;
  authorized_at: string | null;
  completed_at: string | null;
  updated_at: string;
};

export type PostcodeCentroidRow = {
  postcode: string;
  lat: number;
  lon: number;
};

export type InsightsRange = {
  preset: DatePreset;
  start: Date;
  end: Date;
  label: string;
};

export type VenueInsightsBundle = {
  profiles: GuestSummaryRow[];
  sessions: PortalSessionRow[];
  postcodeCentroids: PostcodeCentroidRow[];
};

export const getInsightsRange = (
  preset: DatePreset,
  customStart?: string,
  customEnd?: string
): InsightsRange => {
  const now = new Date();

  if (preset === 'today') {
    return { preset, start: startOfDay(now), end: endOfDay(now), label: 'Today' };
  }

  if (preset === 'last7') {
    return { preset, start: startOfDay(subDays(now, 6)), end: endOfDay(now), label: 'Last 7 days' };
  }

  if (preset === 'last30') {
    return { preset, start: startOfDay(subDays(now, 29)), end: endOfDay(now), label: 'Last 30 days' };
  }

  if (preset === 'month') {
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    return { preset, start: startOfDay(monthStart), end: endOfDay(now), label: 'This month' };
  }

  const start = customStart ? startOfDay(new Date(customStart)) : startOfDay(subDays(now, 29));
  const end = customEnd ? endOfDay(new Date(customEnd)) : endOfDay(now);
  return { preset, start, end, label: 'Custom range' };
};

export const loadVenueInsightsBundle = async (range: InsightsRange): Promise<VenueInsightsBundle> => {
  const [profilesRes, sessionsRes, centroidRes] = await Promise.all([
    supabase
      .from('guest_summary_view')
      .select(
        'guest_id, email, full_name, mobile, postcode, segment, visit_count, first_seen_at, last_seen_at, visits_by_weekday, visits_by_hour, last_device_type, last_os_family, last_user_agent, marketing_consent, consent_timestamp, consent_source, privacy_policy_version, unsubscribe_status, unsubscribe_timestamp, unsubscribe_source, tags'
      )
      .order('last_seen_at', { ascending: false }),
    supabase
      .from('portal_sessions')
      .select(
        'id, session_key, site_slug, client_mac, guest_email, guest_phone, guest_postcode, status, submitted_at, authorized_at, completed_at, updated_at'
      )
      .gte('submitted_at', range.start.toISOString())
      .lte('submitted_at', range.end.toISOString())
      .order('submitted_at', { ascending: true }),
    supabase.from('postcode_centroids').select('postcode, lat, lon')
  ]);

  if (profilesRes.error) throw profilesRes.error;
  if (sessionsRes.error) throw sessionsRes.error;
  if (centroidRes.error) throw centroidRes.error;

  return {
    profiles: (profilesRes.data as GuestSummaryRow[]) ?? [],
    sessions: (sessionsRes.data as PortalSessionRow[]) ?? [],
    postcodeCentroids: (centroidRes.data as PostcodeCentroidRow[]) ?? []
  };
};

const normalize = (value: string | null | undefined) => String(value || '').trim().toLowerCase();

const buildProfileKey = (profile: GuestSummaryRow) =>
  normalize(profile.email) || normalize(profile.mobile) || profile.guest_id;

const buildSessionKey = (session: PortalSessionRow) =>
  normalize(session.guest_email) || normalize(session.guest_phone) || normalize(session.client_mac) || session.id;

const getSessionMoment = (session: PortalSessionRow) =>
  session.submitted_at || session.authorized_at || session.completed_at || session.updated_at;

const getStatusLabel = (session: PortalSessionRow) => {
  if (session.authorized_at) return 'Authorized';
  const status = String(session.status || '').trim();
  return status ? status.replace(/^./, (char) => char.toUpperCase()) : 'Other';
};

export type VenueInsightsSummary = {
  range: InsightsRange;
  uniqueGuests: number;
  newGuests: number;
  returningGuests: number;
  totalVisits: number;
  guestsWithEmail: number;
  guestsWithMobile: number;
  consentRate: number;
  unsubscribedCount: number;
  averageVisitsPerGuest: number;
  topPostcode: string;
  peakDayOfWeek: string;
  peakHourOfDay: string;
  activeGuests: GuestSummaryRow[];
  topPostcodes: { postcode: string; guests: number; lat?: number; lon?: number }[];
  visitSeries: { label: string; value: number }[];
  newReturningSeries: { label: string; values: number[] }[];
  hourSeries: { label: string; value: number }[];
  statusBreakdown: { label: string; value: number }[];
  consentFunnel: { label: string; value: number }[];
  insights: string[];
};

export const buildVenueInsightsSummary = (bundle: VenueInsightsBundle, range: InsightsRange): VenueInsightsSummary => {
  const profileByKey = new Map(bundle.profiles.map((profile) => [buildProfileKey(profile), profile]));
  const uniqueGuestKeys = new Set<string>();
  const activeProfilesById = new Map<string, GuestSummaryRow>();
  const postcodeCounts = new Map<string, number>();
  const statusCounts = new Map<string, number>();
  const dayCounts = new Map<string, number>();
  const hourCounts = new Map<string, number>();
  const dayGuestSets = new Map<string, { newGuests: Set<string>; returningGuests: Set<string> }>();

  bundle.sessions.forEach((session) => {
    const key = buildSessionKey(session);
    const profile = profileByKey.get(key);
    uniqueGuestKeys.add(key);
    if (profile) activeProfilesById.set(profile.guest_id, profile);

    const postcode = session.guest_postcode || profile?.postcode || '';
    if (postcode) {
      postcodeCounts.set(postcode, (postcodeCounts.get(postcode) ?? 0) + 1);
    }

    const statusLabel = getStatusLabel(session);
    statusCounts.set(statusLabel, (statusCounts.get(statusLabel) ?? 0) + 1);

    const moment = new Date(getSessionMoment(session));
    const dayKey = format(moment, 'EEE');
    const hourKey = format(moment, 'ha');
    dayCounts.set(dayKey, (dayCounts.get(dayKey) ?? 0) + 1);
    hourCounts.set(hourKey, (hourCounts.get(hourKey) ?? 0) + 1);

    const dateKey = format(moment, 'dd MMM');
    const seriesBucket = dayGuestSets.get(dateKey) ?? { newGuests: new Set<string>(), returningGuests: new Set<string>() };
    const firstSeen = profile?.first_seen_at ? new Date(profile.first_seen_at) : null;
    if (firstSeen && isWithinInterval(firstSeen, { start: range.start, end: range.end })) {
      seriesBucket.newGuests.add(key);
    } else {
      seriesBucket.returningGuests.add(key);
    }
    dayGuestSets.set(dateKey, seriesBucket);
  });

  const activeGuests = [...activeProfilesById.values()];
  const uniqueGuests = uniqueGuestKeys.size;
  const newGuests = activeGuests.filter((guest) => {
    if (!guest.first_seen_at) return false;
    const seenAt = new Date(guest.first_seen_at);
    return isWithinInterval(seenAt, { start: range.start, end: range.end });
  }).length;
  const returningGuests = Math.max(uniqueGuests - newGuests, 0);
  const guestsWithEmail = activeGuests.filter((guest) => Boolean(guest.email)).length;
  const guestsWithMobile = activeGuests.filter((guest) => Boolean(guest.mobile)).length;
  const consented = activeGuests.filter((guest) => guest.marketing_consent === true).length;
  const unsubscribedCount = activeGuests.filter((guest) => guest.unsubscribe_status === true).length;
  const consentRate = activeGuests.length ? Math.round((consented / activeGuests.length) * 100) : 0;
  const averageVisitsPerGuest = uniqueGuests ? Number((bundle.sessions.length / uniqueGuests).toFixed(1)) : 0;

  const topPostcodes = [...postcodeCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([postcode, guests]) => {
      const centroid = bundle.postcodeCentroids.find((row) => row.postcode === postcode);
      return { postcode, guests, lat: centroid?.lat, lon: centroid?.lon };
    });

  const intervalDays = eachDayOfInterval({ start: range.start, end: range.end });
  const visitSeries = intervalDays.map((day) => {
    const label = format(day, 'dd MMM');
    const value = bundle.sessions.filter((session) => format(new Date(getSessionMoment(session)), 'dd MMM') === label).length;
    return { label, value };
  });

  const newReturningSeries = intervalDays.map((day) => {
    const label = format(day, 'dd MMM');
    const bucket = dayGuestSets.get(label);
    return {
      label,
      values: [bucket?.newGuests.size ?? 0, bucket?.returningGuests.size ?? 0]
    };
  });

  const hourSeries = Array.from({ length: 24 }, (_, hour) => {
    const lookup = format(new Date(2026, 0, 1, hour), 'ha');
    return {
      label: lookup.toLowerCase(),
      value: hourCounts.get(lookup) ?? 0
    };
  });

  const peakDayOfWeek = [...dayCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '-';
  const peakHourOfDay = [...hourCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '-';

  const statusBreakdown = [...statusCounts.entries()].map(([label, value]) => ({ label, value }));
  const consentFunnel = [
    { label: 'Captured guests', value: activeGuests.length },
    { label: 'Consented', value: consented },
    { label: 'Unsubscribed', value: unsubscribedCount }
  ];

  const topPostcode = topPostcodes[0]?.postcode ?? '-';
  const insights: string[] = [];
  if (peakDayOfWeek !== '-' && peakHourOfDay !== '-') {
    insights.push(`${peakDayOfWeek} around ${peakHourOfDay} was the busiest Wi-Fi window in ${range.label.toLowerCase()}.`);
  }
  if (topPostcode !== '-') {
    const share = uniqueGuests ? Math.round(((topPostcodes[0]?.guests ?? 0) / Math.max(bundle.sessions.length, 1)) * 100) : 0;
    insights.push(`${topPostcode} was the strongest catchment, accounting for ${share}% of recorded visits.`);
  }
  insights.push(`${newGuests} guests visited for the first time during ${range.label.toLowerCase()}.`);
  if (returningGuests > 0) {
    insights.push(`${returningGuests} returning guests came back, giving you a solid base for repeat campaigns.`);
  }

  return {
    range,
    uniqueGuests,
    newGuests,
    returningGuests,
    totalVisits: bundle.sessions.length,
    guestsWithEmail,
    guestsWithMobile,
    consentRate,
    unsubscribedCount,
    averageVisitsPerGuest,
    topPostcode,
    peakDayOfWeek,
    peakHourOfDay,
    activeGuests,
    topPostcodes,
    visitSeries,
    newReturningSeries,
    hourSeries,
    statusBreakdown,
    consentFunnel,
    insights
  };
};

export const buildReportCsvRows = (summary: VenueInsightsSummary) =>
  summary.activeGuests.map((guest) => ({
    name: guest.full_name ?? '',
    email: guest.email ?? '',
    mobile: guest.mobile ?? '',
    postcode: guest.postcode ?? '',
    segment: guest.segment ?? '',
    visits: Number(guest.visit_count ?? 0),
    first_seen: guest.first_seen_at ?? '',
    last_seen: guest.last_seen_at ?? '',
    consent: guest.marketing_consent === true ? 'Yes' : 'No',
    unsubscribed: guest.unsubscribe_status === true ? 'Yes' : 'No',
    tags: (guest.tags ?? []).join(', ')
  }));
