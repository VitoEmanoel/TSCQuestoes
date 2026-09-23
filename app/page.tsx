import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-xl flex-col items-center gap-4 px-8 text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">
          TSCQuestões
        </h1>
        <p className="text-lg leading-8 text-zinc-600 dark:text-zinc-400">
          Banco de questões do ENADE (Tecnologia em Análise e Desenvolvimento de Sistemas).
        </p>
        <Link
          href="/questoes"
          className="rounded-md bg-zinc-900 px-4 py-2 font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          Ver questões
        </Link>
      </main>
    </div>
  );
}
