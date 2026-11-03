export const root: string;
export const origin: 'http://127.0.0.1:4240';
export type ClosedSelection = {
  profile: 'desktop' | 'portrait' | 'landscape';
  flow: 'normal' | 'errors-back-normal' | 'unknown-recover';
  lang: 'fr'; browserName: 'chromium' | 'webkit';
  width: number; height: number; mobile: boolean; path: string;
  output: string; provenance: string; pins: Record<string, string>;
};
export const tuples: Record<ClosedSelection['profile'], Omit<ClosedSelection, 'profile' | 'output' | 'provenance' | 'pins'>>;
export function selection(): ClosedSelection;
