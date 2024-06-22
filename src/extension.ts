import * as vscode from 'vscode';
import { CommandRunner } from './command/CommandRunner';
import { Item } from './view/CommandTree';
import { buildCommandTreeProvider } from './view/CommandTreeBuilder';
import { ContextMenuProvider } from './config/ContextMenuProvider';

export function activate(context: vscode.ExtensionContext) {
    const provider = buildCommandTreeProvider();
    const commandRunner = new CommandRunner();
    const contextMenuProvider = new ContextMenuProvider(commandRunner);

    context.subscriptions.push(
        vscode.window.registerTreeDataProvider('snippets', provider)
    );

    context.subscriptions.push(
        vscode.commands.registerCommand("terminalSnippets.run", (item: Item) => {
            if (item.action !== undefined) { commandRunner.showQuickPick(item.action); }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand("terminalSnippets.runLast", (item: Item) => {
            if (item.action !== undefined) { commandRunner.runActionWithLastArguments(item.action); }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand("terminalSnippets.refresh", () => provider.refresh())
    );

    contextMenuProvider.registerCommands(context);
}

export function deactivate() {}
