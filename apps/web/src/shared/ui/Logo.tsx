import React from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface LogoProps {
  className?: string;
  style?: React.CSSProperties;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  animate?: boolean;
}

export function Logo({ className, style, size = 'md', animate = true }: LogoProps) {
  // Base sizes
  const sizes = {
    xs: { container: 'w-4 h-4', box: 'w-[14px] h-[14px]', dot: 'w-1 h-1', radius: 'rounded-[4px]' },
    sm: { container: 'w-8 h-8', box: 'w-6 h-6', dot: 'w-1.5 h-1.5', radius: 'rounded-md' },
    md: { container: 'w-10 h-10', box: 'w-7 h-7', dot: 'w-2 h-2', radius: 'rounded-lg' },
    lg: { container: 'w-16 h-16', box: 'w-11 h-11', dot: 'w-3 h-3', radius: 'rounded-xl' },
    xl: { container: 'w-24 h-24', box: 'w-16 h-16', dot: 'w-5 h-5', radius: 'rounded-2xl' }, 
  };

  const currentSize = sizes[size];

  if (!animate) {
    return (
      <div className={cn("relative flex items-center justify-center overflow-hidden shrink-0", currentSize.container, className)} style={style}>
        <img src="/logo-white.png" alt="Pixelyf Logo" className="w-full h-full object-contain opacity-90" />
      </div>
    );
  }

  return (
    <div className={cn("relative group flex items-center justify-center overflow-hidden shrink-0", currentSize.container, className)} style={style}>
      {/* Tilted Box */}
      <div 
        className={cn(
          "absolute inset-0 m-auto border border-white/50 rotate-[23.5deg]",
          currentSize.box,
          currentSize.radius
        )} 
        style={animate ? { animation: 'floatRotate 20s linear infinite' } : undefined}
      />
      
      {/* Center Dot */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div 
          className={cn(
            "bg-white rounded-full shadow-[0_0_20px_rgba(255,255,255,0.8)]",
            currentSize.dot
          )} 
          style={animate ? { animation: 'dotPulseColor 3s ease-in-out infinite' } : undefined}
        />
      </div>

      {/* Ping effect */}
      {animate && (
        <div className="absolute inset-0 border border-white/10 rounded-full scale-[1.8] animate-ping opacity-10" />
      )}
    </div>
  );
}
