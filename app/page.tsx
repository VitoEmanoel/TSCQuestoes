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
      </main>
    </div>
  );
}
