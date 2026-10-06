import { useEffect } from "react";
import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { Megaphone } from "lucide-react";
import { cn } from "../lib/cn";
import { useSettings } from "../lib/queries";
import { CarFlowPromo } from "./CarFlowPromo";
import { Footer } from "./Footer";
import { Header } from "./Header";

/** Notisbanner högst upp (styrs från admin → Inställningar). */
function AnnouncementBar() {
  const { data: settings } = useSettings();
  const a = settings?.announcement;
  if (!a?.enabled || !a.text) return null;
  const cls = cn(
    "flex items-center justify-center gap-2 px-4 py-2 text-center text-sm font-semibold",
    a.tone === "warning" ? "bg-amber-400 text-graphite-900" : "bg-blue-500 text-white",
  );
  const content = (
    <>
      <Megaphone size={15} className="shrink-0" />
      <span>{a.text}</span>
      {a.link && <span aria-hidden>→</span>}
    </>
  );
  if (!a.link) return <div className={cls}>{content}</div>;
  if (a.link.startsWith("/"))
    return (
      <Link to={a.link} className={cn(cls, "hover:opacity-90")}>
        {content}
      </Link>
    );
  return (
    <a href={a.link} className={cn(cls, "hover:opacity-90")} rel="noopener">
      {content}
    </a>
  );
}

export function Layout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [pathname]);

  const path = pathname.replace(/\/+$/, "") || "/";

  // Admin har en egen layout (src/admin/AdminLayout.tsx)
  if (path === "/admin" || path.startsWith("/admin/")) return <Outlet />;

  return (
    <div className="flex min-h-screen flex-col bg-graphite-50 text-graphite-900">
      <AnnouncementBar />
      <Header />
      <main className="flex-1">
        <Outlet />
      </main>
      {path === "/" && <CarFlowPromo variant="home" />}
      {path === "/tjanster" && <CarFlowPromo variant="tjanster" />}
      <Footer />
    </div>
  );
}
