import { Event, EventEmitter, ProviderResult, TreeDataProvider, TreeItem, TreeItemCollapsibleState } from "vscode";
import { Action } from "../config/Configuration";
import { loadItems } from "./CommandTreeBuilder";

export class CommandTreeProvider implements TreeDataProvider<Item> {

    data: Item[];

    constructor(items: Item[]) {
        this.data = items;
    }

    private _onDidChangeTreeData: EventEmitter<Item | undefined | null | void> = new EventEmitter<Item | undefined | null | void>();
    readonly onDidChangeTreeData: Event<Item | undefined | null | void> = this._onDidChangeTreeData.event;

    refresh() {
        this.data = loadItems();
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: Item): TreeItem | Thenable<TreeItem> {
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

    constructor(label: string, action?: Action, children?: Item[]) {
        super(
            label,
            children === undefined ? TreeItemCollapsibleState.None :
                TreeItemCollapsibleState.Expanded);
        this.children = children;
        this.action = action;
        this.contextValue = (children === undefined || !children) ? 'hasCommand' : undefined;
    }
}