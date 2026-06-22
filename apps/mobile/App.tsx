import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Animated, Platform } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import type { WebViewSource } from 'react-native-webview/lib/WebViewTypes';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { BottomTabBar } from './src/components/BottomTabBar';
import { LoginScreen } from './src/screens/LoginScreen';
import { useRef, useCallback, useState, useMemo, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const TAB_BAR_HEIGHT = 60;
const DEV_BASE_URL = Platform.OS === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000';
const BASE_URL = process.env.EXPO_PUBLIC_API_URL || DEV_BASE_URL;

// ── 세션 주입 중 표시할 로딩 HTML (컴포넌트 외부 — referential stability) ──
const LOADING_HTML = `
<!DOCTYPE html>
<html>
  <body style="margin:0; background:#0b0f10; display:flex; align-items:center; justify-content:center; height:100vh;">
    <div style="text-align:center; display:flex; flex-direction:column; align-items:center; justify-content:center;">
      <!-- 시그니처 사각형 로고 스피너 (112px로 100% 키움 및 텍스트 삭제 대응) -->
      <div style="width:112px; height:112px; position:relative; display:flex; align-items:center; justify-content:center; margin:0 auto;">
        <svg viewBox="0 0 100 100" class="spinner-rotate" style="width:100%; height:100%; overflow:visible;">
          <rect
            x="20"
            y="20"
            width="60"
            height="60"
            rx="9"
            fill="none"
            stroke="#A855F7"
            stroke-width="3.5"
            stroke-linecap="round"
            pathLength="1"
            class="spinner-dash"
            style="transform-origin:center;"
          />
        </svg>
      </div>
    </div>
    <style>
      @keyframes spinner-dash {
        0% {
          stroke-dasharray: 0, 1;
          stroke-dashoffset: 0;
        }
        50% {
          stroke-dasharray: 1, 1;
          stroke-dashoffset: 0;
        }
        100% {
          stroke-dasharray: 0, 1;
          stroke-dashoffset: -1;
        }
      }
      @keyframes spinner-rotate {
        0% {
          transform: rotate(23.5deg);
        }
        100% {
          transform: rotate(383.5deg);
        }
      }
      .spinner-dash {
        animation: spinner-dash 1.5s ease-in-out infinite;
      }
      .spinner-rotate {
        animation: spinner-rotate 2.5s linear infinite;
        transform-origin: center;
      }
    </style>
  </body>
</html>
`;

export default function App() {
  const webViewRef = useRef<WebView>(null);
  // 네이티브 Animated 기반 슬라이드: 0 = 보임, 1 = 숨김 (translateY로 아래로 밀어냄)
  const tabBarAnim = useRef(new Animated.Value(0)).current;
  const isTabBarVisible = useRef(true);

  // ── 인증 상태 관리 ──
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [activeTab, setActiveTab] = useState('feed');
  const [prevTab, setPrevTab] = useState('feed');
  const tokensRef = useRef<{ access: string; refresh: string } | null>(null);
  const sessionInjected = useRef(false);

  // 일반 탭 활성화 시 자동으로 prevTab 상태에 백업
  useEffect(() => {
    if (activeTab !== 'profile') {
      setPrevTab(activeTab);
    }
  }, [activeTab]);

  // ── WebView source 관리 (핵심: React re-render 시 안전) ──
  const [webViewSource, setWebViewSource] = useState<WebViewSource>(
    { html: LOADING_HTML, baseUrl: BASE_URL }
  );

  // ── 앱 로딩 시 세션 복구 ──
  useEffect(() => {
    const restoreSession = async () => {
      try {
        const stored = await AsyncStorage.getItem('auth_tokens');
        if (stored) {
          const tokens = JSON.parse(stored);
          console.log('[App] Restoring session from AsyncStorage');
          tokensRef.current = tokens;
          sessionInjected.current = false;
          setWebViewSource({ html: LOADING_HTML, baseUrl: BASE_URL });
          setIsLoggedIn(true);
        }
      } catch (e) {
        console.error('Failed to restore session', e);
      }
    };
    restoreSession();
  }, []);

  const animateTabBar = useCallback((visible: boolean) => {
    if (isTabBarVisible.current === visible) return; // 중복 호출 방지
    isTabBarVisible.current = visible;
    Animated.timing(tabBarAnim, {
      toValue: visible ? 0 : 1,
      duration: 250,
      useNativeDriver: true,
    }).start();
  }, [tabBarAnim]);

  const handleMessage = (event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      console.log('Message from WebView:', data);
      
      // WebView → Native 이벤트 처리
      switch (data.type) {
        case 'AURA_CHANGED':
          // TODO: 향후 탭바 FAB 색상 동기화
          console.log('[Bridge] Aura changed:', data.moodId);
          break;
        case 'HAPTIC_FEEDBACK':
          // TODO: 햅틱 피드백
          break;
        case 'HIDE_TAB_BAR':
          animateTabBar(false);
          break;
        case 'SHOW_TAB_BAR':
          animateTabBar(true);
          break;
        case 'SHOW_LOGIN':
          // WebView에서 로그인 화면 요청 (로그아웃 또는 세션 만료)
          console.log('[Bridge] SHOW_LOGIN requested');
          AsyncStorage.removeItem('auth_tokens');
          tokensRef.current = null;
          setIsLoggedIn(false);
          break;
        case 'SESSION_EXPIRED':
          console.log('[Bridge] Session expired');
          AsyncStorage.removeItem('auth_tokens');
          tokensRef.current = null;
          setIsLoggedIn(false);
          break;
        case 'SESSION_READY':
          // 세션 쿠키 주입 완료 → WebView source를 실제 앱 URL로 전환
          console.log('[Bridge] SESSION_READY — switching to app URL');
          setWebViewSource({ uri: BASE_URL });
          break;
        case 'SYNC_TAB':
          if (data.payload) {
            console.log('[Bridge] SYNC_TAB:', data.payload);
            if (data.payload === 'restore') {
              setActiveTab(prevTab);
            } else {
              setActiveTab(data.payload);
            }
          }
          break;
      }
    } catch (e) {
      console.error('Failed to parse bridge message', e);
    }
  };

  const handleTabPress = (tabName: string) => {
    if (tabName === 'create') {
      // 중앙 FAB: 기록하기 모달 오픈
      const script = `window.dispatchEvent(new CustomEvent('OPEN_MOMENT_MODAL')); true;`;
      webViewRef.current?.injectJavaScript(script);
      return;
    }

    if (activeTab === 'feed' && tabName === 'feed') {
      // 피드 탭이 활성화된 상태에서 다시 피드 탭을 터치한 경우 -> 검색 초기화 및 리셋 이벤트 전송
      console.log('[App] Re-tapped active feed tab — triggering feed search reset');
      const script = `window.dispatchEvent(new CustomEvent('RESET_FEED_SEARCH')); true;`;
      webViewRef.current?.injectJavaScript(script);
      return;
    }

    setActiveTab(tabName);
    // 탭 전환: WebView에 NAVIGATE_TAB 이벤트 전달
    const script = `window.dispatchEvent(new CustomEvent('NAVIGATE_TAB', { detail: '${tabName}' })); true;`;
    webViewRef.current?.injectJavaScript(script);
  };

  // [FAIL-SAFE] 웹뷰 리로드/새로고침 시 탭바 강제 복구
  const handleLoadStart = useCallback(() => {
    animateTabBar(true);
  }, [animateTabBar]);

  // ── 네이티브 로그인 성공 핸들러 ──
  const handleLoginSuccess = useCallback(async (accessToken: string, refreshToken: string) => {
    console.log('[App] Login success, setting tokens and transitioning to WebView');
    const tokens = { access: accessToken, refresh: refreshToken };
    tokensRef.current = tokens;
    try {
      await AsyncStorage.setItem('auth_tokens', JSON.stringify(tokens));
    } catch(e) {}
    sessionInjected.current = false; // 새 로그인이므로 세션 주입 필요
    setWebViewSource({ html: LOADING_HTML, baseUrl: BASE_URL }); // 로딩 화면부터 시작
    setIsLoggedIn(true);
  }, []);

  // ── WebView 로드 완료 시 세션 쿠키 주입 (1회만 실행) ──
  // 흐름: inline HTML 로드 → fetch로 세션 설정 → postMessage('SESSION_READY')
  //       → handleMessage에서 source를 { uri: BASE_URL }로 전환
  const handleLoadEnd = useCallback(() => {
    if (sessionInjected.current || !tokensRef.current) return;
    sessionInjected.current = true; // 플래그 선점 — 이후 로드에서는 스킵

    const { access, refresh } = tokensRef.current;
    // 절대 URL 사용 — baseUrl 해석 의존성 제거
    const script = `
      (async () => {
        try {
          const res = await fetch('${BASE_URL}/api/auth/native-session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              access_token: '${access}',
              refresh_token: '${refresh}'
            }),
            credentials: 'include'
          });
          const data = await res.json();
          if (data.success) {
            console.log('[NativeSession] Cookie set successfully');
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'SESSION_READY' }));
          } else {
            console.error('[NativeSession] Failed:', data.error);
            // 인증 복구 불가 시 네이티브 로그인 화면으로 폴백
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'SHOW_LOGIN' }));
          }
        } catch (e) {
          console.error('[NativeSession] Network error:', e);
          // 네트워크 에러 시에도 무한 로딩 방지를 위해 폴백
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'SHOW_LOGIN' }));
        }
      })();
      true;
    `;
    webViewRef.current?.injectJavaScript(script);
  }, []);

  // Animated translateY 보간: 0 → 0px (보임), 1 → 60px (숨김)
  const tabBarTranslateY = tabBarAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, TAB_BAR_HEIGHT + 34], // 34 = SafeArea 하단 여유
  });

  // ── 비로그인: 네이티브 로그인 화면 ──
  if (!isLoggedIn) {
    return (
      <SafeAreaProvider>
        <SafeAreaView style={styles.container} edges={['top']}>
          <StatusBar style="light" backgroundColor="#020617" />
          <LoginScreen onLoginSuccess={handleLoginSuccess} />
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  // ── 로그인 완료: WebView + BottomTabBar ──
  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container} edges={['top']}>
        <StatusBar style="light" backgroundColor="#0b0f10" />
        
        {/* WebView — source는 useState로 관리되므로 re-render 안전 */}
        <WebView 
          ref={webViewRef}
          source={webViewSource}
          style={styles.webview}
          onMessage={handleMessage}
          onLoadStart={handleLoadStart}
          onLoadEnd={handleLoadEnd}
          onError={(syntheticEvent) => {
            const { nativeEvent } = syntheticEvent;
            console.error('[WebView Core Error] 로드 중 에러 발생:', nativeEvent.description, nativeEvent.url);
          }}
          onHttpError={(syntheticEvent) => {
            const { nativeEvent } = syntheticEvent;
            console.error('[WebView HTTP Error] HTTP 상태 에러:', nativeEvent.statusCode, nativeEvent.url);
          }}
          bounces={false}
          showsVerticalScrollIndicator={false}
          showsHorizontalScrollIndicator={false}
          scalesPageToFit={false}
          injectedJavaScript={`window.__IS_NATIVE_APP__ = true; true;`}
          // 캔버스 모드에서 핀치줌이 브라우저 기본 줌으로 해석되지 않도록
          allowsInlineMediaPlayback={true}
        />

        {/* 하단 5탭 네비게이션 — Animated translateY로 부드러운 슬라이드 */}
        <Animated.View
          style={{
            transform: [{ translateY: tabBarTranslateY }],
          }}
          pointerEvents={isTabBarVisible.current ? 'auto' : 'none'}
        >
          <BottomTabBar activeTab={activeTab} onTabPress={handleTabPress} />
        </Animated.View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b0f10',
  },
  webview: {
    flex: 1,
    backgroundColor: '#0b0f10',
  },
});
