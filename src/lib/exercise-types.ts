export type QuestionType = "choice" | "numeric" | "text";
export type MistakeCategory =
  | "formula"
  | "debit/credit"
  | "denominator"
  | "sign"
  | "calculation"
  | "concept"
  | "answer";
export interface ExpectedAnswer {
  value?: number;
  tolerance?: number;
  aliases?: string[];
}
export interface Generation {
  template:
    | "mean"
    | "variance"
    | "probability"
    | "linear"
    | "equity"
    | "elasticity"
    | "cloze";
  quote: string;
  answerText: string;
  variant: number;
  wrongValues?: {
    value: number;
    category: MistakeCategory;
    feedback: string;
  }[];
}
export interface QuestionSource {
  label: string;
  resourceId: string;
}
export interface ManualQuestionInput {
  id?: string;
  lessonId: string;
  resourceId?: string;
  type: QuestionType;
  difficulty: number;
  topic: string;
  prompt: string;
  options: string[];
  answer: number;
  expected: ExpectedAnswer;
  explanation: string;
  mistake: string;
}
