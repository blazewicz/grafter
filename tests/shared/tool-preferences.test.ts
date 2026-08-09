import { describe, expect, it } from 'vitest';
import {
  defaultToolPreferences,
  isToolPickerGroup,
  normalizeToolPreference,
  normalizeToolPreferences,
  toolPickerGroups,
} from '../../src/shared/tool-preferences';

describe('tool picker preferences', () => {
  it('defines allowed tools and defaults for every picker group', () => {
    expect(toolPickerGroups.editor).toEqual({
      defaultTool: 'vscode',
      allowedTools: ['vscode'],
    });
    expect(toolPickerGroups.terminal).toEqual({
      defaultTool: 'terminal',
      allowedTools: ['terminal', 'iterm2'],
    });
    expect(defaultToolPreferences()).toEqual({
      editor: 'vscode',
      terminal: 'terminal',
    });
  });

  it('recognizes only known picker groups', () => {
    expect(isToolPickerGroup('editor')).toBe(true);
    expect(isToolPickerGroup('terminal')).toBe(true);
    expect(isToolPickerGroup('unknown')).toBe(false);
    expect(isToolPickerGroup(null)).toBe(false);
    expect(isToolPickerGroup(42)).toBe(false);
  });

  it('normalizes a tool to undefined unless it belongs to the group', () => {
    expect(normalizeToolPreference('editor', 'vscode')).toBe('vscode');
    expect(normalizeToolPreference('terminal', 'iterm2')).toBe('iterm2');
    expect(normalizeToolPreference('terminal', 'vscode')).toBeUndefined();
    expect(normalizeToolPreference('editor', 'iterm2')).toBeUndefined();
    expect(normalizeToolPreference('editor', 'unknown')).toBeUndefined();
    expect(normalizeToolPreference('editor', 42)).toBeUndefined();
  });

  it('normalizes partial, invalid, and empty persisted maps to full defaults', () => {
    expect(normalizeToolPreferences(undefined)).toEqual({
      editor: 'vscode',
      terminal: 'terminal',
    });
    expect(
      normalizeToolPreferences({
        editor: 'vscode',
        terminal: 'iterm2',
        unknown: 'weird',
      }),
    ).toEqual({ editor: 'vscode', terminal: 'iterm2' });
    expect(normalizeToolPreferences({ editor: 'weird', terminal: 'vscode' })).toEqual({
      editor: 'vscode',
      terminal: 'terminal',
    });
    expect(normalizeToolPreferences('not an object')).toEqual({
      editor: 'vscode',
      terminal: 'terminal',
    });
  });
});
