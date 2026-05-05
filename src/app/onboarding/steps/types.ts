export type OnboardingStepProps = {
  selections: Record<string, string[]>;
  onSelect: (stepId: string, optionId: string, multiSelect?: boolean) => void;
  onNext: () => void;
  onBack: () => void;
  saving: boolean;
  direction: number;
};
