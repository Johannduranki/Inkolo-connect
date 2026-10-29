export function currentLanguage(): string;
export function translate(text: string): string;
export function onLanguageChange(fn: () => void): () => void;
export function languageSession(token: string | null,url?: string): Promise<void>;
export function chooseLanguage(language: string): Promise<void>;
export function resetLanguage(): void;
