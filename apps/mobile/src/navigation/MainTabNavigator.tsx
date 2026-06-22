import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View } from 'react-native';
import { Home, Compass, Users, User } from 'lucide-react-native';

const Tab = createBottomTabNavigator();

// 완전 투명한 더미 스크린: 오직 탭바 클릭 이벤트만 발생시키고 뷰는 통과시킵니다.
const TransparentScreen = () => <View style={{ flex: 1, backgroundColor: 'transparent' }} pointerEvents="none" />;

interface MainTabNavigatorProps {
  onTabPress: (tabName: string) => void;
}

export function MainTabNavigator({ onTabPress }: MainTabNavigatorProps) {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: 'rgba(2, 6, 23, 0.95)', // slate-950 + slight transparency
          borderTopColor: 'rgba(255, 255, 255, 0.1)',
          paddingBottom: 4, 
          paddingTop: 8,
          height: 60,
          position: 'absolute', // To overlay perfectly on the webview
          bottom: 0,
          left: 0,
          right: 0,
          elevation: 0,
        },
        tabBarActiveTintColor: '#ffffff',
        tabBarInactiveTintColor: 'rgba(255, 255, 255, 0.4)',
        // 투명 처리하여 WebView가 보이게 함
        sceneStyle: { backgroundColor: 'transparent' }, 
      }}
    >
      <Tab.Screen
        name="Feed"
        component={TransparentScreen}
        options={{
          tabBarLabel: '피드',
          tabBarIcon: ({ color, size }) => <Home color={color} size={size} />,
        }}
        listeners={{
          tabPress: (e) => {
            e.preventDefault(); // 기본 라우팅 막기 (화면 깜빡임 방지)
            onTabPress('feed');
          },
        }}
      />
      <Tab.Screen
        name="Explore"
        component={TransparentScreen}
        options={{
          tabBarLabel: '탐험',
          tabBarIcon: ({ color, size }) => <Compass color={color} size={size} />,
        }}
        listeners={{
          tabPress: (e) => {
            e.preventDefault();
            onTabPress('explore');
          },
        }}
      />
      <Tab.Screen
        name="Bonds"
        component={TransparentScreen}
        options={{
          tabBarLabel: '내 연결',
          tabBarIcon: ({ color, size }) => <Users color={color} size={size} />,
        }}
        listeners={{
          tabPress: (e) => {
            e.preventDefault();
            onTabPress('bonds');
          },
        }}
      />
      <Tab.Screen
        name="Profile"
        component={TransparentScreen}
        options={{
          tabBarLabel: '내정보',
          tabBarIcon: ({ color, size }) => <User color={color} size={size} />,
        }}
        listeners={{
          tabPress: (e) => {
            e.preventDefault();
            onTabPress('profile');
          },
        }}
      />
    </Tab.Navigator>
  );
}
