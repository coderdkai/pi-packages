import type { PromptPermissionDetails } from "#src/authority/permission-prompter";

/**
 * Build a minimal `PromptPermissionDetails` for a prompter/authorizer unit test.
 *
 * Owns the *structural* contract — every required field, and nothing else — so a
 * new required field is defaulted here once instead of at every construction
 * site. A test file that asserts on a particular value keeps its own semantic
 * defaults by wrapping this factory.
 */
export function makePromptDetails(
  overrides?: Partial<PromptPermissionDetails>,
): PromptPermissionDetails {
  return {
    requestId: "req-1",
    source: "tool_call",
    agentName: null,
    message: "Allow this?",
    ...overrides,
  };
}
