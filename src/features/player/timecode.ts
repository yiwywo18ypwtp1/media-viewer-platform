// Frame-accurate time math for the player and comment timecodes.
//
// - A frame index comes from time with floor(t * fps): frame n covers
//   [n / fps, (n + 1) / fps).
// - Seeking to a frame targets its *middle*. Landing exactly on a boundary
//   lets float rounding (or a timecode stored in whole ms) slip to the
//   previous frame; the middle is half a frame away from either neighbour.
// - 29.97 and 59.94 fps use SMPTE drop-frame timecode (";" before frames):
//   frame *numbers* 00-01 (or 00-03) are skipped at the start of every
//   minute except each tenth, so the timecode stays in step with the clock.
//   23.976 uses non-drop timecode at a nominal 24, the industry convention.

export type FrameRate = { fps: number; nominal: number; dropFrame: boolean };

export function frameRate(fps: number): FrameRate {
  const nominal = Math.round(fps);
  // 29.97 = 30000/1001, 59.94 = 60000/1001
  const isNtsc = Math.abs(fps - (nominal * 1000) / 1001) < 0.01;
  return { fps, nominal, dropFrame: isNtsc && (nominal === 30 || nominal === 60) };
}

// Tiny epsilon: absorbs float noise like 1799.9999999 for an exact boundary.
export function frameAt(seconds: number, fps: number): number {
  return Math.max(0, Math.floor(seconds * fps + 1e-6));
}

export function frameMiddle(frame: number, fps: number): number {
  return (frame + 0.5) / fps;
}

// Frame count -> displayed frame number, inserting the dropped numbers.
function dropFrameAdjust(frame: number, nominal: number): number {
  const dropped = nominal === 60 ? 4 : 2;
  const framesPer10Minutes = nominal * 600 - dropped * 9;
  const framesPerMinute = nominal * 60 - dropped;
  const tens = Math.floor(frame / framesPer10Minutes);
  const rest = frame % framesPer10Minutes;
  const minutesWithDrops = rest > dropped ? Math.floor((rest - dropped) / framesPerMinute) : 0;
  return frame + dropped * 9 * tens + dropped * minutesWithDrops;
}

export function formatTimecode(seconds: number, rate: FrameRate): string {
  const frame = frameAt(seconds, rate.fps);
  const number = rate.dropFrame ? dropFrameAdjust(frame, rate.nominal) : frame;

  const ff = number % rate.nominal;
  const totalSeconds = Math.floor(number / rate.nominal);
  const ss = totalSeconds % 60;
  const mm = Math.floor(totalSeconds / 60) % 60;
  const hh = Math.floor(totalSeconds / 3600);

  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(hh)}:${pad(mm)}:${pad(ss)}${rate.dropFrame ? ";" : ":"}${pad(ff)}`;
}
