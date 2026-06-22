/**
 * WebView와 React Native (Native Shell) 간의 통신을 담당하는 브릿지 유틸리티
 */

// Native로 전송할 메시지 타입 (Web -> Native)
export type BridgeMessage = 
  | { type: 'HAPTIC_FEEDBACK'; payload: 'light' | 'medium' | 'heavy' }
  | { type: 'OPEN_CAMERA' }
  | { type: 'SESSION_EXPIRED' }
  | { type: 'SET_STATUS_BAR'; payload: 'light' | 'dark' }
  | { type: 'HIDE_TAB_BAR' }
  | { type: 'SHOW_TAB_BAR' }
  | { type: 'SHOW_LOGIN' }
  | { type: 'SYNC_TAB'; payload: string };

// Native에서 Web으로 전달할 메시지 타입 (Native -> Web)
export type NativeToWebMessage =
  | { type: 'NAVIGATE_TAB'; payload: string }
  | { type: 'OPEN_MOMENT_MODAL' };

/**
 * 웹 환경에서 네이티브로 메시지를 전송합니다.
 * @param message 전송할 메시지 객체
 */
export const sendToNative = (message: BridgeMessage) => {
  if (typeof window !== 'undefined' && window.ReactNativeWebView) {
    try {
      window.ReactNativeWebView.postMessage(JSON.stringify(message));
    } catch (e) {
      console.error('Failed to send message to Native:', e);
    }
  } else {
    // Native 환경이 아닌 브라우저 환경일 때의 폴백(Fallback) 처리
    console.warn('[Web Browser] Native Bridge Not Found. Message:', message);
  }
};

// ── 전역 탭바 가시성 제어 (Race Condition 방지) ──
let activeTabBarHideCount = 0;

export const requestHideTabBar = () => {
  activeTabBarHideCount++;
  if (activeTabBarHideCount === 1) {
    sendToNative({ type: 'HIDE_TAB_BAR' });
  }
};

export const requestShowTabBar = () => {
  activeTabBarHideCount = Math.max(0, activeTabBarHideCount - 1);
  if (activeTabBarHideCount === 0) {
    sendToNative({ type: 'SHOW_TAB_BAR' });
  }
};

export const syncNativeTab = (tabName: string) => {
  sendToNative({ type: 'SYNC_TAB', payload: tabName });
};

// 글로벌 타입 확장 (TypeScript 에러 방지)
declare global {
  interface Window {
    ReactNativeWebView?: {
      postMessage: (message: string) => void;
    };
  }
}
