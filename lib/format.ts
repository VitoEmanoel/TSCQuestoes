export const TIME_ZONE = "America/Sao_Paulo";

export function formatScore(value: number, maximumFractionDigits = 2): string {
  return value.toLocaleString("pt-BR", { maximumFractionDigits });
}

export function formatDateTime(date: Date): string {
  return date.toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: TIME_ZONE,
  });
}

export function formatDate(date: Date): string {
  return date.toLocaleDateString("pt-BR", { timeZone: TIME_ZONE });
}

export function formatDayMonth(date: Date | null): string {
  return date
    ? date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: TIME_ZONE })
    : "";
}

export function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}
