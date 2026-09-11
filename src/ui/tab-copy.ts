export type TabId = 'index' | 'sky' | 'flock' | 'profile';

export type TabIcon =
  | 'white-balance-sunny'
  | 'weather-windy'
  | 'account-multiple'
  | 'account';

/** Shared geometry values kept pure so the shipping equal-width contract is tested. */
export const TAB_ITEM_GAP = 6;
export const TAB_ITEM_FLEX = 1;

export const TAB_ITEMS = [
  { id: 'index', label: 'Today', icon: 'white-balance-sunny' },
  { id: 'sky', label: 'Sky', icon: 'weather-windy' },
  { id: 'flock', label: 'Flock', icon: 'account-multiple' },
  { id: 'profile', label: 'You', icon: 'account' },
] as const satisfies readonly { id: TabId; label: string; icon: TabIcon }[];
