import type { ToolPickerGroup } from './contracts';

export interface ToolPickerGroupDefinition {
  readonly defaultTool: string;
  readonly allowedTools: readonly string[];
}

export const toolPickerGroups: Record<ToolPickerGroup, ToolPickerGroupDefinition> = {
  editor: { defaultTool: 'vscode', allowedTools: ['vscode'] },
  terminal: { defaultTool: 'terminal', allowedTools: ['terminal', 'iterm2'] },
};

export const toolPickerGroupIds: readonly ToolPickerGroup[] = ['editor', 'terminal'];

export function isToolPickerGroup(value: unknown): value is ToolPickerGroup {
  return toolPickerGroupIds.includes(value as ToolPickerGroup);
}

export function defaultToolPreference(group: ToolPickerGroup): string {
  return toolPickerGroups[group].defaultTool;
}

export function normalizeToolPreference(
  group: ToolPickerGroup,
  value: unknown,
): string | undefined {
  const definition = toolPickerGroups[group];
  return typeof value === 'string' && definition.allowedTools.includes(value)
    ? value
    : undefined;
}

export function defaultToolPreferences(): Record<ToolPickerGroup, string> {
  return {
    editor: toolPickerGroups.editor.defaultTool,
    terminal: toolPickerGroups.terminal.defaultTool,
  };
}

export function normalizeToolPreferences(
  value: unknown,
): Record<ToolPickerGroup, string> {
  const preferences = defaultToolPreferences();
  if (!value || typeof value !== 'object') return preferences;
  for (const [rawGroup, rawTool] of Object.entries(value as Record<string, unknown>)) {
    if (!isToolPickerGroup(rawGroup)) continue;
    const tool = normalizeToolPreference(rawGroup, rawTool);
    if (tool) preferences[rawGroup] = tool;
  }
  return preferences;
}
