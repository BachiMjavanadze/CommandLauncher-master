import * as vscode from 'vscode';

export interface CommandConfig {
    command?: string;
    label: string;
    runTask?: string;
}

export interface TogglerCommand {
    group: string;
    command1: CommandConfig;
    command2: CommandConfig;
    showOnExplorer?: boolean;
    placeOnTaskbar?: {
        label1: string;
        label2: string;
        tooltip1: string;
        tooltip2: string;
    };
}

let togglerStates: Map<string, boolean> = new Map();

export function loadTogglerCommands(): TogglerCommand[] {
    const config = vscode.workspace.getConfiguration('terminalSnippets');
    return config.get<TogglerCommand[]>('TogglerCommands', []);
}

export function getTogglerState(groupName: string, label: string): boolean {
    const key = `${groupName}:${label}`;
    return togglerStates.get(key) || false;
}

export function toggleState(groupName: string, label: string): boolean {
    const key = `${groupName}:${label}`;
    const newState = !togglerStates.get(key);
    togglerStates.set(key, newState);
    return newState;
}

export function setTogglerState(groupName: string, label: string, state: boolean) {
    const key = `${groupName}:${label}`;
    togglerStates.set(key, state);
}
