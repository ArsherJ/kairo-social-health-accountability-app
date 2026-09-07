/**
 * "1st", "2nd", "3rd", "4th"... "11th"–"13th" are the irregular teens.
 *
 * One copy, because there were two: the Flock band's standing and the Sky
 * corridor's spoken racer label are the same rule about the same numbers, and
 * a second implementation of it is one edit away from two tabs disagreeing
 * about what 21st is called. Its own module rather than a shared home in
 * either, so neither has to import the other's decisions to borrow a suffix.
 */
export function ordinal(n: number): string {
  const teens = n % 100;
  if (teens >= 11 && teens <= 13) return `${n}th`;
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
