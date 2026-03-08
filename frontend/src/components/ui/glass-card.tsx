import React from "react";

import { cn } from "@/lib/utils";

interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  blur?: "sm" | "md" | "lg" | "xl";
  hoverable?: boolean;
}

export function GlassCard({ children, className, blur = "lg", hoverable = false, ...props }: GlassCardProps) {
  const blurClasses = {
    sm: "backdrop-blur-sm",
    md: "backdrop-blur-md",
    lg: "backdrop-blur-lg",
    xl: "backdrop-blur-xl",
  };

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[28px] border border-white/30 bg-white/55 p-6 shadow-[0_24px_80px_-40px_rgba(76,29,149,0.4)] dark:border-white/10 dark:bg-slate-950/45",
        blurClasses[blur],
        hoverable && "transition duration-300 hover:-translate-y-0.5 hover:border-white/45 hover:bg-white/65 dark:hover:bg-slate-950/55",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
