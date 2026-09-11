export type ProfileHeaderLabelInput = {
  name: string;
  species: string;
  level: number;
  toNext: number;
  joined: string | null;
};

/** One spoken reading for the profile's visible identity and level progress. */
export function profileHeaderLabel({
  name,
  species,
  level,
  toNext,
  joined,
}: ProfileHeaderLabelInput): string {
  return [
    name,
    species,
    ...(joined == null ? [] : [joined]),
    `Level ${level}`,
    `${toNext.toLocaleString('en-US')} XP to the next`,
  ].join('. ') + '.';
}
