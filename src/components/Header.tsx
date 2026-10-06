import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Menu, X } from "lucide-react";
import { Button } from "./Button";
import { Logo } from "./Logo";

const NAV = [
  { to: "/", label: "Hem" },
  { to: "/tjanster", label: "Tjänster" },
  { to: "/boka", label: "Boka tid" },
  { to: "/om-oss", label: "Om oss" },
  { to: "/auktion", label: "Auktion", featured: true },
  { to: "/kontakt", label: "Kontakt" },
];

export function Header() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-graphite-100 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link
          to="/"
          className="flex items-center gap-2 font-display text-lg font-extrabold uppercase tracking-tight text-graphite-900"
        >
          <Logo className="h-9 w-9 rounded-full ring-2 ring-blue-500" />
          Sjödalen Bilar
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              activeOptions={{ exact: item.to === "/" }}
              className="rounded-full px-4 py-2 text-sm font-semibold transition-colors"
              activeProps={{
                className: item.featured ? "bg-blue-500 text-white" : "bg-graphite-900 text-white",
              }}
              inactiveProps={{
                className: item.featured
                  ? "bg-blue-50 text-blue-700 hover:bg-blue-100"
                  : "text-graphite-700 hover:bg-graphite-100",
              }}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="hidden md:block">
          <Button to="/boka" size="sm">
            Boka tid
          </Button>
        </div>

        <button
          type="button"
          className="rounded-lg p-2 text-graphite-900 md:hidden"
          onClick={() => setOpen((o) => !o)}
          aria-label={open ? "Stäng meny" : "Öppna meny"}
        >
          {open ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {open && (
        <div className="border-t border-graphite-100 bg-white px-4 py-3 md:hidden">
          <nav className="flex flex-col gap-1">
            {NAV.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                activeOptions={{ exact: item.to === "/" }}
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-2.5 text-sm font-semibold"
                activeProps={{
                  className: item.featured ? "bg-blue-500 text-white" : "bg-graphite-900 text-white",
                }}
                inactiveProps={{
                  className: item.featured
                    ? "bg-blue-50 text-blue-700"
                    : "text-graphite-700 hover:bg-graphite-100",
                }}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <Button to="/boka" className="mt-3 w-full" onClick={() => setOpen(false)}>
            Boka tid
          </Button>
        </div>
      )}
    </header>
  );
}
