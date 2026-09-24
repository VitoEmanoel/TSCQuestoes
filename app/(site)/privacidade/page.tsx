import type { Metadata } from "next";
import { connection } from "next/server";

export const metadata: Metadata = {
  title: "Privacidade — TSCQuestões",
  description: "Quais dados o TSCQuestões guarda e para quê.",
};

const SECTIONS: { title: string; items: string[] }[] = [
  {
    title: "O que guardamos",
    items: [
      "Nome e e-mail da sua conta Google institucional, recebidos quando você entra com “Continuar com Google”. Não recebemos sua senha do Google nem acesso ao seu Gmail, Drive ou qualquer outro serviço.",
      "Suas respostas, simulados, notas e autoavaliações, para mostrar seu histórico e os temas em que você precisa estudar mais.",
      "Registros de tentativas de login, guardados de forma irreversível (hash), só para bloquear ataques de força bruta.",
    ],
  },
  {
    title: "Para que usamos",
    items: [
      "Apenas para o funcionamento do site: entrar na sua conta, corrigir questões e mostrar o seu desempenho.",
      "Não vendemos, não compartilhamos e não usamos seus dados para propaganda.",
      "Seus dados só aparecem para você. O administrador vê apenas o necessário para manter o banco de questões.",
    ],
  },
  {
    title: "Cookies",
    items: [
      "Usamos só os cookies necessários para manter você conectado e proteger os formulários. Não há cookies de publicidade nem de rastreamento.",
    ],
  },
  {
    title: "Onde ficam os dados",
    items: [
      "No servidor e no banco de dados da LES Web Services (les.cloud.deploy.uespi.br), com acesso por conexão segura (HTTPS).",
    ],
  },
  {
    title: "Seus direitos",
    items: [
      "Você pode pedir a qualquer momento a cópia ou a exclusão da sua conta e de todo o seu histórico, conforme a Lei Geral de Proteção de Dados (LGPD).",
    ],
  },
];

export default async function PrivacyPage() {
  await connection();
  const contact = process.env.PRIVACY_CONTACT_EMAIL?.trim();

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-4 py-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold text-zinc-900 dark:text-zinc-50">Privacidade</h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          O TSCQuestões é um banco de questões do ENADE de Análise e Desenvolvimento de Sistemas,
          feito para estudo. Esta página explica quais dados guardamos e por quê.
        </p>
      </header>
      {SECTIONS.map((section) => (
        <section key={section.title} className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{section.title}</h2>
          <ul className="flex list-disc flex-col gap-2 pl-5 text-zinc-700 dark:text-zinc-300">
            {section.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ))}
      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Contato</h2>
        <p className="text-zinc-700 dark:text-zinc-300">
          {contact ? (
            <>
              Para pedidos sobre seus dados ou dúvidas, escreva para{" "}
              <a
                href={`mailto:${contact}`}
                className="text-accent underline-offset-4 hover:underline"
              >
                {contact}
              </a>
              .
            </>
          ) : (
            "Para pedidos sobre seus dados ou dúvidas, fale com o administrador do site."
          )}
        </p>
      </section>
      <p className="text-sm text-zinc-500">
        Os enunciados das questões são das provas públicas do ENADE (INEP).
      </p>
    </main>
  );
}
