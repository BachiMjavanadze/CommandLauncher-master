import { Event, EventEmitter, ProviderResult, TreeDataProvider, TreeItem, TreeItemCollapsibleState } from "vscode";
import * as vscode from 'vscode';
import { Action } from "../config/Configuration";
import { loadItems } from "./CommandTreeBuilder";
import { TogglerCommand, getTogglerState, setTogglerState } from "../config/TogglerCommand";
import { TaskbarItemProvider } from "../config/TaskbarItemProvider";

export class CommandTreeProvider implements TreeDataProvider<Item> {
    data: Item[];
    private taskbarProvider: TaskbarItemProvider | undefined;

    constructor(items: Item[]) {
        this.data = items;
    }

    private _onDidChangeTreeData: EventEmitter<Item | undefined | null | void> = new EventEmitter<Item | undefined | null | void>();
    readonly onDidChangeTreeData: Event<Item | undefined | null | void> = this._onDidChangeTreeData.event;

    refresh() {
        this.data = loadItems();
        this._onDidChangeTreeData.fire();
    }

    setTaskbarProvider(provider: TaskbarItemProvider) {
        this.taskbarProvider = provider;
    }

    private getGlobalSettings(): { enableRunAndRunLastIcons: boolean; enableTogglerIcon: boolean } {
        const config = vscode.workspace.getConfiguration('terminalSnippets');
        return config.get('globalSettings') || { enableRunAndRunLastIcons: false, enableTogglerIcon: false };
    }

    getTreeItem(element: Item): TreeItem | Thenable<TreeItem> {
        const globalSettings = this.getGlobalSettings();
        
        if (element.action) {
            element.command = !globalSettings.enableRunAndRunLastIcons ? {
                command: 'terminalSnippets.run',
                title: 'Run',
                arguments: [element]
            } : undefined;
            
            if (globalSettings.enableRunAndRunLastIcons) {
                element.iconPath = undefined;
                element.contextValue = 'hasCommand';
            } else {
                element.contextValue = undefined;
            }
        } else if (element.togglerCommand) {
            const isFirstState = !getTogglerState(element.togglerCommand.group, element.togglerCommand.command1.label);
            element.label = isFirstState ? element.togglerCommand.command1.label : element.togglerCommand.command2.label;
            
            element.command = !globalSettings.enableTogglerIcon ? {
                command: 'terminalSnippets.runToggler',
                title: 'Run Toggler Command',
                arguments: [element]
            } : undefined;
            
            if (globalSettings.enableTogglerIcon) {
                element.iconPath = undefined;
                element.contextValue = 'hasTogglerCommand';
            } else {
                element.contextValue = undefined;
            }

            // Update taskbar when toggler state changes
            if (this.taskbarProvider) {
                this.taskbarProvider.updateTogglerState(element.togglerCommand);
            }
        }
        
        return element;
    }

    getChildren(element?: Item | undefined): ProviderResult<Item[]> {
        if (element === undefined) {
            return this.data;
        }
        return element.children;
    }
}

export class Item extends TreeItem {
    children: Item[] | undefined;
    action: Action | undefined;
    togglerCommand: TogglerCommand | undefined;

    constructor(label: string, action?: Action, children?: Item[], togglerCommand?: TogglerCommand) {
        const treeItemLabel: vscode.TreeItemLabel = {
            label: label,
            highlights: undefined
        };

        super(
            treeItemLabel,
            children === undefined ? TreeItemCollapsibleState.None :
                TreeItemCollapsibleState.Expanded
        );

        this.children = children;
        this.action = action;
        this.togglerCommand = togglerCommand;
        
        this.tooltip = '';

        if (action) {
            this.contextValue = 'hasCommand';
        } else if (togglerCommand) {
            this.contextValue = 'hasTogglerCommand';
        } else {
            this.contextValue = undefined;
        }
    }
}
