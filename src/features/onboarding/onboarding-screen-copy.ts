import { CHARACTER_NAME_MAX, FREE_SQUAD_MAX_MEMBERS, RACE_FINISH_LINE } from '@kairo/core';

export const ONBOARDING_SCREEN_COPY = {
  welcome: {
    wordmark: 'KAIRO',
    eyebrow: 'Small steps. Real growth.',
    title: 'A little bird.\nA reason to move.',
    body:
      'Your everyday movement brings your Kairo to life. Start with yourself. Find your flock along the way.',
    detail: 'How does it work?',
    less: 'Got it',
    solo: 'Your pace comes first',
    soloBody:
      'Walk, move, rest. Your real activity shapes your bird, even when the app is closed.',
    flock: 'Good company helps',
    flockBody: `Make a flock of up to ${FREE_SQUAD_MAX_MEMBERS}. A shared sky gives you a reason to show up again.`,
    freeSquadMaxMembers: FREE_SQUAD_MAX_MEMBERS,
  },
  oneSky: {
    title: 'One sky,\none flag',
    pitch: `Everyone flies the same ${RACE_FINISH_LINE.toLocaleString()}-step lane each day. Cross the flag and your streak grows — the bird does the bragging for you.`,
    finishLine: RACE_FINISH_LINE,
    unit: 'steps',
  },
  mirror: {
    title: "You're not lazy.",
    correction: "You're just not being counted.",
    pitch:
      'Most days disappear the moment they end. Nothing saw the walk to the jeepney stop, the stairs, the long way home.',
    turn: "Kairo counts them. That's all it does — and that turns out to be enough.",
  },
  connect: {
    supportedLabel: 'CONNECT APPLE HEALTH',
    unsupportedLabel: 'ANDROID DEVELOPMENT BUILD',
    supportedTitle: 'Your character levels from what you already do.',
    unsupportedTitle: 'Health tracking is coming to Android.',
    unsupportedBody:
      'This build is for account, navigation and native-device smoke tests. It does not request health permissions, read device health data or sync health data.',
    revealCaption: 'today, already counted',
    unit: 'steps',
    readingLabel: (steps: number) => `${steps.toLocaleString()} steps today, already counted`,
    failed:
      "Apple Health didn't connect. Try again, or skip and connect later from Settings.",
    quiet: "We'll pick up your activity as it comes in.",
    continue: 'Continue',
    notNow: 'Not now',
  },
  difficulty: {
    title: 'Three quests a day.\nHow big?',
    automatic: 'Automatic',
    automaticBlurb: 'Grows with how long you have been here',
    note:
      'Change it any time in Settings. Your choice always wins over the automatic rule.',
  },
  privacy: {
    title: 'Your privacy,\nyour call',
    intro:
      'Kairo reads your steps to raise your bird and rank your day. You can change any of this later in Settings.',
    healthTitle: 'Health data',
    sharingTitle: 'Share totals with your flock',
    policyLabel: "Read Kairo's privacy policy",
    policyText: 'How Kairo handles your data',
    requiredLabel: (title: string) => `${title}: required`,
  },
  name: {
    eyebrow: 'It found you',
    title: 'Meet your Kairo',
    help: (species: string) =>
      `A ${species}, and from today it lives off your movement — your walks, your sessions, your sleep. Nothing you buy, nothing you tap.`,
    portraitLabel: (species: string) => `Your ${species} Kairo`,
    fieldLabel: 'Its name',
    accessibilityLabel: "Your Kairo's name",
    accessibilityHint: `Up to ${CHARACTER_NAME_MAX} characters`,
    placeholder: 'Name your Kairo',
    footnote: 'Rename it whenever you like.',
    maxLength: CHARACTER_NAME_MAX,
  },
  hatching: {
    eyebrow: 'DID YOU KNOW?',
    status: 'Setting up your Kairo…',
  },
} as const;
