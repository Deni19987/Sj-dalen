import { useEffect, useState, type FormEvent } from "react";
import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import {
  CalendarDays,
  Car,
  ExternalLink,
  FileText,
  Gavel,
  Inbox,
  LayoutGrid,
  LogOut,
  Menu as MenuIcon,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { Logo } from "../components/Logo";
import { DEMO } from "../lib/api";
import { cn } from "../lib/cn";
import { login, logout, useOverview, useSession } from "./api";
import { Btn, FeedbackProvider, Sheet, Toggle } from "./ui";

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  badge?: number;
  exact?: boolean;
}

function useNav(): NavItem[] {
  const { data } = useOverview();
  const s = data?.stats;
  return [
    { to: "/admin", label: "Översikt", icon: LayoutGrid, exact: true },
    { to: "/admin/bilar", label: "Bilar", icon: Car, badge: s?.ended_cars },
    { to: "/admin/bud", label: "Bud", icon: Gavel },
    { to: "/admin/inkorg", label: "Inkorg", icon: Inbox, badge: s?.new_messages },
    { to: "/admin/bokningar", label: "Bokningar", icon: CalendarDays, badge: s?.bookings_today },
    { to: "/admin/innehall", label: "Innehåll", icon: FileText },
    { to: "/admin/installningar", label: "Inställningar", icon: Settings },
  ];
}

function isActive(pathname: string, item: NavItem) {
  const p = pathname.replace(/\/+$/, "") || "/";
  return item.exact ? p === item.to : p === item.to || p.startsWith(`${item.to}/`);
}

function Badge({ n, className }: { n?: number; className?: string }) {
  if (!n) return null;
  return (
    <span className={cn("min-w-[20px] rounded-full bg-ios-red px-1.5 text-center text-[11px] font-semibold leading-5 text-white", className)}>
      {n > 99 ? "99+" : n}
    </span>
  );
}

function SignedInAs() {
  const session = useSession();
  if (!session) return null;
  return (
    <div className="mb-1 flex items-center gap-2.5 px-3 py-1.5">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-[#a1a1a6] to-[#7c7c80] text-[13px] font-semibold text-white">
        {session.email.charAt(0).toUpperCase()}
      </span>
      <p className="min-w-0 truncate text-[13px] text-ios-secondary" title={session.email}>
        {session.email}
      </p>
    </div>
  );
}

function Sidebar({ pathname }: { pathname: string }) {
  const nav = useNav();
  return (
    <aside className="sticky top-0 hidden h-dvh w-[248px] shrink-0 flex-col border-r border-black/[.06] bg-white/70 px-3 py-5 backdrop-blur-xl lg:flex">
      <Link to="/admin" className="mb-6 flex items-center gap-2.5 px-3">
        <Logo className="h-8 w-8 rounded-full" />
        <div className="leading-tight">
          <p className="text-[15px] font-semibold tracking-[-0.01em] text-ios-label">Sjödalen Bilar</p>
          <p className="text-[12px] text-ios-tertiary">Admin</p>
        </div>
      </Link>
      <nav className="flex flex-1 flex-col gap-0.5">
        {nav.map((item) => {
          const active = isActive(pathname, item);
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "flex items-center gap-3 rounded-[10px] px-3 py-2 text-[15px] transition-colors",
                active ? "bg-ios-blue text-white" : "text-ios-label hover:bg-black/[.04]",
              )}
            >
              <item.icon size={18} className={active ? "text-white" : "text-ios-blue"} strokeWidth={2} />
              <span className="flex-1">{item.label}</span>
              <Badge n={item.badge} className={active ? "bg-white text-ios-blue" : undefined} />
            </Link>
          );
        })}
      </nav>
      <div className="space-y-0.5 border-t border-black/[.06] pt-3">
        <SignedInAs />
        <a
          href="/"
          target="_blank"
          rel="noopener"
          className="flex items-center gap-3 rounded-[10px] px-3 py-2 text-[15px] text-ios-label hover:bg-black/[.04]"
        >
          <ExternalLink size={18} className="text-ios-secondary" /> Visa webbplatsen
        </a>
        <button
          type="button"
          onClick={logout}
          className="flex w-full items-center gap-3 rounded-[10px] px-3 py-2 text-[15px] text-ios-label hover:bg-black/[.04]"
        >
          <LogOut size={18} className="text-ios-secondary" /> Logga ut
        </button>
      </div>
    </aside>
  );
}

/** Flikrad längst ned på mobil, som i iOS. */
function TabBar({ pathname }: { pathname: string }) {
  const nav = useNav();
  const [more, setMore] = useState(false);
  const main = nav.filter((n) => ["/admin", "/admin/bilar", "/admin/bud", "/admin/inkorg"].includes(n.to));
  const rest = nav.filter((n) => !main.includes(n));
  const restActive = rest.some((n) => isActive(pathname, n));
  const restBadge = rest.reduce((sum, n) => sum + (n.badge ?? 0), 0);

  return (
    <>
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-black/[.08] bg-white/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden">
        <div className="mx-auto grid max-w-lg grid-cols-5">
          {main.map((item) => {
            const active = isActive(pathname, item);
            return (
              <Link key={item.to} to={item.to} className="relative flex flex-col items-center gap-0.5 pb-1.5 pt-2">
                <item.icon size={23} strokeWidth={active ? 2.3 : 1.8} className={active ? "text-ios-blue" : "text-ios-tertiary"} />
                <span className={cn("text-[10px] font-medium", active ? "text-ios-blue" : "text-ios-tertiary")}>{item.label}</span>
                <Badge n={item.badge} className="absolute left-1/2 top-1 ml-2" />
              </Link>
            );
          })}
          <button type="button" onClick={() => setMore(true)} className="relative flex flex-col items-center gap-0.5 pb-1.5 pt-2">
            <MenuIcon size={23} strokeWidth={restActive ? 2.3 : 1.8} className={restActive ? "text-ios-blue" : "text-ios-tertiary"} />
            <span className={cn("text-[10px] font-medium", restActive ? "text-ios-blue" : "text-ios-tertiary")}>Mer</span>
            <Badge n={restBadge} className="absolute left-1/2 top-1 ml-2" />
          </button>
        </div>
      </nav>
      <Sheet open={more} onClose={() => setMore(false)} title="Mer" size="sm">
        <div className="p-4">
          <div className="overflow-hidden rounded-[14px] bg-white">
            {rest.map((item, i) => (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setMore(false)}
                className={cn("flex items-center gap-3 px-4 py-3 text-[17px] text-ios-label active:bg-ios-fill2", i > 0 && "border-t border-black/[.06]")}
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-[8px] bg-ios-blue text-white">
                  <item.icon size={17} />
                </span>
                <span className="flex-1">{item.label}</span>
                <Badge n={item.badge} />
              </Link>
            ))}
          </div>
          <div className="mt-4 overflow-hidden rounded-[14px] bg-white">
            <div className="border-b border-black/[.06] py-1.5">
              <SignedInAs />
            </div>
            <a href="/" target="_blank" rel="noopener" className="flex items-center gap-3 px-4 py-3 text-[17px] text-ios-blue">
              <ExternalLink size={18} /> Visa webbplatsen
            </a>
            <button type="button" onClick={logout} className="flex w-full items-center gap-3 border-t border-black/[.06] px-4 py-3 text-[17px] text-ios-red">
              <LogOut size={18} /> Logga ut
            </button>
          </div>
        </div>
      </Sheet>
    </>
  );
}

function LoginScreen() {
  const [email, setEmail] = useState(() => {
    try {
      return localStorage.getItem("sjodalen-admin-email") ?? "";
    } catch {
      return "";
    }
  });
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(0);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password || busy) return;
    setBusy(true);
    setError(null);
    try {
      await login(email, password, remember);
      try {
        localStorage.setItem("sjodalen-admin-email", email.trim());
      } catch {
        /* privat läge */
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte logga in.");
      setShake((s) => s + 1);
      setPassword("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-ios-bg px-4 font-apple">
      <div className="w-full max-w-[360px] animate-ios-sheet text-center">
        <Logo className="mx-auto h-16 w-16 rounded-full shadow-ios-lift" />
        <h1 className="mt-5 text-[28px] font-bold tracking-[-0.025em] text-ios-label">Sjödalen Bilar</h1>
        <p className="mt-1 text-[15px] text-ios-secondary">Logga in för att hantera webbplatsen</p>

        {DEMO ? (
          <div className="mt-8 rounded-[18px] bg-white p-5 text-left text-[15px] text-ios-secondary shadow-ios-card">
            Sajten körs i demoläge utan API. Starta med <code className="rounded bg-ios-fill px-1">npm run dev:local</code> för att
            använda admin lokalt.
          </div>
        ) : (
          <form key={shake} onSubmit={onSubmit} className={cn("mt-8 space-y-4 text-left", shake > 0 && "animate-ios-shake")}>
            <div className="overflow-hidden rounded-[14px] bg-white shadow-ios-card">
              <input
                type="text"
                inputMode="email"
                autoCapitalize="none"
                autoCorrect="off"
                autoComplete="username"
                autoFocus={!email}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="E-post"
                aria-label="E-post"
                className="w-full border-b border-black/[.06] bg-transparent px-4 py-3.5 text-[17px] outline-none placeholder:text-ios-tertiary"
              />
              <input
                type="password"
                autoFocus={!!email}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Lösenord"
                aria-label="Lösenord"
                className="w-full bg-transparent px-4 py-3.5 text-[17px] outline-none placeholder:text-ios-tertiary"
              />
            </div>
            <div className="rounded-[14px] bg-white px-4 py-2.5 shadow-ios-card">
              <Toggle checked={remember} onChange={setRemember} label="Håll mig inloggad" description="I 30 dagar på den här enheten" />
            </div>
            {error && <p className="px-1 text-center text-[14px] text-ios-red">{error}</p>}
            <Btn type="submit" variant="primary" size="lg" className="w-full" loading={busy} disabled={!email.trim() || !password}>
              Logga in
            </Btn>
          </form>
        )}
        <a href="/" className="mt-8 inline-block text-[14px] text-ios-blue hover:underline">
          ← Till webbplatsen
        </a>
      </div>
    </div>
  );
}

export function AdminLayout() {
  const loggedIn = !!useSession();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    const prevTitle = document.title;
    document.title = "Admin · Sjödalen Bilar";
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex, nofollow";
    document.head.appendChild(meta);
    return () => {
      document.title = prevTitle;
      meta.remove();
    };
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [pathname]);

  return (
    <FeedbackProvider>
      {!loggedIn ? (
        <LoginScreen />
      ) : (
        <div className="flex min-h-dvh bg-ios-bg font-apple text-ios-label antialiased">
          <Sidebar pathname={pathname} />
          <main className="min-w-0 flex-1 px-4 pb-28 pt-6 sm:px-8 sm:pt-10 lg:pb-12">
            <div className="mx-auto max-w-6xl">
              <Outlet />
            </div>
          </main>
          <TabBar pathname={pathname} />
        </div>
      )}
    </FeedbackProvider>
  );
}

