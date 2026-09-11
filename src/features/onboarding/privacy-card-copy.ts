/** Compose one complete privacy-card utterance from its injected claim body. */
export function privacyCardSpokenLabel({
  title,
  body,
  required,
}: {
  title: string;
  body: string;
  required: boolean;
}): string {
  return required ? `${title}. Required. ${body}` : `${title}. ${body}`;
}
