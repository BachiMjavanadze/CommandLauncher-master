// ContextMenuProvider.ts
import * as vscode from 'vscode';
import { CommandRunner } from '../command/CommandRunner';
import { loadActions } from './JsonDecoder';
import { Action, Variable } from './Configuration';
import { ValueStorage } from '../command/ValueStorage';

interface ActionQuickPickItem extends vscode.QuickPickItem {
    action?: Action;
    groupName?: string;
}

export class ContextMenuProvider {
    private commandRunner: CommandRunner;
    private quickPick: vscode.QuickPick<ActionQuickPickItem>;
    private isExecutingCommand: boolean = false;
    private allActions: Action[];

    constructor(commandRunner: CommandRunner) {
        this.commandRunner = commandRunner;
        this.quickPick = vscode.window.createQuickPick<ActionQuickPickItem>();
        this.quickPick.ignoreFocusOut = true;
        this.allActions = loadActions();
    }

    registerCommands(context: vscode.ExtensionContext) {
        const showContextMenuCommand = vscode.commands.registerCommand('terminalSnippets.showContextMenu', (uri: vscode.Uri) => {
            this.showContextMenu(uri);
        });
        context.subscriptions.push(showContextMenuCommand);
    }

    private async showContextMenu(uri: vscode.Uri) {
        // Reload actions to ensure we have the latest configuration
        this.allActions = loadActions();

        const actions = this.allActions.filter(action => action.isContextMenuCommand);
        const groups = this.groupActions(actions);

        this.quickPick.items = Array.from(groups.keys()).map(groupName => ({
            label: groupName,
            groupName: groupName
        }));
        this.quickPick.placeholder = 'Select a group';

        this.quickPick.onDidAccept(async () => {
            const selectedGroup = this.quickPick.selectedItems[0];
            if (selectedGroup && selectedGroup.groupName) {
                const groupActions = groups.get(selectedGroup.groupName) || [];
                this.quickPick.items = groupActions.map(action => ({
                    label: action.label || action.command,
                    action: action
                }));
                this.quickPick.placeholder = 'Select a command to run';

                this.quickPick.onDidAccept(async () => {
                    const selectedCommand = this.quickPick.selectedItems[0];
                    if (selectedCommand && selectedCommand.action && !this.isExecutingCommand) {
                        this.isExecutingCommand = true;
                        await this.runCommand(selectedCommand.action, uri);
                        this.isExecutingCommand = false;
                        this.quickPick.hide();
                    }
                });
            }
        });

        this.quickPick.show();
    }

    private groupActions(actions: Action[]): Map<string, Action[]> {
        const groups = new Map<string, Action[]>();
        actions.forEach(action => {
            const groupName = action.group || 'Ungrouped';
            if (!groups.has(groupName)) {
                groups.set(groupName, []);
            }
            groups.get(groupName)!.push(action);
        });
        return groups;
    }

    private async runCommand(action: Action, uri: vscode.Uri) {
        try {
            // Reload actions to ensure we have the latest configuration
            this.allActions = loadActions();

            const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
            const baseFolderAbsolutePath = workspaceFolder ? workspaceFolder.uri.fsPath : undefined;
            const clickedItemAbsolutePath = uri.fsPath;
            const clickedItemRelativePath = workspaceFolder ? vscode.workspace.asRelativePath(uri) : clickedItemAbsolutePath;

            let command = action.command
                .replace(/\$clickedItemAbsolutePath/g, clickedItemAbsolutePath)
                .replace(/\$clickedItemRelativePath/g, clickedItemRelativePath)
                .replace(/\$baseFolderAbsolutePath/g, baseFolderAbsolutePath || '');

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

                    // Update stored options if applicable
                    const storedValue = ValueStorage.getStoredValueForVariable(sourceAction, varName);
                    if (storedValue !== undefined && Array.isArray(storedValue) && varDetails.options) {
                        varDetails.options = storedValue;
                    }

                    let value: string | undefined;

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

            await this.commandRunner.executeCommand(command, action);

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
            this.quickPick.hide(); // Close the quick pick
            return; // Stop execution
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

    private async handleVariable(variable: Variable): Promise<string | undefined> {
        if (variable.options) {
            return this.askUserToPickString(variable);
        } else {
            return this.askUserToPromptString(variable);
        }
    }

    private async askUserToPromptString(variable: Variable): Promise<string | undefined> {
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

    private async askUserToPickString(variable: Variable): Promise<string | undefined> {
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
}
