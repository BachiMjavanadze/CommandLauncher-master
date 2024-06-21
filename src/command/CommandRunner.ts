import { QuickPickItem, Terminal, TerminalOptions, window } from "vscode";
import { Action, Variable, Input, PromptString, PickString } from "../config/Configuration";
import { VariableSubstituter } from "./VariableParser";

export class CommandRunner {
    actions: Map<Action, string> = new Map<Action, string>();
    terminals: Map<Action, Terminal> = new Map<Action, Terminal>();

    constructor() {
        window.onDidCloseTerminal(terminal => {
            const actionsToDelete: Action[] = [];
            this.terminals.forEach((value, key) => {
                if (value === terminal) {
                    actionsToDelete.push(key);
                }
            });
            actionsToDelete.forEach(v => this.terminals.delete(v));
        });

    }

    async runActionWithLastArguments(action: Action) {
        const terminalCommand = this.actions.get(action);
        if (terminalCommand !== undefined) {
            this.executeCommand(terminalCommand, action);
        }
    }

    async showQuickPick(action: Action) {
        const variables = action.variables;
        const substituter = new VariableSubstituter(action);
        let command = action.command;

        for (const [varName, varDetails] of Object.entries(variables)) {
            const value = await this.handleVariable(varDetails);
            if (value === undefined) {
                // If any variable is not set, don't run the command
                return;
            }
            command = command.replace(varName, value);
        }

        command = substituter.substitute(command);
        this.executeCommand(command, action);
    }

    async handleVariable(variable: Variable): Promise<string | undefined> {
        if (variable.options) {
            return this.askUserToPickString(variable);
        } else {
            return this.askUserToPromptString(variable);
        }
    }

    executeCommand(text: string, action: Action) {
        this.actions.set(action, text);
        let terminal = this.terminals.get(action);
        if (!terminal) {
            terminal = this.createTerminal(action);
            const preCommand = action.preCommand;

            if (preCommand !== undefined && preCommand.length) {
                terminal.sendText(preCommand + " ; " + text);
            } else {
                terminal.sendText(text);
            }
        } else {
            terminal.sendText(text);
        }

        // Reveal the terminal only if revealConsole is true
        if (action.revealConsole) {
            terminal.show();
        }
    }

    async askUserToPromptString(variable: Variable): Promise<string | undefined> {
        return window.showInputBox({ prompt: variable.placeholder });
    }

    async askUserToPickString(variable: Variable): Promise<string | undefined> {
        const quickPick = await this.createQuickPick(variable.options!, variable.placeholder);
        const pickedItems = quickPick ?? [];
        return pickedItems.map(item => item.label).join(' ');
    }

    async createQuickPick(labels: String[], placeholder?: string): Promise<QuickPickItem[] | undefined> {
        const items = labels.map((v: String) => {
            return { label: v, picked: false } as QuickPickItem;
        });
        return window.showQuickPick(items, {
            canPickMany: true,
            placeHolder: placeholder // Pass the placeholder parameter here
        });
    }

    createTerminal(action: Action): Terminal {
        const options: TerminalOptions = { name: action.label, cwd: action.cwd };
        const terminal = window.createTerminal(options);
        this.terminals.set(action, terminal);
        return terminal;
    }
}
