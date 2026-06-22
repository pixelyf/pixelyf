import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';

// ── 환경 설정 ──
// 개발: Next.js 프록시를 경유하여 Supabase에 접근
// 프로덕션: 직접 Supabase URL 사용
const DEV_BASE_URL = Platform.OS === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000';
const BASE_URL = process.env.EXPO_PUBLIC_API_URL || DEV_BASE_URL;
const SUPABASE_URL = `${BASE_URL}/supabase`;
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNjAwMDAwMDAwLCJleHAiOjI2MDAwMDAwMDB9.7YCs8pcg_R3snX28_W2N-FIhxBdsLmoKlaPr40dJ87w';

interface LoginScreenProps {
  onLoginSuccess: (accessToken: string, refreshToken: string) => void;
}

/**
 * 네이티브 로그인 화면
 *
 * Supabase GoTrue REST API를 직접 호출하여 인증합니다.
 * 성공 시 access_token과 refresh_token을 부모(App.tsx)에 전달합니다.
 */
export function LoginScreen({ onLoginSuccess }: LoginScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      setError('이메일과 비밀번호를 입력해 주세요.');
      return;
    }

    setError(null);
    setIsLoading(true);

    try {
      const res = await fetch(
        `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ email: email.trim(), password }),
        }
      );

      const data = await res.json();

      if (!res.ok) {
        // Supabase 에러 메시지 한글화
        const msg = data.error_description || data.msg || data.error || '';
        if (msg.includes('Invalid login credentials')) {
          setError('이메일 또는 비밀번호가 올바르지 않습니다.');
        } else if (msg.includes('Email not confirmed')) {
          setError('이메일 인증이 완료되지 않았습니다. 메일함을 확인해 주세요.');
        } else {
          setError(msg || '로그인에 실패했습니다.');
        }
        return;
      }

      if (data.access_token && data.refresh_token) {
        console.log('[LoginScreen] Login success for:', email);
        onLoginSuccess(data.access_token, data.refresh_token);
      } else {
        setError('인증 토큰을 받지 못했습니다.');
      }
    } catch (e) {
      console.error('[LoginScreen] Network error:', e);
      setError('네트워크 오류가 발생했습니다. 서버 연결을 확인해 주세요.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* 배경 블러 효과 (정적 그라디언트로 시뮬레이션) */}
      <View style={styles.bgGlow1} />
      <View style={styles.bgGlow2} />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* 로고 영역 */}
          <View style={styles.logoSection}>
            <View style={styles.logoCircle}>
              <Text style={styles.logoText}>P</Text>
            </View>
            <Text style={styles.title}>Pixelyf Universe</Text>
            <Text style={styles.subtitle}>
              자신의 픽셀을 생성하고 은하계의 일원이 되세요.
            </Text>
          </View>

          {/* 로그인 카드 */}
          <View style={styles.card}>
            {/* 이메일 */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>EMAIL ADDRESS</Text>
              <TextInput
                style={styles.input}
                placeholder="name@example.com"
                placeholderTextColor="#475569"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                value={email}
                onChangeText={setEmail}
                editable={!isLoading}
              />
            </View>

            {/* 비밀번호 */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>PASSWORD</Text>
              <TextInput
                style={styles.input}
                placeholder="••••••••"
                placeholderTextColor="#475569"
                secureTextEntry
                autoComplete="password"
                value={password}
                onChangeText={setPassword}
                editable={!isLoading}
                onSubmitEditing={handleLogin}
                returnKeyType="go"
              />
            </View>

            {/* 에러 메시지 */}
            {error && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {/* 로그인 버튼 */}
            <TouchableOpacity
              style={[styles.loginBtn, isLoading && styles.loginBtnDisabled]}
              onPress={handleLogin}
              disabled={isLoading}
              activeOpacity={0.85}
            >
              {isLoading ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <Text style={styles.loginBtnText}>Connect to Universe →</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* 푸터 */}
          <Text style={styles.footer}>
            © 2026 PIXELYF ENTITY. ALL SYSTEMS ONLINE.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#020617',
  },
  bgGlow1: {
    position: 'absolute',
    top: -80,
    left: -80,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: 'rgba(99, 102, 241, 0.08)',
  },
  bgGlow2: {
    position: 'absolute',
    bottom: -80,
    right: -80,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: 'rgba(168, 85, 247, 0.08)',
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 40,
  },
  // ── 로고 ──
  logoSection: {
    alignItems: 'center',
    marginBottom: 32,
  },
  logoCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  logoText: {
    fontSize: 28,
    fontWeight: '900',
    color: '#818CF8',
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 13,
    color: '#94A3B8',
    textAlign: 'center',
  },
  // ── 카드 ──
  card: {
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    borderRadius: 24,
    padding: 28,
    borderWidth: 1,
    borderColor: 'rgba(30, 41, 59, 0.5)',
  },
  fieldGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 10,
    fontWeight: '700',
    color: '#94A3B8',
    letterSpacing: 1.5,
    marginBottom: 8,
    marginLeft: 4,
  },
  input: {
    backgroundColor: 'rgba(2, 6, 23, 0.5)',
    borderWidth: 1,
    borderColor: '#1E293B',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    fontSize: 14,
    color: '#E2E8F0',
  },
  // ── 에러 ──
  errorBox: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.2)',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 12,
    color: '#F87171',
    lineHeight: 18,
  },
  // ── 버튼 ──
  loginBtn: {
    backgroundColor: '#4F46E5',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
    marginTop: 4,
  },
  loginBtnDisabled: {
    opacity: 0.5,
  },
  loginBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  // ── 푸터 ──
  footer: {
    marginTop: 32,
    textAlign: 'center',
    fontSize: 9,
    color: '#475569',
    letterSpacing: 2,
  },
});
