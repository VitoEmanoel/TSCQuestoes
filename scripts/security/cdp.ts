import { execFileSync } from "node:child_process";
import WebSocket from "ws";

export function findChrome(): string {
  const candidates = [
    process.env.CHROME_PATH,
    "google-chrome-stable",
    "google-chrome",
    "chromium",
    "chromium-browser",
  ].filter((candidate): candidate is string => Boolean(candidate));
  for (const candidate of candidates) {
    try {
      return execFileSync("which", [candidate], { encoding: "utf-8" }).trim() || candidate;
    } catch {
      continue;
    }
  }
  throw new Error("Chrome/Chromium não encontrado. Defina CHROME_PATH.");
}

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class Page {
  private nextId = 1;
  private pending = new Map<number, (value: { result?: unknown; error?: unknown }) => void>();
  private listeners: ((method: string, params: Record<string, unknown>) => void)[] = [];

  constructor(private socket: WebSocket) {
    socket.on("message", (data) => {
      const message = JSON.parse(String(data));
      if (message.id && this.pending.has(message.id)) {
        this.pending.get(message.id)!(message);
        this.pending.delete(message.id);
      } else if (message.method) {
        for (const listener of this.listeners) listener(message.method, message.params);
      }
    });
  }

  send(method: string, params: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    const id = this.nextId++;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, (message) =>
        message.error
          ? reject(new Error(JSON.stringify(message.error)))
          : resolve(message.result as Record<string, unknown>),
      );
    });
  }

  on(listener: (method: string, params: Record<string, unknown>) => void) {
    this.listeners.push(listener);
  }

  async evaluate<T>(expression: string): Promise<T> {
    const reply = (await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    })) as { result: { value: T } };
    return reply.result.value;
  }

  async goto(url: string, settleMs = 1500) {
    await this.send("Page.navigate", { url });
    await this.waitFor("document.readyState === 'complete'");
    await sleep(settleMs);
  }

  async waitFor(expression: string, timeoutMs = 10_000): Promise<boolean> {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      if (await this.evaluate<boolean>(`Boolean(${expression})`).catch(() => false)) return true;
      await sleep(150);
    }
    return false;
  }
}

export async function openPage(debugPort: number): Promise<Page> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const target = await (
        await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, { method: "PUT" })
      ).json();
      const socket = new WebSocket(target.webSocketDebuggerUrl);
      await new Promise((resolve, reject) => {
        socket.once("open", resolve);
        socket.once("error", reject);
      });
      return new Page(socket);
    } catch {
      await sleep(200);
    }
  }
  throw new Error("Não consegui abrir o Chrome em modo de depuração.");
}
