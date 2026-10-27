/** Merge a frame's layout measurements once, ignoring sub-pixel layout noise. */
export function mergeMeasuredPositions(
  previous: Record<string, number>,
  measured: Record<string, number>,
): Record<string, number> {
  let next = previous;
  for (const [id, y] of Object.entries(measured)) {
    if (!Number.isFinite(y) || Math.abs((previous[id] ?? -1) - y) < 0.5) continue;
    if (next === previous) next = { ...previous };
    next[id] = y;
  }
  return next;
}
