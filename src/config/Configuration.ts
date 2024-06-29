import { workspace } from "vscode";

const baseSectionConfig = 'terminalSnippets';

export interface InnerVariables {
    [key: string]: string;
}

export const getInnerVariables = (): InnerVariables =>
    getConfiguration().get<InnerVariables>('innerVariables', {});

export const enum Section {
    'command' = 'command',
    'actions' = 'actions'
}

export const getConfiguration = () => workspace.getConfiguration(baseSectionConfig);

export type CommandArgument = string[] | string;

export type InputType = 'string' | 'promptString' | 'pickString';
export type Input = string | PromptString | PickString;

export interface Action {
    command: string;
    variables?: { [key: string]: Variable; };
    label?: string;
    group?: string;
    cwd?: string;
    preCommand?: string;
    revealConsole?: boolean;
    isContextMenuCommand?: boolean;
    searchStoredValueInCurrentGroup?: boolean;
    searchVariablesInCurrentGroup?: boolean;
    showOnExplorer?: boolean;
    placeOnTaskbar?: {
        label: string;
        tooltip: string;
    };
}

export interface Variable {
    options?: string[];
    placeholder: string;
    allowEmptyValue?: boolean;
    allowAdditionalValue?: boolean;
    storeValue?: boolean;
    defaultValue?: {
        value?: string;
        skipDefault?: boolean;
        setStoredValueAsDefault?: boolean;
    };
}

export interface PromptString {
    type: 'PromptString';
    inputContext: string;
}

export interface PickString {
    type: 'PickString';
    options: string[],
    placeholder?: string;
}

export function fillType(input: Input) {
    if (typeof input === 'string') {
        return;
    } else {
        if ("inputContext" in input) {
            input.type = 'PromptString';
        } else if ("options" in input) {
            input.type = 'PickString';
        }
    }
}
