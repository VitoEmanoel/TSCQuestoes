import Link from "next/link";

export function AuthCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <main className="flex flex-1 justify-center px-4 py-14 sm:items-center sm:py-20">
      <div className="w-full max-w-sm">
        <h1 className="text-3xl font-semibold text-zinc-900 dark:text-zinc-50">{title}</h1>
        {subtitle ? <p className="mt-2 text-zinc-600 dark:text-zinc-400">{subtitle}</p> : null}
        <div className="mt-8">{children}</div>
        <p className="mt-8 text-xs text-zinc-500">
          Ao entrar, você concorda com a nossa{" "}
          <Link href="/privacidade" className="tap underline underline-offset-4">
            política de privacidade
          </Link>
          .
        </p>
      </div>
    </main>
  );
}

export function AdminAuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex flex-1 items-center justify-center bg-zinc-900 px-4 py-16 text-zinc-100">
      <div className="w-full max-w-sm">
        <p className="font-mono text-xs tracking-widest text-zinc-400 uppercase">
          Área administrativa
        </p>
        <h1 className="mt-3 text-3xl font-semibold text-zinc-50">Entrar no painel</h1>
        <p className="mt-2 text-sm text-zinc-400">
          Acesso restrito à equipe que mantém o banco de questões.
        </p>
        <div className="mt-8">{children}</div>
        <Link href="/" className="tap mt-10 text-sm text-zinc-400 hover:text-zinc-200">
          ← Voltar ao site
        </Link>
      </div>
    </main>
  );
}
