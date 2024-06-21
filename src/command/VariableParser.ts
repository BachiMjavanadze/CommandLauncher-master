import path = require("path");
import { TextDocument, window } from "vscode";
import { Action, PickString } from "../config/Configuration";

export class VariableSubstituter {
    action: Action;

    constructor(action: Action) {
        this.action = action;
    }

    substitute(command: string): string {
        command = parse(command);
        if (this.action.preCommand !== undefined) {
            this.action.preCommand = parse(this.action.preCommand);
        }
        return command;
    }
}

function parse(text: string): string {
    const activeFile = window.activeTextEditor?.document;
    if (activeFile !== undefined) {
        text = parseActiveFileVariables(activeFile, text);
    }
    text = text.replace(/\${pathSeparator}/g, path.sep);
    return text;
}

function parseActiveFileVariables(activeFile: TextDocument, text: string): string {
    const absoluteFilePath = activeFile.uri.fsPath;
    const absolutePath = path.parse(absoluteFilePath);

    text = text.replace(/\${file}/g, absoluteFilePath);
    text = text.replace(/\${fileBasename}/g, absolutePath.base);
    text = text.replace(/\${fileBasenameNoExtension}/g, absolutePath.name);
    text = text.replace(/\${fileExtname}/g, absolutePath.ext);
    text = text.replace(/\${fileDirname}/g, absolutePath.dir.substring(absolutePath.dir.lastIndexOf(path.sep) + 1));

    return text;
}
