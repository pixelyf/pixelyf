import React, { useState } from 'react';
import { View, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { Home, Bell, Settings, Plus } from 'lucide-react-native';
import { PixelyfLogoIcon } from './PixelyfLogoIcon';

type TabItem = {
  key: string;
  Icon: any;
  isLogo?: boolean;
  isCenter?: boolean;
};

const tabs: TabItem[] = [
  { key: 'feed', Icon: Home },
  { key: 'explore', Icon: null, isLogo: true },
  { key: 'create', Icon: Plus, isCenter: true },
  { key: 'activity', Icon: Bell },
  { key: 'profile', Icon: Settings },
];

interface BottomTabBarProps {
  activeTab?: string;
  onTabPress: (tabName: string) => void;
}

/**
 * 5탭 하단 네비게이션 (프로덕션 버전)
 * 
 * Instagram 스타일:
 * - 텍스트 라벨 없음, 아이콘 전용
 * - 비활성: 화이트 outline (strokeWidth 1.8)
 * - 활성: 화이트 bold (strokeWidth 2.8) + 상단 인디케이터
 * - 중앙 FAB: 돌출 원형 48px
 */
export function BottomTabBar({ activeTab: propsActiveTab, onTabPress }: BottomTabBarProps) {
  const [activeTab, setActiveTab] = useState(propsActiveTab || 'feed');

  React.useEffect(() => {
    if (propsActiveTab) {
      setActiveTab(propsActiveTab);
    }
  }, [propsActiveTab]);

  const handlePress = (key: string) => {
    if (key === 'create') {
      onTabPress(key);
      return;
    }
    setActiveTab(key);
    onTabPress(key);
  };

  const getIconColor = (isActive: boolean) => isActive ? '#818CF8' : '#f8f9f9';

  return (
    <BlurView intensity={80} tint="dark" style={styles.container}>
      <View style={styles.tabRow}>
        {tabs.map(({ key, Icon, isCenter, isLogo }) => {
          const isActive = activeTab === key;

          // ── 중앙 FAB (기록) ──
          if (isCenter) {
            return (
              <View key={key} style={styles.centerWrapper}>
                <TouchableOpacity
                  style={styles.centerFab}
                  activeOpacity={0.8}
                  onPress={() => handlePress(key)}
                >
                  <Plus color="#ffffff" size={22} strokeWidth={2.5} />
                </TouchableOpacity>
              </View>
            );
          }

          // ── 로고 탭 (탐험) ──
          if (isLogo) {
            return (
              <TouchableOpacity
                key={key}
                style={styles.tab}
                activeOpacity={0.7}
                onPress={() => handlePress(key)}
              >
                <PixelyfLogoIcon size={26} color={getIconColor(isActive)} />
                {isActive && <View style={styles.activeIndicator} />}
              </TouchableOpacity>
            );
          }

          // ── 일반 탭 ──
          return (
            <TouchableOpacity
              key={key}
              style={styles.tab}
              activeOpacity={0.7}
              onPress={() => handlePress(key)}
            >
              {Icon && (
                <Icon
                  color={getIconColor(isActive)}
                  size={26}
                  strokeWidth={1.3}
                />
              )}
              {isActive && <View style={styles.activeIndicator} />}
            </TouchableOpacity>
          );
        })}
      </View>
    </BlurView>
  );
}

const TAB_HEIGHT = Platform.OS === 'ios' ? 49 : 56;
const BOTTOM_INSET = Platform.OS === 'ios' ? 34 : 0;

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: Platform.OS === 'android' ? 'rgba(11, 15, 16, 0.9)' : 'rgba(11, 15, 16, 0.65)',
    borderTopColor: 'rgba(255, 255, 255, 0.05)',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingBottom: BOTTOM_INSET,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 16,
  },
  tabRow: {
    height: TAB_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: TAB_HEIGHT,
    position: 'relative',
  },
  activeIndicator: {
    position: 'absolute',
    top: 0,
    width: 20,
    height: 2,
    borderRadius: 1,
    backgroundColor: '#818CF8',
  },
  // ── 중앙 FAB ──
  centerWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: TAB_HEIGHT,
  },
  centerFab: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#6366F1',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -20,
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 14,
    elevation: 10,
  },
});
