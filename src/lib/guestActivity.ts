export type GuestActivityProfile = {
  guest_id: string;
  email: string | null;
  mobile: string | null;
  last_seen_at: string | null;
};

export type GuestActivitySession = {
  guest_email: string | null;
  guest_phone: string | null;
  submitted_at: string | null;
  authorized_at: string | null;
  completed_at: string | null;
  updated_at: string | null;
};

export type GuestActivityLiveGuest = {
  email?: string | null;
  phone?: string | null;
  area?: string | null;
  connectedAt?: string;
};

export const normalizeGuestKey = (value: string | null | undefined) => String(value || '').trim().toLowerCase();

export const getGuestSessionMoment = (session: GuestActivitySession) =>
  session.submitted_at || session.authorized_at || session.completed_at || session.updated_at || null;

const pickLatestTimestamp = (...values: Array<string | null | undefined>) => {
  let latest: string | null = null;
  let latestMs = -1;

  values.forEach((value) => {
    if (!value) return;
    const parsed = Date.parse(value);
    if (!Number.isFinite(parsed) || parsed <= latestMs) return;
    latest = new Date(parsed).toISOString();
    latestMs = parsed;
  });

  return latest;
};

export function buildLatestGuestActivityLookup(
  sessions: GuestActivitySession[],
  liveGuests: GuestActivityLiveGuest[]
) {
  const latestByKey = new Map<string, { lastSeenAt: string; isLiveNow: boolean; liveArea: string | null }>();

  const apply = (key: string, next: { lastSeenAt: string; isLiveNow: boolean; liveArea: string | null }) => {
    if (!key || !next.lastSeenAt) return;
    const current = latestByKey.get(key);
    if (!current) {
      latestByKey.set(key, next);
      return;
    }

    const latestSeenAt = pickLatestTimestamp(current.lastSeenAt, next.lastSeenAt);
    if (!latestSeenAt) return;

    latestByKey.set(key, {
      lastSeenAt: latestSeenAt,
      isLiveNow: current.isLiveNow || next.isLiveNow,
      liveArea: next.liveArea || current.liveArea
    });
  };

  sessions.forEach((session) => {
    const moment = getGuestSessionMoment(session);
    if (!moment) return;

    const payload = {
      lastSeenAt: new Date(moment).toISOString(),
      isLiveNow: false,
      liveArea: null
    };

    const emailKey = normalizeGuestKey(session.guest_email);
    const phoneKey = normalizeGuestKey(session.guest_phone);
    if (emailKey) apply(emailKey, payload);
    if (phoneKey) apply(phoneKey, payload);
  });

  liveGuests.forEach((guest) => {
    if (!guest.connectedAt) return;

    const payload = {
      lastSeenAt: new Date(guest.connectedAt).toISOString(),
      isLiveNow: true,
      liveArea: guest.area || null
    };

    const emailKey = normalizeGuestKey(guest.email);
    const phoneKey = normalizeGuestKey(guest.phone);
    if (emailKey) apply(emailKey, payload);
    if (phoneKey) apply(phoneKey, payload);
  });

  return latestByKey;
}

export function mergeGuestActivity<T extends GuestActivityProfile>(
  profiles: T[],
  sessions: GuestActivitySession[],
  liveGuests: GuestActivityLiveGuest[]
): Array<T & { is_live_now: boolean; live_area: string | null; live_connected_at: string | null }> {
  const lookup = buildLatestGuestActivityLookup(sessions, liveGuests);

  return profiles.map((profile) => {
    const emailKey = normalizeGuestKey(profile.email);
    const phoneKey = normalizeGuestKey(profile.mobile);
    const activity = lookup.get(emailKey) || lookup.get(phoneKey) || null;
    const lastSeenAt = pickLatestTimestamp(profile.last_seen_at, activity?.lastSeenAt);

    return {
      ...profile,
      last_seen_at: lastSeenAt,
      is_live_now: Boolean(activity?.isLiveNow),
      live_area: activity?.liveArea || null,
      live_connected_at: activity?.isLiveNow ? activity.lastSeenAt : null
    };
  });
}

export function sortProfilesByActivity<T extends { last_seen_at: string | null; is_live_now?: boolean }>(profiles: T[]) {
  return [...profiles].sort((left, right) => {
    if (Boolean(left.is_live_now) !== Boolean(right.is_live_now)) {
      return left.is_live_now ? -1 : 1;
    }

    const leftMs = left.last_seen_at ? Date.parse(left.last_seen_at) : 0;
    const rightMs = right.last_seen_at ? Date.parse(right.last_seen_at) : 0;
    return rightMs - leftMs;
  });
}
