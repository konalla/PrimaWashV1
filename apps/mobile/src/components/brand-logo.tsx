import { Image, StyleSheet } from 'react-native';

const primaWashLogo = require('../../assets/images/prima-wash-logo.png');

export function BrandLogo({ compact = false }: { readonly compact?: boolean }) {
  return <Image accessibilityLabel="Prima Wash" resizeMode="contain" source={primaWashLogo} style={compact ? styles.compact : styles.logo} />;
}

const styles = StyleSheet.create({
  logo: {
    width: 214,
    height: 72,
  },
  compact: {
    width: 150,
    height: 50,
  },
});
