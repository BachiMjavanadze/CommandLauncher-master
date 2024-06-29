import * as vscode from 'vscode';
import * as path from 'path';
import { Action, getInnerVariables } from "../config/Configuration";

export class VariableSubstituter {
    action: Action;
    innerVariables: { [key: string]: string; };

    constructor(action: Action) {
        this.action = action;
        this.innerVariables = getInnerVariables();
    }

    private getDefaultPath(): string {
        const config = vscode.workspace.getConfiguration('files.dialog');
        const defaultPath = config.get<string>('defaultPath');
        if (defaultPath) {
            return defaultPath;
        }

        // If no default path is set, fallback to the workspace root or user's home directory
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        return workspaceFolder ? workspaceFolder.uri.fsPath : process.env.HOME || process.env.USERPROFILE || '';
    }

    async substitute(command: string, uri?: vscode.Uri): Promise<string> {
        command = this.substituteInnerVariables(command);
        command = await this.substituteChooseRootFolder(command);
        command = parse(command, uri);
        if (this.action.preCommand !== undefined) {
            this.action.preCommand = this.substituteInnerVariables(this.action.preCommand);
            this.action.preCommand = await this.substituteChooseRootFolder(this.action.preCommand);
            this.action.preCommand = parse(this.action.preCommand, uri);
        }
        return command;
    }

    private substituteInnerVariables(text: string): string {
        for (const [key, value] of Object.entries(this.innerVariables)) {
            text = text.replace(new RegExp(key.replace('$', '\\$'), 'g'), value);
        }
        return text;
    }

    private async showFolderPicker(placeholder: string, defaultPath: string): Promise<string | undefined> {
        const quickPick = vscode.window.createQuickPick();
        quickPick.placeholder = placeholder;
        quickPick.ignoreFocusOut = true;
    
        const folderButton: vscode.QuickInputButton = {
            iconPath: new vscode.ThemeIcon('folder'),
            tooltip: 'Select folder'
        };
    
        quickPick.buttons = [folderButton];
    
        return new Promise((resolve) => {
            quickPick.onDidAccept(() => {
                const value = quickPick.value || defaultPath;
                quickPick.hide();
                resolve(value);
            });
    
            quickPick.onDidHide(() => resolve(undefined));
    
            quickPick.onDidTriggerButton(async (button) => {
                if (button === folderButton) {
                    const folderUri = await vscode.window.showOpenDialog({
                        canSelectFiles: false,
                        canSelectFolders: true,
                        canSelectMany: false,
                        openLabel: 'Select Root Folder',
                        defaultUri: vscode.Uri.file(defaultPath)
                    });
                    if (folderUri && folderUri[0]) {
                        quickPick.value = folderUri[0].fsPath;
                    }
                }
            });
    
            quickPick.show();
        });
    }

    private async substituteChooseRootFolder(command: string): Promise<string> {
        const regex = /\$chooseRootFolder/g;
        if (regex.test(command)) {
            const defaultPath = this.getDefaultPath();
            const folderPath = await this.showFolderPicker('Select or enter root folder', defaultPath);
            if (folderPath === undefined) {
                // User cancelled the folder selection
                throw new Error('Folder selection cancelled');
            }
            const convertedPath = this.convertPathForBash(folderPath);
            return command.replace(regex, `"${convertedPath}"`);
        }
        return command;
    }

    private convertPathForBash(path: string): string {
        const terminal = vscode.window.activeTerminal;
        if (terminal && terminal.name.toLowerCase().includes('bash')) {
            // Convert Windows path to Bash-compatible path
            path = path.replace(/\\/g, '/'); // Replace backslashes with forward slashes
            path = path.replace(/^([A-Za-z]):/, '//$1'); // Convert drive letter to network path style
            path = path.toLowerCase(); // Bash paths are case-sensitive, so we'll use lowercase
            return path;
        }
        return path;
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
