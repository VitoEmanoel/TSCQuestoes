export const CONTENT_FORMAT = 1;
export const CONTENT_FILE = "conteudo.json";
export const UPLOADS_DIR = "uploads";
export const UPLOAD_PREFIX = "uploads/";
export const UPLOAD_NAME = /^[a-f0-9]{24}\.(png|jpg)$/;

export type ContentBundle = {
  formato: number;
  geradoEm: string;
  exams: Record<string, unknown>[];
  topics: Record<string, unknown>[];
  questions: Record<string, unknown>[];
  options: Record<string, unknown>[];
  standards: Record<string, unknown>[];
  assets: Record<string, unknown>[];
  tags: Record<string, unknown>[];
  uploads: string[];
};

export function uploadFileOf(filePath: unknown): string | null {
  if (typeof filePath !== "string" || !filePath.startsWith(UPLOAD_PREFIX)) {
    return null;
  }
  const name = filePath.slice(UPLOAD_PREFIX.length);
  return UPLOAD_NAME.test(name) ? name : null;
}
