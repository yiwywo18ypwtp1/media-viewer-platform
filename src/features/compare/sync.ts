// Version comparison, the parts that are plain logic (tested in sync.test.ts).

// Which two versions to compare: ?a=1&b=3 from the URL (version numbers), or
// by default the latest against the one before it. null = nothing to compare.
export function pickVersions<T extends { number: number }>(
  versions: T[], // newest first, as listVersions returns them
  a: unknown,
  b: unknown,
): { left: T; right: T } | null {
  if (versions.length < 2) return null;
  const find = (value: unknown) => versions.find((v) => v.number === Number(value));
  const right = find(b) ?? versions[0];
  const left = find(a) ?? versions.find((v) => v !== right)!;
  return left === right ? null : { left, right };
}

// While playing, the two videos drift apart a little (each decodes on its own
// clock). Re-seeking the follower on every frame would make it stutter, so it
// is only pulled back past this much drift. When paused they're set to the
// exact same time.
export const MAX_PLAYING_DRIFT_SECONDS = 0.15;

// The time the right-hand video should jump to, or null to leave it alone.
// A shorter video waits at its end.
export function followerTarget(
  leaderTime: number,
  follower: { time: number; duration: number },
  playing: boolean,
): number | null {
  const target = Number.isFinite(follower.duration) ? Math.min(leaderTime, follower.duration) : leaderTime;
  const drift = Math.abs(follower.time - target);
  const tolerance = playing ? MAX_PLAYING_DRIFT_SECONDS : 0.001;
  return drift > tolerance ? target : null;
}
