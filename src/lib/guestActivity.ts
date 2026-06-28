export type GuestActivityProfile = {
  guest_id: string;
  email: string | null;
  full_name?: string | null;
  mobile: string | null;
  postcode?: string | null;
  segment?: string | null;
  visit_count?: number | null;
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
  key?: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  area?: string | null;
  connectedAt?: string;
};

export type ResolvedLiveGuest<T extends GuestActivityProfile> = {
  key: string;
  guest_id: string | null;
  name: string;
  email: string | null;
  mobile: string | null;
  postcode: string | null;
  segment: string | null;
  visit_count: number;
  last_seen_at: string | null;
  live_area: string | null;
  is_live_now: true;
  profile: T | null;
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

const compareProfiles = <T extends GuestActivityProfile>(left: T, right: T) => {
  const visitDelta = Number(right.visit_count ?? 0) - Number(left.visit_count ?? 0);
  if (visitDelta !== 0) return visitDelta;
  const rightSeen = right.last_seen_at ? Date.parse(right.last_seen_at) : 0;
  const leftSeen = left.last_seen_at ? Date.parse(left.last_seen_at) : 0;
  return rightSeen - leftSeen;
};

function buildProfileIndexes<T extends GuestActivityProfile>(profiles: T[]) {
  const byEmail = new Map<string, T>();
  const byPhone = new Map<string, T[]>();

  profiles.forEach((profile) => {
    const emailKey = normalizeGuestKey(profile.email);
    const phoneKey = normalizeGuestKey(profile.mobile);
    if (emailKey) byEmail.set(emailKey, profile);
    if (phoneKey) {
      const bucket = byPhone.get(phoneKey) ?? [];
      bucket.push(profile);
      byPhone.set(phoneKey, bucket);
    }
  });

  byPhone.forEach((bucket, key) => {
    byPhone.set(key, [...bucket].sort(compareProfiles));
  });

  return { byEmail, byPhone };
}

export function resolveProfileForIdentity<T extends GuestActivityProfile>(
  profiles: T[],
  identity: { email?: string | null; phone?: string | null }
) {
  const indexes = buildProfileIndexes(profiles);
  const emailKey = normalizeGuestKey(identity.email);
  const phoneKey = normalizeGuestKey(identity.phone);

  if (emailKey && indexes.byEmail.has(emailKey)) {
    return { profile: indexes.byEmail.get(emailKey) ?? null, matchType: 'email' as const };
  }

  if (phoneKey) {
    const candidates = indexes.byPhone.get(phoneKey) ?? [];
    if (candidates.length) {
      return { profile: candidates[0] ?? null, matchType: 'phone' as const };
    }
  }

  return { profile: null, matchType: 'none' as const };
}

export function resolveLiveGuests<T extends GuestActivityProfile>(
  profiles: T[],
  liveGuests: GuestActivityLiveGuest[]
): Array<ResolvedLiveGuest<T>> {
  const indexes = buildProfileIndexes(profiles);

  const resolveOne = (guest: GuestActivityLiveGuest) => {
    const emailKey = normalizeGuestKey(guest.email);
    const phoneKey = normalizeGuestKey(guest.phone);
    const matchedProfile = (emailKey && indexes.byEmail.get(emailKey))
      || ((indexes.byPhone.get(phoneKey) ?? [])[0] ?? null);

    return {
      key: guest.key || emailKey || phoneKey || guest.connectedAt || Math.random().toString(36).slice(2),
      guest_id: matchedProfile?.guest_id ?? null,
      name: String(matchedProfile?.full_name || guest.name || guest.email || guest.phone || 'Guest device').trim(),
      email: guest.email || matchedProfile?.email || null,
      mobile: guest.phone || matchedProfile?.mobile || null,
      postcode: matchedProfile?.postcode || null,
      segment: matchedProfile?.segment || null,
      visit_count: Number(matchedProfile?.visit_count ?? 0),
      last_seen_at: pickLatestTimestamp(guest.connectedAt, matchedProfile?.last_seen_at),
      live_area: guest.area || null,
      is_live_now: true as const,
      profile: matchedProfile
    };
  };

  return liveGuests.map(resolveOne);
}

export function mergeGuestActivity<T extends GuestActivityProfile>(
  profiles: T[],
  sessions: GuestActivitySession[],
  liveGuests: GuestActivityLiveGuest[]
): Array<T & { is_live_now: boolean; live_area: string | null; live_connected_at: string | null }> {
  const activityByGuestId = new Map<string, { lastSeenAt: string; isLiveNow: boolean; liveArea: string | null }>();

  const apply = (guestId: string, payload: { lastSeenAt: string; isLiveNow: boolean; liveArea: string | null }) => {
    if (!guestId || !payload.lastSeenAt) return;
    const current = activityByGuestId.get(guestId);
    if (!current) {
      activityByGuestId.set(guestId, payload);
      return;
    }

    const latestSeenAt = pickLatestTimestamp(current.lastSeenAt, payload.lastSeenAt);
    if (!latestSeenAt) return;

    activityByGuestId.set(guestId, {
      lastSeenAt: latestSeenAt,
      isLiveNow: current.isLiveNow || payload.isLiveNow,
      liveArea: payload.liveArea || current.liveArea
    });
  };

  sessions.forEach((session) => {
    const moment = getGuestSessionMoment(session);
    if (!moment) return;
    const resolved = resolveProfileForIdentity(profiles, { email: session.guest_email, phone: session.guest_phone });
    if (!resolved.profile) return;
    apply(resolved.profile.guest_id, {
      lastSeenAt: new Date(moment).toISOString(),
      isLiveNow: false,
      liveArea: null
    });
  });

  resolveLiveGuests(profiles, liveGuests).forEach((guest) => {
    if (!guest.guest_id || !guest.last_seen_at) return;
    apply(guest.guest_id, {
      lastSeenAt: guest.last_seen_at,
      isLiveNow: true,
      liveArea: guest.live_area
    });
  });

  return profiles.map((profile) => {
    const activity = activityByGuestId.get(profile.guest_id) || null;
    return {
      ...profile,
      last_seen_at: pickLatestTimestamp(profile.last_seen_at, activity?.lastSeenAt),
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
