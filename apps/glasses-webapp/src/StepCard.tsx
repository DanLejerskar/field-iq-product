import type { CardState, HudState } from './types.js';

interface Props {
  state: HudState;
  elapsed: string;
  onVerify: () => void;
}

function bottom(state: HudState, onVerify: () => void) {
  switch (state.cardState) {
    case 'pending':
      return (
        <button class="hud__verify" onClick={onVerify}>
          ● VERIFY
        </button>
      );
    case 'processing':
      return (
        <div class="hud__banner">
          <span class="hud__spinner" /> Claude is reviewing your photo…
        </div>
      );
    case 'verified':
      return (
        <div class="hud__banner hud__banner--verified">
          ✅ Step {state.currentStep} verified — pinch to continue
        </div>
      );
    case 'retry':
      return (
        <div class="hud__banner hud__banner--retry">
          ⚠️ {state.message ?? 'Please retake the photo'}
        </div>
      );
    case 'error':
      return (
        <div class="hud__banner hud__banner--error">
          ❌ {state.message ?? 'Verification failed — call trainer'}
        </div>
      );
    case 'complete':
      return (
        <div class="hud__banner hud__banner--verified">
          🏁 Procedure complete — {state.totalSteps}/{state.totalSteps} verified
        </div>
      );
    case 'paused':
      return <div class="hud__banner hud__banner--paused">⏸ Session paused — reconnecting…</div>;
  }
}

export function StepCard({ state, elapsed, onVerify }: Props) {
  const step = state.steps.find((s) => s.stepNumber === state.currentStep);
  if (state.showingReference && step?.referenceImageUrl) {
    return (
      <section class={`hud hud--${state.cardState as CardState}`}>
        <div class="hud__reference">
          <img src={step.referenceImageUrl} alt={`Reference for step ${step.stepNumber}`} />
        </div>
        <div class="hud__edge" />
      </section>
    );
  }

  return (
    <section class={`hud hud--${state.cardState as CardState}`}>
      <header class="hud__topbar">
        <div class="hud__step-strip">
          STEP {state.currentStep ?? '-'} OF {state.totalSteps}
        </div>
        <div>⏱ {elapsed}</div>
      </header>

      <div class="hud__body">
        <h1 class="hud__title">{step?.title ?? 'Tap to scan equipment'}</h1>
        {step ? <p class="hud__instruction">{step.instruction}</p> : null}
        {step?.referenceImageUrl ? <div class="hud__hint">← swipe to view reference</div> : null}
      </div>

      <div class="hud__bottom">{bottom(state, onVerify)}</div>
      <div class="hud__edge" />
    </section>
  );
}
