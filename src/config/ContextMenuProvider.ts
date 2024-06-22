import * as vscode from 'vscode';
import { CommandRunner } from '../command/CommandRunner';
import { loadActions } from './JsonDecoder';
import { Action, Variable } from './Configuration';

interface ActionQuickPickItem extends vscode.QuickPickItem {
    action?: Action;
    groupName?: string;
}

export class ContextMenuProvider {
    private commandRunner: CommandRunner;
    private quickPick: vscode.QuickPick<ActionQuickPickItem>;
    private isExecutingCommand: boolean = false;

    constructor(commandRunner: CommandRunner) {
        this.commandRunner = commandRunner;
        this.quickPick = vscode.window.createQuickPick<ActionQuickPickItem>();
        this.quickPick.ignoreFocusOut = true;
    }

    registerCommands(context: vscode.ExtensionContext) {
        const showContextMenuCommand = vscode.commands.registerCommand('terminalSnippets.showContextMenu', (uri: vscode.Uri) => {
            this.showContextMenu(uri);
        });
        context.subscriptions.push(showContextMenuCommand);
    }

    private async showContextMenu(uri: vscode.Uri) {
        const actions = loadActions().filter(action => action.isContextMenuCommand);
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
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
        const baseFolderAbsolutePath = workspaceFolder ? workspaceFolder.uri.fsPath : undefined;
        const clickedItemAbsolutePath = uri.fsPath;
        const clickedItemRelativePath = workspaceFolder ? vscode.workspace.asRelativePath(uri) : clickedItemAbsolutePath;

        let command = action.command
            .replace(/\$clickedItemAbsolutePath/g, clickedItemAbsolutePath)
            .replace(/\$clickedItemRelativePath/g, clickedItemRelativePath)
            .replace(/\$baseFolderAbsolutePath/g, baseFolderAbsolutePath || '');

        if (action.variables) {
            for (const [varName, varDetails] of Object.entries(action.variables)) {
                const value = await this.handleVariable(varDetails);
                if (value === undefined) {
                    // If any variable is not set, don't run the command
                    return;
                }
                command = command.replace(varName, value);
            }
        }

        await this.commandRunner.executeCommand(command, action);
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
            inputBox.onDidAccept(() => {
                const value = inputBox.value;
                inputBox.hide();
                resolve(value);
            });
            inputBox.onDidHide(() => resolve(undefined));
            inputBox.show();
        });
    }

    private async askUserToPickString(variable: Variable): Promise<string | undefined> {
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
}
