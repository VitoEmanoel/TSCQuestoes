const PARTICLES = new Set(["de", "da", "do", "das", "dos", "e", "di", "du"]);

function capitalize(word: string): string {
  return word
    .split("-")
    .map((part) => (part ? part.charAt(0).toLocaleUpperCase("pt-BR") + part.slice(1) : part))
    .join("-");
}

export function displayName(name: string | null | undefined): string | null {
  const trimmed = name?.trim().replace(/\s+/g, " ") ?? "";
  if (trimmed === "") {
    return null;
  }
  const hasLetters = /\p{L}/u.test(trimmed);
  const shouting = hasLetters && trimmed === trimmed.toLocaleUpperCase("pt-BR");
  if (!shouting) {
    return trimmed;
  }
  return trimmed
    .toLocaleLowerCase("pt-BR")
    .split(" ")
    .map((word, index) => (index > 0 && PARTICLES.has(word) ? word : capitalize(word)))
    .join(" ");
}

export function firstName(name: string | null | undefined): string | null {
  return displayName(name)?.split(" ")[0] ?? null;
}
