import { Redirect } from 'expo-router';

import { KairoLab } from '@/features/character/KairoLab.tsx';

export default function KairoLabRoute() {
  if (!__DEV__) return <Redirect href="/" />;
  return <KairoLab />;
}
