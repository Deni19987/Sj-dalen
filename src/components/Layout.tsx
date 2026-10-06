import { useEffect } from "react";
import { Outlet, useRouterState } from "@tanstack/react-router";
import { CarFlowPromo } from "./CarFlowPromo";
import { Footer } from "./Footer";
import { Header } from "./Header";

export function Layout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [pathname]);

  const path = pathname.replace(/\/+$/, "") || "/";

  return (
    <div className="flex min-h-screen flex-col bg-graphite-50 text-graphite-900">
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
