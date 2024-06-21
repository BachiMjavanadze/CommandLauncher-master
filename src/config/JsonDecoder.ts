import { Action, getConfiguration, Section } from "./Configuration";

export function loadActions(): Action[] {
    const actions = getConfiguration().get<Action[]>(Section.actions, []);
    actions.forEach(v => fillOptionalProperties(v));
    return actions;
}

function fillOptionalProperties(action: Action) {
    if (action.label === undefined) {
        action.label = action.command;
    }
    if (action.group === undefined) {
        action.group = "";
    }
    if (action.revealConsole === undefined) {
        action.revealConsole = true;
    }
    if (action.variables === undefined) {
        action.variables = {};
    }
    if (action.isContextMenuCommand === undefined) {
        action.isContextMenuCommand = false;
    }
}
