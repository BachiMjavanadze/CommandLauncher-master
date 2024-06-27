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
        let command = substituter.substitute(action.command);

        if (action.variables) {
            for (const [varName, varDetails] of Object.entries(action.variables)) {
                if (varDetails.defaultValue?.value && varDetails.defaultValue.skipDefault) {
                    command = command.replace(varName, varDetails.defaultValue.value);
                } else {
                    const value = await this.handleVariable(varDetails);
                    if (value === undefined) {
                        return; // Exit if a variable is not set
                    }
                    command = command.replace(varName, value);
                }
            }
        }

        await this.executeCommand(command, action);
    }

    async handleVariable(variable: Variable): Promise<string | undefined> {
        if (variable.options !== undefined) {
            return this.askUserToPickString(variable);
        } else {
            return this.askUserToPromptString(variable);
        }
    }

    executeCommand(text: string, action: Action) {
        const substituter = new VariableSubstituter(action);
        text = substituter.substitute(text);

        this.actions.set(action, text);
        const terminalKey = action.label || action.command;
        let terminal = this.terminals.get(terminalKey);

        if (!terminal || terminal.exitStatus !== undefined) {
            terminal = this.createTerminal(action);
            this.terminals.set(terminalKey, terminal);
        }

        const preCommand = action.preCommand;
        if (preCommand !== undefined && preCommand.length) {
            const substitutedPreCommand = substituter.substitute(preCommand);
            terminal.sendText(substitutedPreCommand + " ; " + text);
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
            inputBox.value = variable.defaultValue?.value || '';

            const validateInput = (value: string) => {
                if (!variable.allowEmptyValue && value.trim() === '') {
                    inputBox.validationMessage = 'Blank value not allowed';
                    return false;
                }
                inputBox.validationMessage = undefined;
                return true;
            };

            inputBox.onDidChangeValue((value) => {
                validateInput(value);
            });

            inputBox.onDidAccept(() => {
                const value = inputBox.value;
                if (validateInput(value)) {
                    inputBox.hide();
                    resolve(value);
                }
            });

            inputBox.onDidHide(() => resolve(undefined));
            inputBox.show();
        });
    }

    async askUserToPickString(variable: Variable): Promise<string | undefined> {
        return new Promise((resolve) => {
            const quickPick = vscode.window.createQuickPick();
            
            // Add defaultValue to options if it's not already there
            const options = variable.options || [];
            if (variable.defaultValue?.value && !options.includes(variable.defaultValue.value)) {
                options.unshift(variable.defaultValue.value);
            }
            
            quickPick.items = options.map(option => ({ label: option }));
            quickPick.placeholder = variable.placeholder;
            quickPick.ignoreFocusOut = true;
    
            // Set default value
            if (variable.defaultValue?.value) {
                quickPick.value = variable.defaultValue.value;
                // Pre-select the default value
                quickPick.selectedItems = [{ label: variable.defaultValue.value }];
            }
    
            const validateInput = (value: string) => {
                const isValid = variable.allowEmptyValue || value.trim() !== '';
                quickPick.title = isValid ? undefined : 'Blank value not allowed';
                return isValid;
            };
    
            quickPick.onDidChangeValue((value) => {
                validateInput(value);
                if (value.trim() === '' && variable.defaultValue?.value) {
                    // If the input is empty, reselect the default value
                    quickPick.selectedItems = [{ label: variable.defaultValue.value }];
                } else if (variable.allowAdditionalValue) {
                    const customItem = { label: value };
                    const existingItems = quickPick.items.filter(item => item.label !== value);
                    quickPick.items = [customItem, ...existingItems];
                }
            });
    
            quickPick.onDidAccept(() => {
                const selectedItems = quickPick.selectedItems;
                let value = selectedItems.length > 0 ? selectedItems[0].label : quickPick.value;
    
                // If the value is empty and we have a default value, use the default
                if (value.trim() === '' && variable.defaultValue?.value) {
                    value = variable.defaultValue.value;
                }
    
                if (validateInput(value)) {
                    if (variable.allowAdditionalValue || options.includes(value)) {
                        quickPick.hide();
                        resolve(value);
                    }
                }
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
            placeHolder: placeholder
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
