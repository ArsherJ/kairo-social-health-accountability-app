/**
 * A race lane, said out loud.
 *
 * Same job as `row-label.ts`, and for the same measured reason: a lane draws a
 * rank, a figure, a name, a position on a track and a step count, and left as
 * separate accessibility elements a six-person race is thirty stops. The order
 * of this string *is* the reading order — position, who, how far — because that
 * is the order the eye takes the track in.
 *
 * Pure and tested in Node. It imports no UI, and the species name and the
 * ghost's day label are injected already formatted, exactly as `row-label.ts`
 * takes its `species` string rather than an id.
 *
 * **It says a percentage rather than a step count.** The track draws a distance
 * to a flag, not a number, and a label naming a figure the screen does not show
 * would describe a different product — the same rule deviation #34 applied when
 * points stopped being spoken.
 */

export interface RaceLabelInput {
  rank: number;
  /** Already resolved: a squadmate's character name, or a ghost's day. */
  characterName: string;
  isSelf: boolean;
  /** 0–100. Rounded here so the label and the bar cannot disagree. */
  progressPercent: number;
  finished: boolean;
  isGhost: boolean;
}

function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

export function raceLaneLabel(input: RaceLabelInput): string {
  // "your Saturday" rather than "Saturday": a ghost is a day of yours, and
  // without the possessive it reads as a squadmate called Saturday.
  const who = input.isSelf
    ? 'you'
    : input.isGhost
      ? `your ${input.characterName}`
      : input.characterName;

  // Not "100% to the finish line", which is a distance to somewhere you
  // already are. Crossing the line is an event, and the label says so.
  const where = input.finished
    ? 'finished'
    : `${Math.round(input.progressPercent)}% to the finish line`;

  // Commas, so VoiceOver pauses between fields instead of running the ordinal
  // into the name as one word.
  return `${ordinal(input.rank)}, ${who}, ${where}`;
}
