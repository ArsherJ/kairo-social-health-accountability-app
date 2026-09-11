export const PREVIEW_COPY = {
  title: 'Kairo · Design preview',
  sample: 'Sample data · interactions stay in this preview',
  onboarding: 'Onboarding',
  light: 'Light',
  dark: 'Dark',
  state: 'Screen state',
  ready: 'Ready',
  loading: 'Loading',
  empty: 'Empty',
  withheld: 'Private',
  error: 'Error',
  retry: 'Try again',
  failed: 'This part of your day couldn’t load.',
  waiting: 'Loading your day',
  next: 'A short walk. A little more sky.',
  details: 'Today, a little closer',
  detailsBody:
    'Your movement adds up through the day. These readings stay yours unless you choose to share with your flock.',
  inviteTitle: 'Room for your people',
  inviteBody: 'This is a sample invitation. Create or join your real flock in the app.',
  inviteClose: 'Back to the preview',
  shareInvite: 'Share invite',
  dailyWalk: 'Daily Walk',
  boardTitle: 'Today on the perch',
  flockName: 'The early birds',
  privateSky: 'Your flock is here. Their readings are private.',
  name: 'Dagit',
  handle: '@dagit',
  join: 'Joined September 2026',
  done: 'You’re ready for a little more sky.',
} as const;

export function previewReadings(steps: number, activeKcal: number): string {
  return `${steps.toLocaleString('en-US')} steps · ${activeKcal} active kcal`;
}
export type PreviewState = 'ready' | 'loading' | 'empty' | 'withheld' | 'error';
export type PreviewTab = 'today' | 'sky' | 'flock' | 'you';
export const PREVIEW_TABS: readonly {
  id: PreviewTab;
  label: string;
  icon: 'white-balance-sunny' | 'weather-windy' | 'account-multiple' | 'account';
}[] = [
  { id: 'today', label: 'Today', icon: 'white-balance-sunny' },
  { id: 'sky', label: 'Sky', icon: 'weather-windy' },
  { id: 'flock', label: 'Flock', icon: 'account-multiple' },
  { id: 'you', label: 'You', icon: 'account' },
];
