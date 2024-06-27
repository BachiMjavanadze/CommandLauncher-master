import * as vscode from 'vscode';
import { Action, Variable } from "../config/Configuration";
import { VariableSubstituter } from "./VariableParser";
import { ValueStorage } from './ValueStorage';
import { loadActions } from '../config/JsonDecoder';

export class CommandRunner {
    actions: Map<Action, string> = new Map<Action, string>();
    terminals: Map<string, vscode.Terminal> = new Map<string, vscode.Terminal>();
    allActions: Action[];

    constructor() {
        this.allActions = loadActions();
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
            await this.executeCommand(terminalCommand, action);
        } else {
            // If there's no stored command, run it as a new command
            await this.showQuickPick(action);
        }
    }

    async showQuickPick(action: Action) {
        const substituter = new VariableSubstituter(action);
        let command = substituter.substitute(action.command);

        const variableValues: { [key: string]: { value: string, sourceAction: Action } } = {};

        if (action.variables) {
            const variableRegex = /\$\w+/g;
            const variablesInOrder = command.match(variableRegex) || [];

            for (const varName of variablesInOrder) {
                let varDetails = action.variables[varName];
                let sourceAction = action;

                if (!varDetails) {
                    const result = this.findVariableInOtherActions(varName, action);
                    if (result) {
                        varDetails = result.varDetails;
                        sourceAction = result.action;
                    } else {
                        vscode.window.showErrorMessage(`Variable ${varName} not found`);
                        return;
                    }
                }

                const storedValues = ValueStorage.getStoredValues(sourceAction.label || sourceAction.command);
                if (storedValues === null) {
                    return; // Exit if storage file is damaged
                }

                if (varDetails.storeValue && storedValues && storedValues[varName]) {
                    if (Array.isArray(storedValues[varName])) {
                        varDetails.options = storedValues[varName] as string[];
                    } else {
                        varDetails.defaultValue = { value: storedValues[varName] as string };
                    }
                }

                const value = await this.handleVariable(varDetails);
                if (value === undefined) {
                    return; // Exit if a variable is not set
                }
                command = command.replace(varName, value);
                variableValues[varName] = { value, sourceAction };
            }
        }

        await this.executeCommand(command, action);

        // Store values after execution
        const actionVariables: { [key: string]: { [key: string]: string } } = {};

        for (const [varName, { value, sourceAction }] of Object.entries(variableValues)) {
            const actionLabel = sourceAction.label || sourceAction.command;
            if (!actionVariables[actionLabel]) {
                actionVariables[actionLabel] = {};
            }
            actionVariables[actionLabel][varName] = value;
        }

        for (const [actionLabel, variables] of Object.entries(actionVariables)) {
            if (Object.keys(variables).length > 0) {
                ValueStorage.storeValues(this.allActions.find(a => (a.label || a.command) === actionLabel)!, variables);
            }
        }
    }

    private findVariableInOtherActions(varName: string, currentAction: Action): { varDetails: Variable, action: Action } | null {
        for (const action of this.allActions) {
            if (action !== currentAction && action.variables && action.variables[varName]) {
                return { varDetails: action.variables[varName], action };
            }
        }
        return null;
    }

    async handleVariable(variable: Variable): Promise<string | undefined> {
        if (variable.options !== undefined) {
            return this.askUserToPickString(variable);
        } else {
            return this.askUserToPromptString(variable);
        }
    }

    async executeCommand(text: string, action: Action) {
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

    createTerminal(action: Action): vscode.Terminal {
        const options: vscode.TerminalOptions = {
            name: action.label || action.command,
            cwd: action.cwd
        };
        return vscode.window.createTerminal(options);
    }
}
