import * as vscode from 'vscode';
import { CommandRunner } from './command/CommandRunner';
import { Item } from './view/CommandTree';
import { buildCommandTreeProvider } from './view/CommandTreeBuilder';
import { ContextMenuProvider } from './config/ContextMenuProvider';
import { TogglerCommand, toggleState } from './config/TogglerCommand';

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

    context.subscriptions.push(
        vscode.commands.registerCommand("terminalSnippets.runToggler", (item: Item) => {
            if (item.togglerCommand) {
                const tc = item.togglerCommand;
                const isFirstState = toggleState(tc.group, tc.command1.label);
                const currentCommand = isFirstState ? tc.command1 : tc.command2;
                
                const terminal = vscode.window.activeTerminal || vscode.window.createTerminal();
                terminal.show();

                if (currentCommand.runTask === '$interruptSignal') {
                    vscode.commands.executeCommand('workbench.action.terminal.sendSequence', { text: "\x03" });
                } else if (currentCommand.command) {
                    terminal.sendText(currentCommand.command);
                }

                // Update the tree item label
                item.label = isFirstState ? tc.command1.label : tc.command2.label;

                // Refresh the tree view
                provider.refresh();
            }
        })
    );

    contextMenuProvider.registerCommands(context);
}

export function deactivate() {}
