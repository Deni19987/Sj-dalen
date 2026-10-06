import { Button } from "../components/Button";

export function NotFoundPage() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center px-4 text-center">
      <p className="font-display text-6xl font-extrabold text-blue-500">404</p>
      <h1 className="mt-3 font-display text-2xl font-extrabold uppercase tracking-tight text-graphite-900">
        Sidan hittades inte
      </h1>
      <p className="mt-2 text-graphite-500">Länken kan vara felaktig eller så har sidan flyttats.</p>
      <Button to="/" className="mt-6">
        Till startsidan
      </Button>
    </div>
  );
}
