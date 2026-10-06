// Byggstenar för admin – inspirerade av Apples gränssnitt: lugna ytor, tydlig typografi,
// mjuka animationer och kontroller som känns igen från iOS/macOS.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";
import { CircleAlert, CircleCheck, Loader2, MoreHorizontal, Search, X } from "lucide-react";
import { cn } from "../lib/cn";

/* ------------------------------------------------------------------ */
/* Knappar                                                              */
/* ------------------------------------------------------------------ */

const BTN_VARIANTS = {
  primary: "bg-ios-blue text-white hover:bg-ios-blue-hover shadow-sm",
  secondary: "bg-ios-fill text-ios-label hover:bg-[#dedee3]",
  tinted: "bg-ios-blue/10 text-ios-blue hover:bg-ios-blue/15",
  plain: "text-ios-blue hover:bg-ios-blue/10",
  destructive: "bg-ios-red/10 text-ios-red hover:bg-ios-red/15",
  danger: "bg-ios-red text-white hover:bg-[#e6352b]",
  dark: "bg-ios-label text-white hover:bg-black",
};

const BTN_SIZES = {
  sm: "h-8 px-3 text-[13px] gap-1.5 rounded-full",
  md: "h-10 px-4 text-[15px] gap-2 rounded-full",
  lg: "h-12 px-6 text-[17px] gap-2 rounded-full",
  icon: "h-9 w-9 rounded-full justify-center",
};

type BtnProps = {
  variant?: keyof typeof BTN_VARIANTS;
  size?: keyof typeof BTN_SIZES;
  loading?: boolean;
  icon?: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>;

export function Btn({ variant = "secondary", size = "md", loading, icon, className, children, disabled, type, ...rest }: BtnProps) {
  return (
    <button
      type={type ?? "button"}
      disabled={disabled || loading}
      className={cn(
        "inline-flex select-none items-center justify-center whitespace-nowrap font-medium tracking-[-0.01em] transition-[background-color,transform,opacity] duration-150 active:scale-[.97] disabled:pointer-events-none disabled:opacity-40",
        BTN_VARIANTS[variant],
        BTN_SIZES[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 size={size === "sm" ? 14 : 17} className="animate-spin" /> : icon}
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Ytor och text                                                        */
/* ------------------------------------------------------------------ */

export function Card({ className, children, padded = true }: { className?: string; children: ReactNode; padded?: boolean }) {
  return <div className={cn("rounded-[20px] bg-white shadow-ios-card", padded && "p-5 sm:p-6", className)}>{children}</div>;
}

export function PageHeader({
  title,
  subtitle,
  actions,
  back,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  back?: ReactNode;
}) {
  return (
    <div className="mb-6 sm:mb-8">
      {back}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[28px] font-bold leading-tight tracking-[-0.025em] text-ios-label sm:text-[34px]">{title}</h1>
          {subtitle && <p className="mt-1 text-[15px] text-ios-secondary">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function SectionLabel({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between px-1">
      <h2 className="text-[13px] font-semibold uppercase tracking-wide text-ios-tertiary">{children}</h2>
      {action}
    </div>
  );
}

const TONES = {
  gray: "bg-ios-fill text-ios-secondary",
  blue: "bg-ios-blue/10 text-ios-blue",
  green: "bg-ios-green/15 text-[#1f8a3b]",
  orange: "bg-ios-orange/15 text-[#c45d00]",
  red: "bg-ios-red/10 text-ios-red",
  purple: "bg-ios-purple/12 text-ios-purple",
  dark: "bg-ios-label text-white",
};
export type Tone = keyof typeof TONES;

export function Pill({ tone = "gray", children, dot, className }: { tone?: Tone; children: ReactNode; dot?: boolean; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[12px] font-semibold", TONES[tone], className)}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("animate-spin text-ios-tertiary", className)} size={22} />;
}

export function EmptyState({ icon, title, text, action }: { icon: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-ios-fill2 text-ios-tertiary">{icon}</div>
      <p className="text-[17px] font-semibold text-ios-label">{title}</p>
      {text && <p className="mt-1 max-w-sm text-[15px] text-ios-secondary">{text}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-ios-pulse rounded-xl bg-ios-fill", className)} />;
}

export function LoadingBlock() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-24" />
      <Skeleton className="h-24" />
      <Skeleton className="h-24" />
    </div>
  );
}

export function ErrorBlock({ error, retry }: { error: unknown; retry?: () => void }) {
  return (
    <Card className="flex items-start gap-3">
      <CircleAlert className="mt-0.5 shrink-0 text-ios-red" size={20} />
      <div className="flex-1">
        <p className="font-semibold text-ios-label">Kunde inte hämta data</p>
        <p className="text-[15px] text-ios-secondary">{error instanceof Error ? error.message : "Okänt fel."}</p>
      </div>
      {retry && (
        <Btn size="sm" onClick={retry}>
          Försök igen
        </Btn>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Formulär                                                             */
/* ------------------------------------------------------------------ */

export const INPUT =
  "w-full rounded-xl border-0 bg-ios-fill2 px-3.5 py-2.5 text-[15px] text-ios-label outline-none ring-1 ring-inset ring-transparent transition placeholder:text-ios-tertiary focus:bg-white focus:ring-2 focus:ring-ios-blue/60";

export function Field({
  label,
  hint,
  children,
  className,
  htmlFor,
}: {
  label: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
  htmlFor?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="mb-1.5 block px-1 text-[13px] font-medium text-ios-secondary">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1.5 px-1 text-[12px] text-ios-tertiary">{hint}</p>}
    </div>
  );
}

export function Input({ className, suffix, ...rest }: InputHTMLAttributes<HTMLInputElement> & { suffix?: ReactNode }) {
  if (!suffix) return <input className={cn(INPUT, className)} {...rest} />;
  return (
    <div className="relative">
      <input className={cn(INPUT, "pr-12", className)} {...rest} />
      <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[15px] text-ios-tertiary">{suffix}</span>
    </div>
  );
}

/** Textfält som växer med innehållet. */
export function TextArea({ className, value, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [value]);
  return <textarea ref={ref} value={value} rows={3} className={cn(INPUT, "resize-none leading-relaxed", className)} {...rest} />;
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select className={cn(INPUT, "appearance-none pr-9", className)} {...rest}>
        {children}
      </select>
      <svg className="pointer-events-none absolute right-3 top-1/2 h-3 w-3 -translate-y-1/2 text-ios-tertiary" viewBox="0 0 12 12" fill="none">
        <path d="M3 4.5 6 7.5l3-3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: ReactNode;
  description?: ReactNode;
}) {
  const id = useId();
  const sw = (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors duration-200",
        checked ? "bg-ios-green" : "bg-[#e9e9eb]",
      )}
    >
      <span
        className={cn(
          "absolute left-[2px] top-[2px] h-[27px] w-[27px] rounded-full bg-white shadow-[0_3px_8px_rgba(0,0,0,.15),0_1px_1px_rgba(0,0,0,.16)] transition-transform duration-300 ease-ios",
          checked && "translate-x-5",
        )}
      />
    </button>
  );
  if (!label) return sw;
  return (
    <div className="flex items-center justify-between gap-4">
      <label htmlFor={id} className="cursor-pointer">
        <span className="block text-[15px] text-ios-label">{label}</span>
        {description && <span className="block text-[13px] text-ios-secondary">{description}</span>}
      </label>
      {sw}
    </div>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: { value: T; label: ReactNode; count?: number }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState<{ left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    const measure = () => {
      const el = wrap.current?.querySelector<HTMLButtonElement>(`[data-value="${CSS.escape(value)}"]`);
      if (el) setThumb({ left: el.offsetLeft, width: el.offsetWidth });
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (wrap.current) ro.observe(wrap.current);
    return () => ro.disconnect();
  }, [value, options.length]);

  return (
    <div className={cn("max-w-full overflow-x-auto", className)}>
      <div ref={wrap} className="relative inline-flex rounded-[10px] bg-ios-fill p-[2px]" role="tablist">
        {thumb && (
          <span
            className="absolute bottom-[2px] top-[2px] rounded-[8px] bg-white shadow-[0_3px_8px_rgba(0,0,0,.12),0_3px_1px_rgba(0,0,0,.04)] transition-all duration-300 ease-ios"
            style={{ left: thumb.left, width: thumb.width }}
          />
        )}
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={o.value === value}
            data-value={o.value}
            onClick={() => onChange(o.value)}
            className={cn(
              "relative z-10 flex items-center gap-1.5 whitespace-nowrap rounded-[8px] px-3.5 py-1.5 text-[13px] font-medium transition-colors",
              o.value === value ? "text-ios-label" : "text-ios-secondary hover:text-ios-label",
            )}
          >
            {o.label}
            {o.count != null && o.count > 0 && (
              <span className={cn("rounded-full px-1.5 text-[11px] font-semibold", o.value === value ? "bg-ios-blue text-white" : "bg-ios-separator/70 text-ios-secondary")}>
                {o.count}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

export function SearchField({ value, onChange, placeholder = "Sök" }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="relative w-full sm:w-64">
      <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ios-tertiary" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-9 w-full rounded-[10px] bg-ios-fill pl-9 pr-8 text-[15px] text-ios-label outline-none transition placeholder:text-ios-tertiary focus:bg-white focus:ring-2 focus:ring-ios-blue/50 [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button
          type="button"
          aria-label="Rensa sökning"
          onClick={() => onChange("")}
          className="absolute right-2 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full bg-ios-tertiary/60 text-white"
        >
          <X size={12} strokeWidth={3} />
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sheet (modal) – glider upp från botten på mobil, centrerad på dator  */
/* ------------------------------------------------------------------ */

export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
  size = "md",
  dark,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "full";
  dark?: boolean;
}) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prevFocus = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => panel.current?.querySelector<HTMLElement>("[autofocus], input, textarea, select")?.focus());
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      prevFocus?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  const widths = { sm: "sm:max-w-sm", md: "sm:max-w-lg", lg: "sm:max-w-3xl", full: "sm:max-w-6xl" };

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center font-apple sm:items-center sm:p-6" role="dialog" aria-modal="true">
      <div className="absolute inset-0 animate-ios-fade bg-black/35 backdrop-blur-[2px]" onClick={onClose} />
      <div
        ref={panel}
        className={cn(
          "relative flex max-h-[92dvh] w-full animate-ios-up flex-col overflow-hidden rounded-t-[22px] shadow-ios-sheet sm:animate-ios-sheet sm:rounded-[22px]",
          dark ? "bg-[#1c1c1e] text-white" : "bg-ios-bg",
          widths[size],
          size === "full" && "sm:h-[90dvh]",
        )}
      >
        {title && (
          <div className={cn("flex items-center justify-between gap-3 border-b px-5 py-3.5", dark ? "border-white/10" : "border-black/[.06] bg-white/80 backdrop-blur")}>
            <h2 className="text-[17px] font-semibold tracking-[-0.01em]">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Stäng"
              className={cn("flex h-7 w-7 items-center justify-center rounded-full", dark ? "bg-white/10 text-white/70" : "bg-ios-fill text-ios-secondary")}
            >
              <X size={15} strokeWidth={2.5} />
            </button>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
        {footer && (
          <div className={cn("flex flex-wrap justify-end gap-2 border-t px-5 py-3.5 pb-[max(.875rem,env(safe-area-inset-bottom))]", dark ? "border-white/10" : "border-black/[.06] bg-white/80 backdrop-blur")}>
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

/* ------------------------------------------------------------------ */
/* Åtgärdsmeny ("…")                                                    */
/* ------------------------------------------------------------------ */

export interface MenuItem {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  destructive?: boolean;
  hidden?: boolean;
}

export function ActionMenu({ items, label = "Fler åtgärder", trigger }: { items: MenuItem[]; label?: string; trigger?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; up: boolean }>({ top: 0, left: 0, up: false });
  const btn = useRef<HTMLButtonElement>(null);
  const visible = items.filter((i) => !i.hidden);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function toggle(e: ReactMouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    const r = btn.current!.getBoundingClientRect();
    const up = r.bottom + visible.length * 44 + 24 > window.innerHeight;
    setPos({ top: up ? r.top - 6 : r.bottom + 6, left: Math.min(Math.max(8, r.right - 232), window.innerWidth - 240), up });
    setOpen((o) => !o);
  }

  return (
    <>
      <button
        ref={btn}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={toggle}
        className="flex h-8 w-8 items-center justify-center rounded-full text-ios-secondary transition hover:bg-ios-fill"
      >
        {trigger ?? <MoreHorizontal size={18} />}
      </button>
      {open &&
        createPortal(
          <div className="fixed inset-0 z-[70] font-apple" onClick={() => setOpen(false)}>
            <div
              role="menu"
              className="absolute w-[232px] origin-top-right animate-ios-pop overflow-hidden rounded-[14px] bg-white/95 py-1 shadow-ios-sheet backdrop-blur-xl"
              style={{ left: pos.left, top: pos.top, transform: pos.up ? "translateY(-100%)" : undefined }}
              onClick={(e) => e.stopPropagation()}
            >
              {visible.map((item, i) => (
                <button
                  key={i}
                  role="menuitem"
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    item.onClick();
                  }}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-[15px] transition hover:bg-ios-fill2",
                    item.destructive ? "text-ios-red" : "text-ios-label",
                    i > 0 && "border-t border-black/[.05]",
                  )}
                >
                  {item.label}
                  <span className={item.destructive ? "text-ios-red" : "text-ios-secondary"}>{item.icon}</span>
                </button>
              ))}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Notiser (toasts) och bekräftelsedialog                               */
/* ------------------------------------------------------------------ */

type ToastTone = "success" | "error" | "info";
interface ToastItem {
  id: number;
  text: string;
  tone: ToastTone;
  action?: { label: string; onClick: () => void };
}

interface ConfirmOptions {
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  destructive?: boolean;
}

const FeedbackContext = createContext<{
  toast: (text: string, tone?: ToastTone, action?: ToastItem["action"]) => void;
  confirm: (o: ConfirmOptions) => Promise<boolean>;
} | null>(null);

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [dialog, setDialog] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);
  const nextId = useRef(1);

  const toast = useCallback((text: string, tone: ToastTone = "success", action?: ToastItem["action"]) => {
    const id = nextId.current++;
    setToasts((t) => [...t.slice(-2), { id, text, tone, action }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === "error" ? 6000 : 3500);
  }, []);

  const confirm = useCallback(
    (o: ConfirmOptions) => new Promise<boolean>((resolve) => setDialog({ ...o, resolve })),
    [],
  );

  const close = (v: boolean) => {
    dialog?.resolve(v);
    setDialog(null);
  };

  return (
    <FeedbackContext.Provider value={{ toast, confirm }}>
      {children}
      {createPortal(
        <div className="pointer-events-none fixed inset-x-0 top-3 z-[80] flex flex-col items-center gap-2 px-4 font-apple">
          {toasts.map((t) => (
            <div
              key={t.id}
              role="status"
              className="pointer-events-auto flex max-w-md animate-ios-toast items-center gap-2.5 rounded-full bg-[#1d1d1f]/90 py-2.5 pl-3.5 pr-4 text-[14px] font-medium text-white shadow-ios-lift backdrop-blur-xl"
            >
              {t.tone === "success" && <CircleCheck size={18} className="shrink-0 text-ios-green" />}
              {t.tone === "error" && <CircleAlert size={18} className="shrink-0 text-ios-red" />}
              <span>{t.text}</span>
              {t.action && (
                <button
                  type="button"
                  className="ml-1 font-semibold text-[#64d2ff]"
                  onClick={() => {
                    t.action!.onClick();
                    setToasts((x) => x.filter((y) => y.id !== t.id));
                  }}
                >
                  {t.action.label}
                </button>
              )}
            </div>
          ))}
        </div>,
        document.body,
      )}
      {dialog &&
        createPortal(
          <div className="fixed inset-0 z-[90] flex items-center justify-center p-6 font-apple" role="alertdialog" aria-modal="true">
            <div className="absolute inset-0 animate-ios-fade bg-black/30" onClick={() => close(false)} />
            <div className="relative w-full max-w-[290px] animate-ios-pop overflow-hidden rounded-[16px] bg-white/95 text-center shadow-ios-sheet backdrop-blur-xl">
              <div className="px-5 pb-4 pt-5">
                <p className="text-[17px] font-semibold text-ios-label">{dialog.title}</p>
                {dialog.message && <div className="mt-1 text-[13px] leading-snug text-ios-label/80">{dialog.message}</div>}
              </div>
              <div className="grid grid-cols-2 border-t border-black/10">
                <button type="button" className="py-3 text-[17px] text-ios-blue hover:bg-black/[.03]" onClick={() => close(false)}>
                  Avbryt
                </button>
                <button
                  type="button"
                  autoFocus
                  className={cn("border-l border-black/10 py-3 text-[17px] font-semibold hover:bg-black/[.03]", dialog.destructive ? "text-ios-red" : "text-ios-blue")}
                  onClick={() => close(true)}
                >
                  {dialog.confirmLabel ?? "OK"}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </FeedbackContext.Provider>
  );
}

export function useFeedback() {
  const ctx = useContext(FeedbackContext);
  if (!ctx) throw new Error("useFeedback måste användas inom FeedbackProvider");
  return ctx;
}

/** Kör en mutation och visar notis vid lyckat/misslyckat resultat. */
export function useRun() {
  const { toast } = useFeedback();
  return useCallback(
    async <T,>(fn: () => Promise<T>, success?: string): Promise<T | undefined> => {
      try {
        const r = await fn();
        if (success) toast(success);
        return r;
      } catch (err) {
        toast(err instanceof Error ? err.message : "Något gick fel.", "error");
        return undefined;
      }
    },
    [toast],
  );
}
