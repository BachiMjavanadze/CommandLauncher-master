import * as vscode from 'vscode';
import { Action } from './Configuration';
import { loadActions } from './JsonDecoder';
import { loadTogglerCommands, getTogglerState, setTogglerState, TogglerCommand } from './TogglerCommand';
import { CommandRunner } from '../command/CommandRunner';

export class TaskbarItemProvider {
  private statusBarItems: Map<string, vscode.StatusBarItem> = new Map();
  private commandRunner: CommandRunner;

  constructor(commandRunner: CommandRunner) {
    this.commandRunner = commandRunner;
  }

  public refresh() {
    this.disposeItems();
    this.createItems();
  }

  private disposeItems() {
    this.statusBarItems.forEach(item => item.dispose());
    this.statusBarItems.clear();
  }

  private createItems() {
    const actions = loadActions();
    const togglerCommands = loadTogglerCommands();

    actions.forEach(action => this.createActionItem(action));
    togglerCommands.forEach(toggler => this.createTogglerItem(toggler));
  }

  private createActionItem(action: Action) {
    if (action.placeOnTaskbar && !action.isContextMenuCommand) {
      const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
      item.text = action.placeOnTaskbar.label;
      item.tooltip = action.placeOnTaskbar.tooltip;
      item.command = {
        title: 'Run Command',
        command: 'terminalSnippets.runTaskbarAction',
        arguments: [action]
      };
      item.show();
      this.statusBarItems.set(this.getActionKey(action), item);
    }
  }

  private createTogglerItem(toggler: TogglerCommand) {
    if (toggler.placeOnTaskbar) {
      const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
      this.updateTogglerItemState(item, toggler);
      item.command = {
        title: 'Run Toggler Command',
        command: 'terminalSnippets.runTaskbarToggler',
        arguments: [toggler]
      };
      item.show();
      this.statusBarItems.set(this.getTogglerKey(toggler), item);
    }
  }

  public updateTogglerState(toggler: TogglerCommand) {
    const key = this.getTogglerKey(toggler);
    const item = this.statusBarItems.get(key);
    if (item) {
      this.updateTogglerItemState(item, toggler);
    }
  }

  private updateTogglerItemState(item: vscode.StatusBarItem, toggler: TogglerCommand) {
    const isFirstState = !getTogglerState(toggler.group, toggler.command1.label);
    item.text = isFirstState ? toggler.placeOnTaskbar!.label1 : toggler.placeOnTaskbar!.label2;
    item.tooltip = isFirstState ? toggler.placeOnTaskbar!.tooltip1 : toggler.placeOnTaskbar!.tooltip2;
  }

  private getActionKey(action: Action): string {
    return `action:${action.group || 'Ungrouped'}:${action.label || action.command}`;
  }

  private getTogglerKey(toggler: TogglerCommand): string {
    return `toggler:${toggler.group}:${toggler.command1.label}`;
  }
}
