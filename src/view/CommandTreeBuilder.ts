import { Action } from "../config/Configuration";
import { loadActions } from "../config/JsonDecoder";
import { CommandTreeProvider, Item } from "./CommandTree";

export function buildCommandTreeProvider(): CommandTreeProvider {
    return new CommandTreeProvider(loadItems());
}

export function loadItems(): Item[] {
    const actions = loadActions();
    const groups = findGroups(actions);
    return buildItems(groups);
}

function buildItems(groups: Map<string, Action[]>): Item[] {
    const items: Item[] = [];
    groups.forEach((v, k) => {
        const children = v.map(action => {
            return new Item(buildLabel(action), action);
        });
        items.push(new Item(k, undefined, children));
    });
    return items;
}

function findGroups(actions: Action[]): Map<string, Action[]> {
    const groups = new Map<string, Action[]>();
    actions.forEach(v => {
        if (groups.has(v.group!!)) {
            groups.get(v.group!!)!!.push(v);
        } else {
            groups.set(v.group!!, [v]);
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