// The preview uses its own root and sample data; it never restores a session.
// Expo inlines the public flag. Release builds always enter the real router.
if (__DEV__ && process.env.EXPO_PUBLIC_UI_PREVIEW === '1') {
  const { registerRootComponent } = require('expo');
  const { MobilePreview } = require('./src/features/preview/MobilePreview.tsx');
  registerRootComponent(MobilePreview);
} else {
  require('expo-router/entry');
}
