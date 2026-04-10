import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  type ViewStyle,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { formatCurrency } from '../../i18n';

type Trend = 'up' | 'down' | 'neutral';

interface KpiCardProps {
  title: string;
  value: number;
  isCurrency?: boolean;
  subtitle?: string;
  trend?: Trend;
  trendPercent?: number;
  /** Uyarı durumu — kırmızı vurgulama */
  isAlert?: boolean;
  onPress?: () => void;
  style?: ViewStyle;
}

/**
 * KPI Dashboard Widget Kartı.
 *
 * Trend okları: ↑ yeşil (iyi), ↓ kırmızı (kötü) — iş bağlamına göre renk isteğe uyarlanabilir.
 * Hafif dokunuş geri bildirimi: Haptics.selectionAsync()
 */
export const KpiCard: React.FC<KpiCardProps> = ({
  title,
  value,
  isCurrency = true,
  subtitle,
  trend,
  trendPercent,
  isAlert = false,
  onPress,
  style,
}) => {
  const handlePress = async () => {
    if (onPress) {
      await Haptics.selectionAsync();
      onPress();
    }
  };

  const trendColor = trend === 'up' ? '#22c55e' : trend === 'down' ? '#ef4444' : '#94a3b8';
  const trendArrow = trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→';

  const displayValue = isCurrency
    ? formatCurrency(value)
    : value.toLocaleString('tr-TR');

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        styles.card,
        isAlert && styles.alertCard,
        pressed && styles.pressed,
        style,
      ]}
    >
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>

      <Text
        style={[styles.value, isAlert && styles.alertValue]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {displayValue}
      </Text>

      {(subtitle || trend) && (
        <View style={styles.footer}>
          {subtitle && (
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          )}
          {trend && trendPercent !== undefined && (
            <Text style={[styles.trend, { color: trendColor }]}>
              {trendArrow} %{Math.abs(trendPercent).toFixed(1)}
            </Text>
          )}
        </View>
      )}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 16,
    flex: 1,
    minHeight: 110,
    borderWidth: 1,
    borderColor: '#334155',
  },
  alertCard: {
    borderColor: '#ef4444',
    backgroundColor: '#1c0f0f',
  },
  pressed: {
    opacity: 0.8,
  },
  title: {
    fontSize: 12,
    fontWeight: '500',
    color: '#94a3b8',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  value: {
    fontSize: 22,
    fontWeight: '700',
    color: '#f1f5f9',
    marginBottom: 4,
  },
  alertValue: {
    color: '#ef4444',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  subtitle: {
    fontSize: 11,
    color: '#64748b',
    flex: 1,
  },
  trend: {
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 8,
  },
});
