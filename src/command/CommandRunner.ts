// CommandRunner.ts
import * as vscode from 'vscode';
import { Action, Variable } from "../config/Configuration";
import { VariableSubstituter } from "./VariableParser";
import { ValueStorage } from './ValueStorage';
import { loadActions } from '../config/JsonDecoder';
import { TogglerCommand } from '../config/TogglerCommand';

export class CommandRunner {
    actions: Map<Action, string> = new Map<Action, string>();
    terminals: Map<string, vscode.Terminal> = new Map<string, vscode.Terminal>();
    private togglerTerminals: Map<string, vscode.Terminal> = new Map();
    allActions: Action[];
    private _isExecutingCommand: boolean = false;

    get isExecutingCommand(): boolean {
        return this._isExecutingCommand;
    }

    private set isExecutingCommand(value: boolean) {
        this._isExecutingCommand = value;
    }

    constructor() {
        this.allActions = loadActions(); // Initialize allActions in the constructor

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
        if (this.isExecutingCommand) {
            vscode.window.showInformationMessage("A command is already running. Please wait for it to finish.");
            return;
        }

        this.isExecutingCommand = true;

        try {
            const terminalCommand = this.actions.get(action);
            if (terminalCommand !== undefined) {
                await this.executeCommand(terminalCommand, action);
            } else {
                // If there's no stored command, run it as a new command
                await this.showQuickPick(action);
            }
        } finally {
            this.isExecutingCommand = false;
        }
    }

    async showQuickPick(action: Action) {
        if (this.isExecutingCommand) {
            vscode.window.showInformationMessage("A command is already running. Please wait for it to finish.");
            return;
        }

        this.isExecutingCommand = true;

        try {
            // Reload actions and stored values
            this.allActions = loadActions();

            const substituter = new VariableSubstituter(action);
            let command = substituter.substitute(action.command);

            const variableValues: { [key: string]: { value: string, sourceAction: Action; }; } = {};

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
                            await vscode.window.showErrorMessage(
                                `Variable ${varName} not found${action.searchVariablesInCurrentGroup ? ' in the current group' : ''}. Please check your configuration.`,
                                { modal: true }
                            );
                            return;
                        }
                    }

                    let value: string | undefined;

                    // Update stored options if applicable
                    const storedValue = ValueStorage.getStoredValueForVariable(sourceAction, varName);
                    if (storedValue !== undefined && Array.isArray(storedValue) && varDetails.options) {
                        varDetails.options = storedValue;
                    }

                    if (varDetails.defaultValue?.skipDefault) {
                        if (storedValue !== undefined) {
                            value = Array.isArray(storedValue) ? storedValue[0] : storedValue;
                        } else if (varDetails.defaultValue.value !== undefined) {
                            value = varDetails.defaultValue.value;
                        } else {
                            value = await this.handleVariable(varDetails);
                        }
                    } else {
                        if (varDetails.defaultValue?.setStoredValueAsDefault) {
                            ValueStorage.updateDefaultValue(sourceAction, varName, varDetails);
                        }
                        value = await this.handleVariable(varDetails);
                    }

                    if (value === undefined) {
                        return; // Exit if a variable is not set
                    }

                    command = command.replace(varName, value);
                    variableValues[varName] = { value, sourceAction };
                }
            }

            await this.executeCommand(command, action);

            // Store values after execution
            const actionVariables: { [key: string]: { [key: string]: { [key: string]: string | string[]; }; }; } = {};

            for (const [varName, { value, sourceAction }] of Object.entries(variableValues)) {
                const groupName = sourceAction.group || 'Ungrouped';
                const actionLabel = sourceAction.label || sourceAction.command;
                if (!actionVariables[groupName]) {
                    actionVariables[groupName] = {};
                }
                if (!actionVariables[groupName][actionLabel]) {
                    actionVariables[groupName][actionLabel] = {};
                }

                // If the variable has options, store as an array
                if (sourceAction.variables?.[varName]?.options) {
                    const storedValues = ValueStorage.getStoredValueForVariable(sourceAction, varName) as string[] | undefined;
                    if (Array.isArray(storedValues)) {
                        // Add the new value to the beginning of the array and remove duplicates
                        actionVariables[groupName][actionLabel][varName] = [value, ...storedValues.filter(v => v !== value)];
                    } else {
                        actionVariables[groupName][actionLabel][varName] = [value];
                    }
                } else {
                    actionVariables[groupName][actionLabel][varName] = value;
                }
            }

            for (const [groupName, groupActions] of Object.entries(actionVariables)) {
                for (const [actionLabel, variables] of Object.entries(groupActions)) {
                    if (Object.keys(variables).length > 0) {
                        const currentAction = this.allActions.find(a => (a.label || a.command) === actionLabel && (a.group || 'Ungrouped') === groupName);
                        if (currentAction) {
                            const variablesToStore = Object.entries(variables).reduce((acc, [varName, value]) => {
                                if (currentAction.variables?.[varName]?.storeValue) {
                                    acc[varName] = value;
                                }
                                return acc;
                            }, {} as { [key: string]: string | string[]; });

                            if (Object.keys(variablesToStore).length > 0) {
                                ValueStorage.storeValues(currentAction, variablesToStore);
                            }
                        }
                    }
                }
            }
        } catch (error) {
            if (error instanceof Error) {
                await vscode.window.showErrorMessage(error.message, { modal: true });
            } else {
                await vscode.window.showErrorMessage('An unknown error occurred.', { modal: true });
            }
            vscode.commands.executeCommand('workbench.action.closeAllInputs');
            return; // Stop execution
        } finally {
            this.isExecutingCommand = false;
        }
    }

    private findVariableInOtherActions(varName: string, currentAction: Action): { varDetails: Variable, action: Action; } | null {
        const currentGroup = currentAction.group || 'Ungrouped';

        for (const action of this.allActions) {
            if (action !== currentAction && action.variables && action.variables[varName]) {
                const actionGroup = action.group || 'Ungrouped';

                if (!currentAction.searchVariablesInCurrentGroup || (currentAction.searchVariablesInCurrentGroup && actionGroup === currentGroup)) {
                    return { varDetails: action.variables[varName], action };
                }
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

            inputBox.onDidHide(() => {
                this.isExecutingCommand = false;
                resolve(undefined);
            });
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

            quickPick.onDidHide(() => {
                this.isExecutingCommand = false;
                resolve(undefined);
            });
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

    async executeTogglerCommand(text: string, toggler: TogglerCommand) {
        const terminalKey = `${toggler.group}:${toggler.command1.label}`;
        let terminal = this.togglerTerminals.get(terminalKey);

        if (!terminal || terminal.exitStatus !== undefined) {
            terminal = vscode.window.createTerminal(terminalKey);
            this.togglerTerminals.set(terminalKey, terminal);
        }

        terminal.sendText(text);
        terminal.show();
    }

    getTogglerTerminal(toggler: TogglerCommand): vscode.Terminal | undefined {
        const terminalKey = `${toggler.group}:${toggler.command1.label}`;
        return this.togglerTerminals.get(terminalKey);
    }
}
