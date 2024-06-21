import * as vscode from 'vscode';
import { CommandRunner } from '../command/CommandRunner';
import { loadActions } from './JsonDecoder';
import { Action } from './Configuration';

interface ActionQuickPickItem extends vscode.QuickPickItem {
    action?: Action;
    groupName?: string;
}

export class ContextMenuProvider {
    private commandRunner: CommandRunner;

    constructor(commandRunner: CommandRunner) {
        this.commandRunner = commandRunner;
    }

    registerCommands(context: vscode.ExtensionContext) {
        const showContextMenuCommand = vscode.commands.registerCommand('commandLauncher.showContextMenu', (uri: vscode.Uri) => {
            this.showContextMenu(uri);
        });
        context.subscriptions.push(showContextMenuCommand);
    }

    private async showContextMenu(uri: vscode.Uri) {
        const actions = loadActions().filter(action => action.isContextMenuCommand);
        const groups = this.groupActions(actions);

        // First, show the groups
        const groupItems: ActionQuickPickItem[] = Array.from(groups.keys()).map(groupName => ({
            label: groupName,
            groupName: groupName
        }));

        const selectedGroup = await vscode.window.showQuickPick(groupItems, { placeHolder: 'Select a group' });
        
        if (selectedGroup && selectedGroup.groupName) {
            // Then, show the commands for the selected group
            const groupActions = groups.get(selectedGroup.groupName) || [];
            const commandItems: ActionQuickPickItem[] = groupActions.map(action => ({
                label: action.label || action.command,
                action: action
            }));

            const selectedCommand = await vscode.window.showQuickPick(commandItems, { placeHolder: 'Select a command to run' });
            
            if (selectedCommand && selectedCommand.action) {
                this.runCommand(selectedCommand.action, uri);
            }
        }
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

    private runCommand(action: Action, uri: vscode.Uri) {
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
        const baseFolderAbsolutePath = workspaceFolder ? workspaceFolder.uri.fsPath : undefined;
        const clickedItemAbsolutePath = uri.fsPath;
        const clickedItemRelativePath = workspaceFolder ? vscode.workspace.asRelativePath(uri) : clickedItemAbsolutePath;

        const commandWithReplacedVariables = action.command
            .replace(/\$clickedItemAbsolutePath/g, clickedItemAbsolutePath)
            .replace(/\$clickedItemRelativePath/g, clickedItemRelativePath)
            .replace(/\$baseFolderAbsolutePath/g, baseFolderAbsolutePath || '');

        const actionWithReplacedVariables: Action = {
            ...action,
            command: commandWithReplacedVariables
        };

        this.commandRunner.showQuickPick(actionWithReplacedVariables);
    }
}
