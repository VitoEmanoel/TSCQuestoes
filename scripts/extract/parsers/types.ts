export type QuestionTypeDraft = "OBJECTIVE" | "DISCURSIVE";
export type QuestionAreaDraft = "FORMACAO_GERAL" | "COMPONENTE_ESPECIFICO";
export type QuestionStatusDraft = "VALID" | "ANULADA";

export type AssetDraft = {
  kind: string;
  filePath: string;
  caption: string | null;
};

export type OptionDraft = {
  letter: string;
  textMd: string;
  isCorrect: boolean;
};

export type AnswerStandardDraft = {
  subItem: string | null;
  criteriaMd: string;
  maxScore: number | null;
  assets: AssetDraft[];
};

export type QuestionDraft = {
  examYear: number;
  originalLabel: string;
  order: number;
  type: QuestionTypeDraft;
  area: QuestionAreaDraft;
  status: QuestionStatusDraft;
  statementMd: string;
  valuePoints: number | null;
  sourcePage: number | null;
  needsAsset: boolean;
  assets: AssetDraft[];
  options: OptionDraft[];
  answerStandards: AnswerStandardDraft[];
  tags: string[];
  reviewNotes: string[];
};
