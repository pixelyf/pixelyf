import React from "react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface LogoTextProps {
  className?: string;
  size?: "sm" | "md" | "lg";
  showBeta?: boolean;
}

export function LogoText({
  className,
  size = "sm",
  showBeta = true,
}: LogoTextProps) {
  const styles = {
    sm: {
      container: "text-xl font-black tracking-tighter",
      badge:
        "absolute -top-[0.45em] left-[2em] text-[7px] font-bold tracking-widest text-black bg-white border border-white px-1 py-[1px] rounded-full scale-[0.65] origin-bottom-left",
    },
    md: {
      container: "text-3xl font-extrabold tracking-tight",
      badge:
        "absolute -top-[0.45em] left-[2em] text-[9px] font-bold tracking-widest text-black bg-white border border-white px-1.5 py-0.5 rounded-full scale-75 origin-bottom-left",
    },
    lg: {
      container: "text-4xl md:text-8xl font-black tracking-tighter",
      badge:
        "absolute -top-[0.45em] left-[2em] text-[10px] md:text-[12px] font-bold tracking-widest text-black bg-white border border-white px-2 py-0.5 rounded-full scale-75 origin-bottom-left",
    },
  };

  const currentStyle = styles[size];

  return (
    <div
      className={cn(
        "select-none flex items-center drop-shadow-md",
        currentStyle.container,
        className,
      )}
    >
      <span style={{ color: "var(--color-hot-magenta)" }}>PIXE</span>
      <span style={{ color: "#ffffff" }}>L</span>
      <span style={{ color: "var(--color-hot-magenta)" }}>Y</span>
      <span
        className="relative inline-block"
        style={{ color: "var(--color-hot-magenta)" }}
      >
        F{showBeta && <span className={currentStyle.badge}>BETA</span>}
      </span>
    </div>
  );
}
