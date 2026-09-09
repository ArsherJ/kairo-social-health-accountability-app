export const WHACK_COPY = {
  action: 'Whack',
  back: 'Whack back',
  earned: 'Body Gold or a verified strength session earns one a day.',
  failed: 'Couldn’t send that whack. Try again.',
} as const;
export const whackBackLine = (name: string): string => `${name} ruffled your feathers.`;
export const whackRowMark = (senderName: string): string => `Feathers ruffled by ${senderName}.`;
export const whackAnnouncement = (sender: string, target: string): string =>
  `${sender} ruffled ${target}'s feathers.`;
