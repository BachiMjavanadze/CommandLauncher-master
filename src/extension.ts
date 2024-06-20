import { commands, ExtensionContext, window } from 'vscode';
import { CommandRunner } from './command/CommandRunner';
import { Item } from './view/CommandTree';
import { buildCommandTreeProvider } from './view/CommandTreeBuilder';

export function activate(context: ExtensionContext) {
	const provider = buildCommandTreeProvider();
	const commandRunner = new CommandRunner();
	context.subscriptions.push(
		window.registerTreeDataProvider('launcher', provider)
	);
	context.subscriptions.push(
		commands.registerCommand("commandLauncher.run", (item: Item) => {
			if (item.action !== undefined) { commandRunner.showQuickPick(item.action); }
		})
	);
	context.subscriptions.push(
		commands.registerCommand("commandLauncher.runLast", (item: Item) => {
			if (item.action !== undefined) { commandRunner.runActionWithLastArguments(item.action); }
		})
	);
	context.subscriptions.push(
		commands.registerCommand("commandLauncher.refresh", () => provider.refresh())
	);
}
