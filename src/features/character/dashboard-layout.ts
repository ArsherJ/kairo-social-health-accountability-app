/** Pure responsive policy shared by the progress hero and supporting pair. */
export function stackDashboard(width: number, fontScale: number): boolean {
  return width < 370 || fontScale > 1.25;
}
