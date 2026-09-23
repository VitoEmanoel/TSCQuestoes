"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

function format(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(rest)}` : `${pad(minutes)}:${pad(rest)}`;
}

function announcement(seconds: number): string {
  if (seconds === 0) {
    return "Tempo esgotado. Entregando o simulado.";
  }
  if (seconds <= 60) {
    return "Falta 1 minuto.";
  }
  if (seconds <= 300) {
    return "Faltam 5 minutos.";
  }
  return "";
}

export function SimuladoTimer({ remainingSeconds }: { remainingSeconds: number }) {
  const router = useRouter();
  const [left, setLeft] = useState(remainingSeconds);
  const refreshed = useRef(false);

  useEffect(() => {
    refreshed.current = false;
    const endsAt = performance.now() + remainingSeconds * 1000;
    const tick = () => {
      const next = Math.max(0, Math.ceil((endsAt - performance.now()) / 1000));
      setLeft(next);
      if (next === 0 && !refreshed.current) {
        refreshed.current = true;
        window.setTimeout(() => router.refresh(), 800);
      }
    };
    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [remainingSeconds, router]);

  const tone =
    left <= 60
      ? "border-red-400 bg-red-50 text-red-900 dark:border-red-700 dark:bg-red-950 dark:text-red-200"
      : left <= 300
        ? "border-amber-400 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200"
        : "border-zinc-300 text-zinc-800 dark:border-zinc-700 dark:text-zinc-200";

  return (
    <div className={`flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm ${tone}`}>
      <span className="font-medium">Tempo restante</span>
      <span role="timer" aria-live="off" className="font-mono text-base font-semibold tabular-nums">
        {format(left)}
      </span>
      <span className="sr-only" aria-live="polite">
        {announcement(left)}
      </span>
    </div>
  );
}
