import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { cn } from "../lib/cn";

const base =
  "inline-flex items-center justify-center gap-2 font-semibold rounded-full transition-colors disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap";

const variants = {
  primary: "bg-blue-500 text-white hover:bg-blue-600",
  dark: "bg-graphite-900 text-white hover:bg-graphite-800",
  outline: "border-2 border-graphite-900 text-graphite-900 hover:bg-graphite-900 hover:text-white",
  ghost: "text-graphite-900 hover:bg-graphite-100",
};

const sizes = {
  sm: "text-sm px-4 py-2",
  md: "text-base px-5 py-2.5",
  lg: "text-base px-7 py-3.5",
};

type Props = {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
  className?: string;
  children: ReactNode;
  /** Intern länk */
  to?: string;
  /** Extern länk */
  href?: string;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children">;

export function Button({
  variant = "primary",
  size = "md",
  className,
  children,
  to,
  href,
  type,
  onClick,
  ...rest
}: Props) {
  const classes = cn(base, variants[variant], sizes[size], className);
  if (to)
    return (
      <Link to={to} className={classes} onClick={onClick as never}>
        {children}
      </Link>
    );
  if (href)
    return (
      <a href={href} className={classes}>
        {children}
      </a>
    );
  return (
    <button type={type ?? "button"} className={classes} onClick={onClick} {...rest}>
      {children}
    </button>
  );
}
