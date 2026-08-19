import type {
  RequestPermissionOptions,
  UnattributedDecision,
} from "#src/authority/permission-dialog";

/**
 * Pure decision model for the inline keybind permission dialog.
 *
 * The interaction logic — which hotkey produces which decision, double-press
 * arming, step transitions, and persistent-allow scope selection — lives here
 * with no SDK or TUI imports, so it is unit-testable directly. The
 * `ctx.ui.custom` component
 * ({@link file://./permission-prompt-component.ts}) is a thin adapter that
 * forwards keystrokes to {@link reducePrompt} and renders the returned state.
 *
 * Option set:
 *   y  approve once
 *   s  approve for this session
 *   n  deny
 *   p  allow persistently in this project   (writes a project config rule)
 *   u  allow persistently for this user     (writes a global config rule)
 *
 * The persistent options (`p`/`u`) optionally open a `"range"` step when the
 * ask offers layered scope candidates (a bash command expands to
 * `git reset HEAD` / `git reset *` / `git *`) so the operator decides how
 * much of the command to allow — narrowest grant first. The committed
 * decision carries the chosen pattern; the authorizer writes it to the
 * matching config scope.
 */

/** The five decision hotkeys, in display order. */
export type PromptKey = "y" | "s" | "n" | "p" | "u";

/** Which sub-view the dialog is showing. */
export type PromptStep = "decision" | "scope" | "range";

const OPTION_ORDER: readonly PromptKey[] = ["y", "s", "n", "p", "u"];

const OPTION_VERBS: Record<PromptKey, string> = {
  y: "approve",
  s: "approve for this session",
  n: "deny",
  p: "allow persistently in this project",
  u: "allow persistently for you",
};

/**
 * Static configuration for a single prompt presentation.
 */
export interface PromptModelConfig {
  /** When true, a letter hotkey arms first and commits only on a second press. */
  doublePressToConfirm: boolean;
  /** Label shown beside the approve-for-session option. */
  sessionLabel: string;
  /**
   * Forwarded asks only: when set, confirming `s` opens a second step choosing
   * whether the grant applies to the requesting subagent only (least-privilege
   * default) or the whole serving session.
   */
  sessionScope?: NonNullable<RequestPermissionOptions["sessionScope"]>;
  /**
   * Layered allow-scope candidates shown when `p`/`u` is confirmed, narrowest
   * first. A bash ask expands its command (`git reset HEAD` →
   * `git reset HEAD` / `git reset *` / `git *`). Absent (or single) for an ask
   * with no range choice — a single candidate commits directly.
   */
  persistCandidates?: readonly PersistentCandidate[];
}

/** One selectable persistent-allow scope. */
export interface PersistentCandidate {
  /** The pattern to persist as the allow rule. */
  readonly pattern: string;
  /** Human-readable label for this scope. */
  readonly text: string;
}

/** The re-render view state the component draws from. */
export interface PromptViewState {
  step: PromptStep;
  highlightedKey: PromptKey;
  highlightedRange: number;
  /** Set only while awaiting the confirming second press of a hotkey. */
  armedKey?: PromptKey;
  /** "Press y again to approve." while armed; empty otherwise. */
  hint: string;
  /** Scope step: false = subagent-only (default), true = whole serving session. */
  scopeServing: boolean;
}

/** An input event the reducer understands. */
export type PromptEvent =
  | { type: "nav"; direction: "up" | "down" }
  | { type: "hotkey"; key: PromptKey }
  | { type: "confirm" }
  | { type: "cancel" };

/** Either a re-render or a terminal decision. */
export type PromptOutcome =
  | { kind: "render"; state: PromptViewState }
  | { kind: "decision"; decision: UnattributedDecision };

export function initialPromptState(
  _config: PromptModelConfig,
): PromptViewState {
  return {
    step: "decision",
    highlightedKey: "y",
    highlightedRange: 0,
    armedKey: undefined,
    hint: "",
    scopeServing: false,
  };
}

/**
 * Advance the dialog by one input event, returning either the next view state
 * to render or the committed {@link UnattributedDecision}.
 *
 * The model states the outcome and not the decider: which human surface this
 * is gets attributed by the dispatcher that chose to render this dialog, so
 * the two cannot disagree about the surface.
 */
export function reducePrompt(
  config: PromptModelConfig,
  state: PromptViewState,
  event: PromptEvent,
): PromptOutcome {
  switch (state.step) {
    case "decision":
      return reduceDecisionStep(config, state, event);
    case "scope":
      return reduceScopeStep(state, event);
    case "range":
      return reduceRangeStep(config, state, event);
  }
}

function reduceDecisionStep(
  config: PromptModelConfig,
  state: PromptViewState,
  event: PromptEvent,
): PromptOutcome {
  switch (event.type) {
    case "nav":
      return render({
        ...state,
        highlightedKey: shiftKey(state.highlightedKey, event.direction),
        armedKey: undefined,
        hint: "",
      });
    case "hotkey":
      return pressHotkey(config, state, event.key);
    case "confirm":
      return commit(config, state, state.highlightedKey);
    case "cancel":
      return { kind: "decision", decision: deny() };
  }
}

function pressHotkey(
  config: PromptModelConfig,
  state: PromptViewState,
  key: PromptKey,
): PromptOutcome {
  if (!config.doublePressToConfirm || state.armedKey === key) {
    return commit(config, state, key);
  }
  return render({
    ...state,
    highlightedKey: key,
    armedKey: key,
    hint: `Press ${key} again to ${OPTION_VERBS[key]}.`,
  });
}

function commit(
  config: PromptModelConfig,
  state: PromptViewState,
  key: PromptKey,
): PromptOutcome {
  switch (key) {
    case "y":
      return {
        kind: "decision",
        decision: { approved: true, state: "approved" },
      };
    case "n":
      return { kind: "decision", decision: deny() };
    case "s":
      if (config.sessionScope) {
        return render({
          ...state,
          step: "scope",
          highlightedKey: "s",
          armedKey: undefined,
          hint: "",
          scopeServing: false,
        });
      }
      return {
        kind: "decision",
        decision: { approved: true, state: "approved_for_session" },
      };
    case "p":
    case "u": {
      const scope = key === "p" ? "project" : "global";
      const candidates = config.persistCandidates;
      if (candidates && candidates.length > 1) {
        return render({
          ...state,
          step: "range",
          highlightedKey: key,
          highlightedRange: 0,
          armedKey: undefined,
          hint: "",
        });
      }
      const pattern = candidates?.length === 1 ? candidates[0].pattern : "*";
      return {
        kind: "decision",
        decision: persistentDecision(scope, pattern),
      };
    }
  }
}

function reduceScopeStep(
  state: PromptViewState,
  event: PromptEvent,
): PromptOutcome {
  switch (event.type) {
    case "nav":
      return render({ ...state, scopeServing: event.direction === "down" });
    case "confirm":
      return {
        kind: "decision",
        decision: {
          approved: true,
          state: state.scopeServing
            ? "approved_for_serving_session"
            : "approved_for_session",
        },
      };
    case "cancel":
      return render({
        ...state,
        step: "decision",
        armedKey: undefined,
        hint: "",
      });
    default:
      return render(state);
  }
}

function reduceRangeStep(
  config: PromptModelConfig,
  state: PromptViewState,
  event: PromptEvent,
): PromptOutcome {
  const candidates = config.persistCandidates ?? [];
  switch (event.type) {
    case "nav": {
      const delta = event.direction === "down" ? 1 : -1;
      const max = Math.max(0, candidates.length - 1);
      const next =
        max === 0 ? 0 : (state.highlightedRange + delta + max + 1) % (max + 1);
      return render({ ...state, highlightedRange: next });
    }
    case "confirm": {
      const scope: "project" | "global" =
        state.highlightedKey === "p" ? "project" : "global";
      const pattern = candidates[state.highlightedRange]?.pattern ?? "*";
      return {
        kind: "decision",
        decision: persistentDecision(scope, pattern),
      };
    }
    case "cancel":
      return render({
        ...state,
        step: "decision",
        armedKey: undefined,
        hint: "",
      });
    default:
      return render(state);
  }
}

function persistentDecision(
  scope: "project" | "global",
  pattern: string,
): UnattributedDecision {
  return {
    approved: true,
    state: scope === "project" ? "approved_for_project" : "approved_for_global",
    persistPattern: pattern,
  };
}

function deny(): UnattributedDecision {
  return { approved: false, state: "denied" };
}

function shiftKey(current: PromptKey, direction: "up" | "down"): PromptKey {
  const index = OPTION_ORDER.indexOf(current);
  const delta = direction === "down" ? 1 : -1;
  const next = (index + delta + OPTION_ORDER.length) % OPTION_ORDER.length;
  return OPTION_ORDER[next] ?? current;
}

function render(state: PromptViewState): PromptOutcome {
  return { kind: "render", state };
}
