import type { Metadata } from "next";
import Link from "next/link";
import { ImportExamForm } from "@/components/import-exam-form";
import { DEFAULT_COURSE } from "@/lib/admin-import";
import { requireAdmin } from "@/lib/dal";
import { IMPORT_LIMITS } from "@/lib/exam-import";
import { backLink } from "@/components/ui";

export const metadata: Metadata = { title: "Cadastrar prova — Painel" };

export default async function NewExamPage() {
  await requireAdmin();
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8">
      <Link href="/admin" className={backLink}>
        ← Voltar ao painel
      </Link>
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold text-zinc-900 dark:text-zinc-50">
          Cadastrar prova nova
        </h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          Cole o texto da prova e o do gabarito. O sistema separa as questões e mostra uma prévia;
          nada é gravado até você confirmar. Tudo entra como rascunho para você revisar e publicar.
        </p>
      </header>
      <ImportExamForm
        defaultCourse={DEFAULT_COURSE}
        limits={{
          prova: IMPORT_LIMITS.prova,
          gabarito: IMPORT_LIMITS.gabarito,
          padrao: IMPORT_LIMITS.padrao,
        }}
      />
    </main>
  );
}
