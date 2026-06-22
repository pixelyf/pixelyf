import React from 'react';
import Svg, { Rect, Circle, G, Defs, Filter, FeGaussianBlur, FeMerge, FeMergeNode } from 'react-native-svg';

interface PixelyfLogoIconProps {
  size?: number;
  active?: boolean;
  color?: string;
}

/**
 * 픽셀리프 로고 아이콘 (React Native SVG)
 * 
 * - 원본 SVG의 86px 자체 여백을 제거하여 콘텐츠에 밀착
 * - viewBox를 실제 콘텐츠 영역(50 50 412 412)으로 크롭
 * - active: strokeWidth 증가 + glow 효과
 * - inactive: 얇은 선 + 불투명도 감소
 */
export function PixelyfLogoIcon({ size = 26, color = '#f8f9f9' }: PixelyfLogoIconProps) {
  // Lucide (viewBox 24) 기준 두께 1.3
  // Logo (viewBox 412) 기준 환산: 1.3 * (412/24) ≈ 22.3
  const currentStrokeWidth = 22.3;

  return (
    <Svg
      width={size}
      height={size}
      viewBox="50 50 412 412"
    >
      {/* 23.5도 회전된 라운드 사각형 */}
      <G transform="translate(256 256) rotate(23.5) translate(-256 -256)">
        <Rect
          x="86"
          y="86"
          width="340"
          height="340"
          rx="85"
          fill="none"
          stroke={color}
          strokeWidth={currentStrokeWidth}
        />
      </G>
      {/* 중앙 원 */}
      <Circle
        cx="256"
        cy="256"
        r="53"
        fill={color}
      />
    </Svg>
  );
}
