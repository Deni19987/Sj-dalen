import type { ReactNode } from "react";
import { cn } from "../lib/cn";

const variants = {
  blue: "bg-blue-500 text-white",
  dark: "bg-graphite-900 text-white",
  outline: "border border-graphite-300 text-graphite-700",
  muted: "bg-graphite-100 text-graphite-600",
};

export function Badge({
  children,
  variant = "blue",
  icon,
  className,
}: {
  children: ReactNode;
  variant?: keyof typeof variants;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold tracking-wide",
        variants[variant],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}
