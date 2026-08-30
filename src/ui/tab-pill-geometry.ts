/**
 * Where the moving selection pill sits in the tab bar, given the row's
 * measured width.
 *
 * Pure, no imports — the same split `ring.ts` and `gradient.ts` take, so it is
 * reached by vitest in plain node while the component that draws it is not.
 *
 * The bar lays four items in a row with a fixed `gap`. The selected one takes
 * `focusedFlex` times the width of the others — that is what makes room for its
 * label, and it is deviation-documented in `TabPill`. The pill is an absolute
 * overlay rather than a child of the selected item, so its left edge and width
 * have to be derived from that same flex arithmetic rather than measured.
 *
 * `left` is measured from the row's own left edge; the caller places the pill
 * as an absolute child of the row, so no bar inset enters here.
 */
export function tabPillGeometry(
  focusedIndex: number,
  rowWidth: number,
  count: number,
  gap: number,
  focusedFlex: number,
): { left: number; width: number } {
  const gaps = gap * Math.max(0, count - 1);
  const totalFlex = focusedFlex + Math.max(0, count - 1);
  // One flex unit in points. Every unfocused item is one unit wide; the
  // focused one is `focusedFlex` units.
  const unit = (rowWidth - gaps) / totalFlex;

  // Everything left of the focused item is an unfocused item plus its trailing
  // gap.
  const left = Math.max(0, focusedIndex) * (unit + gap);

  return { left, width: unit * focusedFlex };
}
