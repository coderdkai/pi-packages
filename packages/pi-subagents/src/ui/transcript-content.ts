/**
 * transcript-content.ts — the rows the `/subagents:sessions` overlay paints.
 *
 * Owns the transcript's content model: the `SessionMessage` → Pi-component
 * mapping (mirroring Pi's own interactive-mode `renderSessionContext`), and the
 * rendered rows those components produce at a given width. The overlay
 * (`session-navigator.ts`) owns scroll state, chrome, and key handling, and
 * asks this collaborator only for rows — it never reaches into the components.
 *
 * Lives in the SDK/TUI layer rather than the pure `session-navigation.ts` core
 * because Pi's per-entry components require a `TUI`, `cwd`, and markdown theme.
 */

import {
  AssistantMessageComponent,
  BashExecutionComponent,
  BranchSummaryMessageComponent,
  CompactionSummaryMessageComponent,
  parseSkillBlock,
  SkillInvocationMessageComponent,
  ToolExecutionComponent,
  UserMessageComponent,
} from "@earendil-works/pi-coding-agent";
import { Container, type MarkdownTheme, Spacer, type TUI, truncateToWidth } from "@earendil-works/pi-tui";
import type { AgentSessionEvent, SessionMessage } from "#src/types";
import { describeActivity } from "#src/ui/display";
import { GLYPHS } from "#src/ui/glyphs";
import type { TranscriptSource } from "#src/ui/session-navigation";

// ─────────────────────────────────────────────────────────────────────────────

/** The SDK/TUI environment Pi's per-entry components need, plus the transcript's source. */
export interface TranscriptContentOptions {
  tui: TUI;
  cwd: string;
  markdownTheme: MarkdownTheme;
  source: TranscriptSource;
}

/**
 * The transcript's renderable rows: settled history rendered through Pi's
 * per-entry components, followed by the running agent's activity row.
 *
 * Settled rows are rendered once per width and cached, so a paint or a scroll
 * costs a slice rather than a walk of the whole component tree. The activity
 * row is recomputed per call — it is two rows, and it tracks live state the
 * source updates without a rebuild.
 *
 * The message currently being streamed is held as its own component, updated
 * per delta exactly as Pi's interactive mode does, so a token never touches
 * settled history. The two provably cannot overlap: the agent core keeps the
 * in-flight message outside its message array until it settles.
 */
export class TranscriptContent {
  private readonly options: TranscriptContentOptions;
  private container: Container;
  /** Width `settledRows` was rendered at. */
  private settledWidth: number | undefined;
  /** Settled rows at `settledWidth`, or undefined when the cache is cold. */
  private settledRows: readonly string[] | undefined;
  /** The message being streamed right now, rendered below settled history. */
  private inFlight: AssistantMessageComponent | undefined;
  /** Width `inFlightRows` was rendered at. */
  private inFlightWidth: number | undefined;
  private inFlightRows: readonly string[] | undefined;

  constructor(options: TranscriptContentOptions) {
    this.options = options;
    this.container = this.build();
  }

  /** Total content rows at `width`: settled history plus the live tail. */
  lineCount(width: number): number {
    if (width <= 0) return 0;
    return this.settled(width).length + this.tail(width).length;
  }

  /** Rows `[start, start + count)` at `width`, clamped to what exists. */
  slice(width: number, start: number, count: number): string[] {
    if (width <= 0) return [];
    const settled = this.settled(width);
    const end = start + count;
    const rows = settled.slice(start, Math.min(end, settled.length));
    if (end > settled.length) {
      const tail = this.tail(width);
      rows.push(...tail.slice(Math.max(0, start - settled.length), end - settled.length));
    }
    return rows;
  }

  /**
   * Route one session event. A delta on the in-flight message updates only that
   * component; anything else takes up the source's current message history,
   * which by then already contains every message that has settled.
   */
  apply(event?: AgentSessionEvent): void {
    const partial = inFlightAssistantMessage(event);
    if (partial) {
      this.updateInFlight(partial);
      return;
    }
    this.rebuild();
  }

  /** Drop cached rendering held by the mounted components and by this object. */
  invalidate(): void {
    this.container.invalidate();
    this.settledRows = undefined;
    this.inFlight?.invalidate();
    this.inFlightRows = undefined;
  }

  // ---- Private ----

  /** Settled rows at `width`, rendered once per width/content generation. */
  private settled(width: number): readonly string[] {
    if (this.settledWidth !== width) {
      this.settledWidth = width;
      this.settledRows = undefined;
    }
    this.settledRows ??= this.container.render(width).map((row) => truncateToWidth(row, width));
    return this.settledRows;
  }

  /** Rows below settled history: the in-flight message, then the activity row. */
  private tail(width: number): readonly string[] {
    const rows = [...this.inFlightRendered(width)];
    const streaming = this.options.source.streaming();
    if (streaming) {
      const activity = `${GLYPHS.streaming} ${describeActivity(streaming.activeTools, streaming.responseText)}`;
      rows.push("", truncateToWidth(activity, width));
    }
    return rows;
  }

  /** The in-flight message's rows, re-rendered independently of settled history. */
  private inFlightRendered(width: number): readonly string[] {
    if (!this.inFlight) return [];
    if (this.inFlightWidth !== width) {
      this.inFlightWidth = width;
      this.inFlightRows = undefined;
    }
    this.inFlightRows ??= this.inFlight.render(width).map((row) => truncateToWidth(row, width));
    return this.inFlightRows;
  }

  private updateInFlight(message: AssistantSessionMessage): void {
    if (this.inFlight) this.inFlight.updateContent(message);
    else this.inFlight = new AssistantMessageComponent(message, false, this.options.markdownTheme);
    this.inFlightRows = undefined;
  }

  private rebuild(): void {
    this.container = this.build();
    this.settledRows = undefined;
    this.inFlight = undefined;
    this.inFlightRows = undefined;
  }

  private build(): Container {
    const container = new Container();
    const pendingTools = new Map<string, ToolExecutionComponent>();
    for (const message of this.options.source.getMessages()) {
      addMessageComponents(container, message, pendingTools, this.options);
    }
    return container;
  }
}

/** The assistant variant of a session message, as Pi's components consume it. */
type AssistantSessionMessage = Extract<SessionMessage, { role: "assistant" }>;

/**
 * The in-flight assistant message a partial event carries, or undefined when the
 * event is anything else. A partial for another role means a message settled
 * elsewhere in the history, which only a rebuild can pick up.
 */
function inFlightAssistantMessage(event?: AgentSessionEvent): AssistantSessionMessage | undefined {
  if (event?.type !== "message_start" && event?.type !== "message_update") return undefined;
  return event.message.role === "assistant" ? event.message : undefined;
}

/**
 * Map one message onto Pi's per-entry components, mirroring Pi's own
 * interactive-mode `renderSessionContext` mapping. Tool results are matched to
 * their tool-call components by id, exactly as Pi does. `custom`-role messages
 * are skipped — rendering them needs the child session's message-renderer
 * registry, which the navigator does not hold.
 */
function addMessageComponents(
  container: Container,
  message: SessionMessage,
  pendingTools: Map<string, ToolExecutionComponent>,
  opts: TranscriptContentOptions,
): void {
  switch (message.role) {
    case "assistant": {
      container.addChild(new AssistantMessageComponent(message, false, opts.markdownTheme));
      for (const content of message.content) {
        if (content.type !== "toolCall") continue;
        const tool = new ToolExecutionComponent(
          content.name,
          content.id,
          content.arguments,
          { showImages: false },
          opts.source.getToolDefinition(content.name),
          opts.tui,
          opts.cwd,
        );
        tool.setExpanded(true);
        container.addChild(tool);
        pendingTools.set(content.id, tool);
      }
      break;
    }
    case "toolResult": {
      pendingTools.get(message.toolCallId)?.updateResult(message);
      pendingTools.delete(message.toolCallId);
      break;
    }
    case "user": {
      addUserComponents(container, message.content, opts.markdownTheme);
      break;
    }
    case "bashExecution": {
      const bash = new BashExecutionComponent(message.command, opts.tui, message.excludeFromContext);
      if (message.output) bash.appendOutput(message.output);
      bash.setComplete(message.exitCode, message.cancelled, undefined, message.fullOutputPath);
      container.addChild(bash);
      break;
    }
    case "compactionSummary": {
      container.addChild(new Spacer(1));
      const summary = new CompactionSummaryMessageComponent(message, opts.markdownTheme);
      summary.setExpanded(true);
      container.addChild(summary);
      break;
    }
    case "branchSummary": {
      container.addChild(new Spacer(1));
      const summary = new BranchSummaryMessageComponent(message, opts.markdownTheme);
      summary.setExpanded(true);
      container.addChild(summary);
      break;
    }
  }
}

/** Render a user message (skill block + text) into the container, mirroring Pi. */
function addUserComponents(
  container: Container,
  content: string | readonly { type: string; text?: string }[],
  markdownTheme: MarkdownTheme,
): void {
  const text = userMessageText(content);
  if (!text) return;
  if (container.children.length > 0) container.addChild(new Spacer(1));

  const skillBlock = parseSkillBlock(text);
  if (!skillBlock) {
    container.addChild(new UserMessageComponent(text, markdownTheme));
    return;
  }
  const skill = new SkillInvocationMessageComponent(skillBlock, markdownTheme);
  skill.setExpanded(true);
  container.addChild(skill);
  if (skillBlock.userMessage) {
    container.addChild(new Spacer(1));
    container.addChild(new UserMessageComponent(skillBlock.userMessage, markdownTheme));
  }
}

/** Concatenate the text blocks of a user message's content (mirrors Pi). */
function userMessageText(content: string | readonly { type: string; text?: string }[]): string {
  if (typeof content === "string") return content;
  return content
    .filter((block) => block.type === "text")
    .map((block) => block.text ?? "")
    .join("");
}
