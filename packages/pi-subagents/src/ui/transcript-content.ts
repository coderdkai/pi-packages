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
import type { SessionMessage } from "#src/types";
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
 */
export class TranscriptContent {
  private readonly options: TranscriptContentOptions;
  private container: Container;

  constructor(options: TranscriptContentOptions) {
    this.options = options;
    this.container = this.build();
  }

  /** Every content row at `width`, truncated to it. */
  lines(width: number): readonly string[] {
    if (width <= 0) return [];
    const rows = this.container.render(width);
    const streaming = this.options.source.streaming();
    if (streaming) {
      rows.push("", `${GLYPHS.streaming} ${describeActivity(streaming.activeTools, streaming.responseText)}`);
    }
    return rows.map((row) => truncateToWidth(row, width));
  }

  /** Take up the source's current message history. */
  apply(): void {
    this.container = this.build();
  }

  /** Drop cached rendering held by the mounted components. */
  invalidate(): void {
    this.container.invalidate();
  }

  // ---- Private ----

  private build(): Container {
    const container = new Container();
    const pendingTools = new Map<string, ToolExecutionComponent>();
    for (const message of this.options.source.getMessages()) {
      addMessageComponents(container, message, pendingTools, this.options);
    }
    return container;
  }
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
