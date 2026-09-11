export type TabId = 'index' | 'sky' | 'flock' | 'profile';

export type TabIcon =
  | 'white-balance-sunny'
  | 'weather-windy'
  | 'account-multiple'
  | 'account';

export const TAB_ITEMS = [
  { id: 'index', label: 'Today', icon: 'white-balance-sunny' },
  { id: 'sky', label: 'Sky', icon: 'weather-windy' },
  { id: 'flock', label: 'Flock', icon: 'account-multiple' },
  { id: 'profile', label: 'You', icon: 'account' },
] as const satisfies readonly { id: TabId; label: string; icon: TabIcon }[];
