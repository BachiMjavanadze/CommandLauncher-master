import * as vscode from 'vscode';
import { CommandRunner } from './command/CommandRunner';
import { Item, CommandTreeProvider } from './view/CommandTree';
import { buildCommandTreeProvider } from './view/CommandTreeBuilder';
import { ContextMenuProvider } from './config/ContextMenuProvider';
import { TogglerCommand, toggleState } from './config/TogglerCommand';
import { TaskbarItemProvider } from './config/TaskbarItemProvider';
import { Action } from './config/Configuration';

let taskbarProvider: TaskbarItemProvider;
let treeProvider: CommandTreeProvider;

export function activate(context: vscode.ExtensionContext) {
    const commandRunner = new CommandRunner();
    treeProvider = buildCommandTreeProvider();
    const contextMenuProvider = new ContextMenuProvider(commandRunner);
    taskbarProvider = new TaskbarItemProvider(commandRunner);

    treeProvider.setTaskbarProvider(taskbarProvider);

    context.subscriptions.push(
        vscode.window.registerTreeDataProvider('snippets', treeProvider)
    );

    context.subscriptions.push(
        vscode.commands.registerCommand("terminalSnippets.run", async (item: Item) => {
            if (item.action !== undefined) { 
                await commandRunner.showQuickPick(item.action);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand("terminalSnippets.runLast", async (item: Item) => {
            if (item.action !== undefined) { 
                await commandRunner.runActionWithLastArguments(item.action);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand("terminalSnippets.refresh", () => {
            treeProvider.refresh();
            taskbarProvider.refresh();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand("terminalSnippets.runToggler", async (item: Item) => {
            if (item.togglerCommand) {
                await commandRunner.executeWithLock(async () => {
                    const tc = item.togglerCommand!;
                    const isFirstState = toggleState(tc.group, tc.command1.label);
                    const currentCommand = isFirstState ? tc.command1 : tc.command2;

                    if (currentCommand.runTask) {
                        await commandRunner.executeTogglerCommand(currentCommand.runTask, tc);
                    } else if (currentCommand.command) {
                        await commandRunner.executeTogglerCommand(currentCommand.command, tc);
                    }

                    // Update both tree view and taskbar
                    taskbarProvider.updateTogglerState(tc);
                    treeProvider.refresh();
                });
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand("terminalSnippets.runTaskbarToggler", async (toggler: TogglerCommand) => {
            await commandRunner.executeWithLock(async () => {
                const isFirstState = toggleState(toggler.group, toggler.command1.label);
                const currentCommand = isFirstState ? toggler.command1 : toggler.command2;

                if (currentCommand.runTask) {
                    await commandRunner.executeTogglerCommand(currentCommand.runTask, toggler);
                } else if (currentCommand.command) {
                    await commandRunner.executeTogglerCommand(currentCommand.command, toggler);
                }

                // Update both taskbar and tree view
                taskbarProvider.updateTogglerState(toggler);
                treeProvider.refresh();
            });
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand("terminalSnippets.runTaskbarAction", async (action: Action) => {
            await commandRunner.showQuickPick(action);
        })
    );

    contextMenuProvider.registerCommands(context);
    taskbarProvider.refresh();
}

export function deactivate() { }
