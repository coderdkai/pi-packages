import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type {
  PermissionPromptDecision,
  RequestPermissionOptions,
} from "#src/authority/permission-dialog";
import type {
  PermissionPromptUi,
  PromptPreferences,
  requestPermissionDecision,
} from "#src/authority/permission-prompt-component";
import { buildForwardedScopeLabels } from "#src/pattern-suggest";
import {
  emitUiPromptEvent,
  type PermissionEventBus,
} from "#src/permission-events";
import { buildUiPrompt } from "#src/permission-ui-prompt";
import type { PersistApprovalOptions, TerminalAuthorizer } from "./authorizer";
import type { PromptPermissionDetails } from "./permission-prompter";

/** Dependencies required by {@link LocalUserAuthorizer}. */
export interface LocalUserAuthorizerDeps {
  /** The active session's UI surface (select/input plus the inline `custom` dialog). */
  ui: PermissionPromptUi;
  /** The session run mode; the dispatcher renders the inline dialog only in `"tui"`. */
  mode: ExtensionContext["mode"];
  /** Event bus used for the `permissions:ui_prompt` broadcast. */
  events: PermissionEventBus;
  /** Read live at prompt time so a settings-modal toggle takes effect on the next prompt. */
  getPromptPreferences: () => PromptPreferences;
  /** Injected for testability; production callers pass the real function. */
  requestPermissionDecision: typeof requestPermissionDecision;
  /** Persist a persistent allow rule and reload; see {@link PersistApprovalOptions}. */
  persistApproval: (opts: PersistApprovalOptions) => void;
  /** The current working directory, for a project-scoped persistent grant. */
  cwd: string | undefined;
  /** Whether the active project is trusted (gates project-scope writes). */
  isProjectTrusted: () => boolean;
}

/**
 * Authorizer for a session with an active UI: prompt the human here.
 *
 * Emits the `permissions:ui_prompt` broadcast (moved here from
 * `PermissionPrompter`'s `ctx.hasUI` arm) before showing the dialog, so
 * observers know a decision is imminent. This is the single emit site: a
 * forwarded ask carries its provenance on `details.forwarding`, which this
 * class renders (populated `forwarding` context + "(Subagent)" title) so the
 * broadcast stays non-degraded (#292) without a second emission path.
 */
export class LocalUserAuthorizer implements TerminalAuthorizer {
  constructor(private readonly deps: LocalUserAuthorizerDeps) {}

  async authorize(
    details: PromptPermissionDetails,
  ): Promise<PermissionPromptDecision> {
    const uiPrompt = buildUiPrompt(details);
    emitUiPromptEvent(this.deps.events, uiPrompt);
    const decision = await this.deps.requestPermissionDecision(
      {
        mode: this.deps.mode,
        ui: this.deps.ui,
        ...this.deps.getPromptPreferences(),
      },
      details.forwarding
        ? "Permission Required (Subagent)"
        : "Permission Required",
      details.payload,
      buildRequestOptions(details),
    );
    this.persistIfRequested(details, decision);
    return decision;
  }

  /**
   * When the operator chose a persistent allow (`p` / `u`), write the rule to
   * the matching config scope so the decision "sticks". The orchestration
   * (write + reload + degraded warning) is injected; it never changes the
   * decision the gate sees — a persistent grant already renders as `allow`
   * (and, on a fresh write with a future reload, governs future asks).
   */
  private persistIfRequested(
    details: PromptPermissionDetails,
    decision: PermissionPromptDecision,
  ): void {
    if (
      decision.state !== "approved_for_project" &&
      decision.state !== "approved_for_global"
    ) {
      return;
    }
    const surface = details.payload.request.surface;
    const pattern = decision.persistPattern ?? "*";
    const scope =
      decision.state === "approved_for_project" ? "project" : "global";
    this.deps.persistApproval({
      scope,
      surface,
      pattern,
      cwd: this.deps.cwd,
      projectTrusted: this.deps.isProjectTrusted(),
    });
  }
}

/**
 * A forwarded ask carrying a session-approval suggestion offers the scope
 * choice (subagent vs whole session); any other ask keeps its single
 * "for this session" option (custom label when the gate supplied one).
 */
function buildRequestOptions(
  details: PromptPermissionDetails,
): RequestPermissionOptions | undefined {
  const pattern = details.sessionApproval?.patterns[0];
  if (details.forwarding && details.sessionApproval && pattern) {
    return {
      sessionScope: buildForwardedScopeLabels(
        details.forwarding.requesterAgentName,
        details.sessionApproval.surface,
        pattern,
      ),
    };
  }
  return details.sessionLabel
    ? { sessionLabel: details.sessionLabel }
    : undefined;
}
