import { QuickPickItem, Terminal, TerminalOptions, window } from "vscode";
import { Action, Variable, Input, PromptString, PickString } from "../config/Configuration";
import { VariableSubstituter } from "./VariableParser";
import * as vscode from 'vscode';

export class CommandRunner {
    actions: Map<Action, string> = new Map<Action, string>();
    terminals: Map<string, vscode.Terminal> = new Map<string, vscode.Terminal>();

    constructor() {
        vscode.window.onDidCloseTerminal(terminal => {
            for (const [key, value] of this.terminals.entries()) {
                if (value === terminal) {
                    this.terminals.delete(key);
                    break;
                }
            }
        });
    }

    async runActionWithLastArguments(action: Action) {
        const terminalCommand = this.actions.get(action);
        if (terminalCommand !== undefined) {
            this.executeCommand(terminalCommand, action);
        }
    }

    async showQuickPick(action: Action) {
        const substituter = new VariableSubstituter(action);
        let command = action.command;
    
        if (action.variables) {
            for (const [varName, varDetails] of Object.entries(action.variables)) {
                const value = await this.handleVariable(varDetails);
                if (value === undefined) {
                    return;
                }
                command = command.replace(varName, value);
            }
        }
    
        command = substituter.substitute(command);
        await this.executeCommand(command, action);
    }

    async handleVariable(variable: Variable): Promise<string | undefined> {
        if (variable.options) {
            return this.askUserToPickString(variable);
        } else {
            return this.askUserToPromptString(variable);
        }
    }

    executeCommand(text: string, action: Action) {
        this.actions.set(action, text);
        const terminalKey = action.label || action.command;
        let terminal = this.terminals.get(terminalKey);

        if (!terminal || terminal.exitStatus !== undefined) {
            terminal = this.createTerminal(action);
            this.terminals.set(terminalKey, terminal);
        }

        const preCommand = action.preCommand;
        if (preCommand !== undefined && preCommand.length) {
            terminal.sendText(preCommand + " ; " + text);
        } else {
            terminal.sendText(text);
        }

        if (action.revealConsole) {
            terminal.show();
        }
    }

    async askUserToPromptString(variable: Variable): Promise<string | undefined> {
        return new Promise((resolve) => {
            const inputBox = vscode.window.createInputBox();
            inputBox.prompt = variable.placeholder;
            inputBox.ignoreFocusOut = true;
            inputBox.onDidAccept(() => {
                const value = inputBox.value;
                inputBox.hide();
                resolve(value);
            });
            inputBox.onDidHide(() => resolve(undefined));
            inputBox.show();
        });
    }

    async askUserToPickString(variable: Variable): Promise<string | undefined> {
        return new Promise((resolve) => {
            const quickPick = vscode.window.createQuickPick();
            quickPick.items = variable.options!.map(option => ({ label: option }));
            quickPick.placeholder = variable.placeholder;
            quickPick.ignoreFocusOut = true;
            quickPick.onDidAccept(() => {
                const selected = quickPick.selectedItems[0];
                quickPick.hide();
                resolve(selected ? selected.label : undefined);
            });
            quickPick.onDidHide(() => resolve(undefined));
            quickPick.show();
        });
    }

    async createQuickPick(labels: String[], placeholder?: string): Promise<QuickPickItem[] | undefined> {
        const items = labels.map((v: String) => {
            return { label: v, picked: false } as QuickPickItem;
        });
        return window.showQuickPick(items, {
            canPickMany: true,
            placeHolder: placeholder // Pass the placeholder parameter here
        });
    }

    createTerminal(action: Action): vscode.Terminal {
        const options: vscode.TerminalOptions = { 
            name: action.label || action.command,
            cwd: action.cwd
        };
        return vscode.window.createTerminal(options);
    }
}
