import * as vscode from 'vscode';
import * as path from 'path';
import { Action } from "../config/Configuration";

export class VariableSubstituter {
    action: Action;

    constructor(action: Action) {
        this.action = action;
    }

    substitute(command: string, uri?: vscode.Uri): string {
        command = parse(command, uri);
        if (this.action.preCommand !== undefined) {
            this.action.preCommand = parse(this.action.preCommand, uri);
        }
        return command;
    }
}

function parse(text: string, uri?: vscode.Uri): string {
    const activeFile = vscode.window.activeTextEditor?.document;
    if (activeFile !== undefined) {
        text = parseActiveFileVariables(activeFile, text);
    }
    
    // Always try to get the workspace folder, even if uri is undefined
    const workspaceFolder = uri 
        ? vscode.workspace.getWorkspaceFolder(uri) 
        : vscode.workspace.workspaceFolders?.[0];

    const baseFolderAbsolutePath = workspaceFolder ? workspaceFolder.uri.fsPath : '';
    text = text.replace(/\$baseFolderAbsolutePath/g, baseFolderAbsolutePath);

    if (uri) {
        text = parseContextMenuVariables(uri, text);
    }
    text = text.replace(/\${pathSeparator}/g, path.sep);
    return text;
}

function parseContextMenuVariables(uri: vscode.Uri, text: string): string {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
    const clickedItemAbsolutePath = uri.fsPath;
    const clickedItemRelativePath = workspaceFolder ? vscode.workspace.asRelativePath(uri) : clickedItemAbsolutePath;

    text = text.replace(/\$clickedItemAbsolutePath/g, clickedItemAbsolutePath);
    text = text.replace(/\$clickedItemRelativePath/g, clickedItemRelativePath);

    return text;
}

function parseActiveFileVariables(activeFile: vscode.TextDocument, text: string): string {
    const absoluteFilePath = activeFile.uri.fsPath;
    const absolutePath = path.parse(absoluteFilePath);

    text = text.replace(/\${file}/g, absoluteFilePath);
    text = text.replace(/\${fileBasename}/g, absolutePath.base);
    text = text.replace(/\${fileBasenameNoExtension}/g, absolutePath.name);
    text = text.replace(/\${fileExtname}/g, absolutePath.ext);
    text = text.replace(/\${fileDirname}/g, path.dirname(absoluteFilePath));
    text = text.replace(/\${fileWorkspaceFolder}/g, vscode.workspace.getWorkspaceFolder(activeFile.uri)?.uri.fsPath || '');

    return text;
}
