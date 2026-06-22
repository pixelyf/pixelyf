export const isNativeApp = () => {
  if (typeof window === 'undefined') return false;
  // React Native WebView 환경 감지 (브릿지 객체 또는 우리가 주입한 변수 존재 여부)
  return (
    // @ts-ignore
    window.ReactNativeWebView !== undefined ||
    // @ts-ignore
    window.__IS_NATIVE_APP__ === true
  );
};
