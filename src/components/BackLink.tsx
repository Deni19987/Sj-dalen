// "Tillbaka"-länk som går tillbaka i webbläsarens historik när man kom från en av listorna,
// så att man hamnar där man var på sidan (scrollpositionen återställs). Annars en vanlig länk.
import type { MouseEvent, ReactNode } from "react";
import { Link, useLocation, useRouter } from "@tanstack/react-router";
import { getPreviousPath } from "../lib/navHistory";

export function BackLink({
  to,
  from = [to],
  className,
  children,
}: {
  /** Dit länken går om man inte kan gå tillbaka. */
  to: string;
  /** Sidor man ska gå tillbaka till med historiken (annars går länken till `to`). */
  from?: string[];
  className?: string;
  children: ReactNode | ((back: boolean) => ReactNode);
}) {
  const router = useRouter();
  const { pathname } = useLocation();
  const previous = getPreviousPath(pathname);
  const back = previous != null && router.history.canGoBack() && from.includes(previous.replace(/\/+$/, "") || "/");
  const onClick = (e: MouseEvent) => {
    if (!back || e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    router.history.back();
  };
  return (
    <Link to={to} onClick={onClick} className={className}>
      {typeof children === "function" ? children(back) : children}
    </Link>
  );
}
