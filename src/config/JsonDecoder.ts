import { Action, fillType, getConfiguration, Section } from "./Configuration";

export function loadActions(): Action[] {
    const actions = getConfiguration().get<Action[]>(Section.actions, []);
    actions.forEach(v => fillOptionalProperties(v));
    return actions;
}

function fillOptionalProperties(action: Action) {
    action.arguments.forEach(v => fillType(v));
    fillUndefined(action);
}

function fillUndefined(action: Action) {
    if (action.label === undefined) {
        action.label = action.command;
    }
    if (action.group === undefined) {
        action.group = "";
    }
    if (action.revealConsole === undefined) { // Add this line
        action.revealConsole = true; // Set the default value to true
    }
}
