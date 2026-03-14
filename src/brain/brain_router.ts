import type {
  BrainResult,
  HindbrainInterface,
  HindbrainOnboardingInput,
  HomeostasisInput,
  ReflectionInput,
  CuriosityCalibrationInput,
  MutationSuggestionInput,
  SleepSummaryInput,
  ReasoningOutput,
} from "./hindbrain_interface.js";
import {
  type ForebrainInterface,
  type PlanningInput,
  type ReasoningInput,
  type SynthesisInput,
  buildHindbrainFallbackInput,
} from "./forebrain_interface.js";

export interface BrainRouter {
  handleOnboarding(input: HindbrainOnboardingInput): Promise<BrainResult<unknown>>;
  handleHomeostasis(input: HomeostasisInput): Promise<BrainResult<unknown>>;
  handleReflection(input: ReflectionInput): Promise<BrainResult<unknown>>;
  handleCuriosityCalibration(input: CuriosityCalibrationInput): Promise<BrainResult<unknown>>;
  handleMutationSuggestion(input: MutationSuggestionInput): Promise<BrainResult<unknown>>;
  handleSleepSummary(input: SleepSummaryInput): Promise<BrainResult<unknown>>;
  handlePlanning(input: PlanningInput): Promise<BrainResult<ReasoningOutput>>;
  handleToolReasoning(input: ReasoningInput): Promise<BrainResult<ReasoningOutput>>;
  handleSynthesis(input: SynthesisInput): Promise<BrainResult<ReasoningOutput>>;
}

async function forebrainAvailable(forebrain?: ForebrainInterface): Promise<boolean> {
  if (!forebrain) return false;
  try {
    return await forebrain.isAvailable();
  } catch {
    return false;
  }
}

async function withForebrainFallback(
  forebrain: ForebrainInterface | undefined,
  hindbrain: HindbrainInterface,
  handler: () => Promise<BrainResult<ReasoningOutput>>,
  fallbackInput: PlanningInput | ReasoningInput | SynthesisInput,
): Promise<BrainResult<ReasoningOutput>> {
  if (forebrain && (await forebrainAvailable(forebrain))) {
    const result = await handler();
    if (result.ok) return result;
  }
  const fallback = await hindbrain.fallbackReasoning(buildHindbrainFallbackInput(fallbackInput));
  return {
    ...fallback,
    source: "hindbrain",
    fallback: true,
  };
}

export function createBrainRouter(params: {
  hindbrain: HindbrainInterface;
  forebrain?: ForebrainInterface;
}): BrainRouter {
  const { hindbrain, forebrain } = params;

  return {
    handleOnboarding(input: HindbrainOnboardingInput) {
      return hindbrain.onboardIdentity(input);
    },
    handleHomeostasis(input: HomeostasisInput) {
      return hindbrain.decideHomeostasis(input);
    },
    handleReflection(input: ReflectionInput) {
      return hindbrain.reflect(input);
    },
    handleCuriosityCalibration(input: CuriosityCalibrationInput) {
      return hindbrain.calibrateCuriosity(input);
    },
    handleMutationSuggestion(input: MutationSuggestionInput) {
      return hindbrain.suggestMutation(input);
    },
    handleSleepSummary(input: SleepSummaryInput) {
      return hindbrain.summarizeForSleep(input);
    },
    handlePlanning(input: PlanningInput) {
      return withForebrainFallback(
        forebrain,
        hindbrain,
        () => forebrain!.plan(input),
        input,
      );
    },
    handleToolReasoning(input: ReasoningInput) {
      return withForebrainFallback(
        forebrain,
        hindbrain,
        () => forebrain!.reason(input),
        input,
      );
    },
    handleSynthesis(input: SynthesisInput) {
      return withForebrainFallback(
        forebrain,
        hindbrain,
        () => forebrain!.synthesize(input),
        input,
      );
    },
  };
}
