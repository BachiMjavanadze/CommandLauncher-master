import { Action } from "../config/Configuration";
import { loadActions } from "../config/JsonDecoder";
import { CommandTreeProvider, Item } from "./CommandTree";

export function buildCommandTreeProvider(): CommandTreeProvider {
    return new CommandTreeProvider(loadItems());
}

export function loadItems(): Item[] {
    const actions = loadActions().filter(action => !action.isContextMenuCommand);
    const groups = findGroups(actions);
    return buildItems(groups);
}

function buildItems(groups: Map<string, Action[]>): Item[] {
    const items: Item[] = [];
    const sortedGroups = new Map([...groups.entries()].sort((a, b) => {
        if (a[0] === 'Ungrouped') return 1;
        if (b[0] === 'Ungrouped') return -1;
        return a[0].localeCompare(b[0]);
    }));

    sortedGroups.forEach((actions, groupName) => {
        const children = actions.map(action => {
            return new Item(buildLabel(action), action);
        });
        items.push(new Item(groupName, undefined, children));
    });
    return items;
}

function findGroups(actions: Action[]): Map<string, Action[]> {
    const groups = new Map<string, Action[]>();
    actions.forEach(v => {
        const groupName = v.group || 'Ungrouped';
        if (groups.has(groupName)) {
            groups.get(groupName)!.push(v);
        } else {
            groups.set(groupName, [v]);
        }
    });
    return groups;
}

function buildLabel(action: Action) {
    if (action.label === undefined) {
        return action.command;
    }
    return action.label.length ? action.label : action.command;
}
