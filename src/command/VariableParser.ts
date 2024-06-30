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
        command = this.parse(command, uri);
        if (this.action.preCommand !== undefined) {
            this.action.preCommand = this.substituteInnerVariables(this.action.preCommand);
            this.action.preCommand = await this.substituteChooseRootFolder(this.action.preCommand);
            this.action.preCommand = this.parse(this.action.preCommand, uri);
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
        return new Promise<string | undefined>((resolve) => {
            const quickPick = vscode.window.createQuickPick();
            quickPick.placeholder = placeholder;
            quickPick.ignoreFocusOut = true;
    
            const folderItem: vscode.QuickPickItem = {
                label: '$(folder) Select folder',
                alwaysShow: true
            };
    
            const updateItems = (value: string) => {
                quickPick.items = [
                    folderItem,
                    ...(value ? [{ label: value, description: 'Current input' }] : [])
                ];
            };
    
            updateItems('');
    
            quickPick.onDidChangeValue((value) => {
                updateItems(value);
            });
    
            quickPick.onDidAccept(() => {
                const value = quickPick.value;
                if (value) {
                    quickPick.hide();
                    resolve(value);
                }
            });
    
            quickPick.onDidHide(() => {
                resolve(undefined);
            });
    
            quickPick.onDidChangeSelection(async (items) => {
                if (items[0] === folderItem) {
                    const folderUri = await vscode.window.showOpenDialog({
                        canSelectFiles: false,
                        canSelectFolders: true,
                        canSelectMany: false,
                        openLabel: 'Select Root Folder',
                        defaultUri: vscode.Uri.file(defaultPath)
                    });
                    if (folderUri && folderUri[0]) {
                        const selectedPath = folderUri[0].fsPath;
                        quickPick.value = selectedPath;
                        updateItems(selectedPath);
                    }
                }
            });
    
            quickPick.show();
        });
    }

    private async substituteChooseRootFolder(command: string): Promise<string> {
        const regex = /\$chooseRootFolder([/\\][^"'\s]+)?/g;
        if (regex.test(command)) {
            const defaultPath = this.getDefaultPath();
            const folderPath = await this.showFolderPicker('Select or enter root folder', defaultPath);
            if (folderPath === undefined) {
                // User cancelled the folder selection
                throw new Error('Folder selection cancelled');
            }
            return command.replace(regex, (match) => {
                const fullPath = match.replace('$chooseRootFolder', folderPath);
                return quoteWindowsPath(fullPath);
            });
        }
        return command;
    }

    private parse(text: string, uri?: vscode.Uri): string {
        const activeFile = vscode.window.activeTextEditor?.document;
        if (activeFile !== undefined) {
            text = this.parseActiveFileVariables(activeFile, text);
        }

        const workspaceFolder = uri
            ? vscode.workspace.getWorkspaceFolder(uri)
            : vscode.workspace.workspaceFolders?.[0];

        const baseFolderAbsolutePath = workspaceFolder ? workspaceFolder.uri.fsPath : '';
        
        // Handle $baseFolderAbsolutePath
        text = text.replace(/\$baseFolderAbsolutePath([/\\][^"'\s]+)?/g, (match) => {
            const fullPath = match.replace('$baseFolderAbsolutePath', baseFolderAbsolutePath);
            return quoteWindowsPath(fullPath);
        });

        if (uri) {
            text = this.parseContextMenuVariables(uri, text);
        }
        text = text.replace(/\${pathSeparator}/g, path.sep);
        return text;
    }

    private parseContextMenuVariables(uri: vscode.Uri, text: string): string {
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
        const clickedItemAbsolutePath = uri.fsPath;
        const clickedItemRelativePath = workspaceFolder ? vscode.workspace.asRelativePath(uri) : clickedItemAbsolutePath;

        text = text.replace(/\$clickedItemAbsolutePath([/\\][^"'\s]+)?/g, (match) => {
            const fullPath = match.replace('$clickedItemAbsolutePath', clickedItemAbsolutePath);
            return quoteWindowsPath(fullPath);
        });
        text = text.replace(/\$clickedItemRelativePath([/\\][^"'\s]+)?/g, (match) => {
            const fullPath = match.replace('$clickedItemRelativePath', clickedItemRelativePath);
            return quoteWindowsPath(fullPath);
        });

        return text;
    }

    private parseActiveFileVariables(activeFile: vscode.TextDocument, text: string): string {
        const absoluteFilePath = activeFile.uri.fsPath;
        const absolutePath = path.parse(absoluteFilePath);

        text = text.replace(/\${file}([/\\][^"'\s]+)?/g, (match) => {
            const fullPath = match.replace('${file}', absoluteFilePath);
            return quoteWindowsPath(fullPath);
        });
        text = text.replace(/\${fileBasename}/g, absolutePath.base);
        text = text.replace(/\${fileBasenameNoExtension}/g, absolutePath.name);
        text = text.replace(/\${fileExtname}/g, absolutePath.ext);
        text = text.replace(/\${fileDirname}([/\\][^"'\s]+)?/g, (match) => {
            const fullPath = match.replace('${fileDirname}', path.dirname(absoluteFilePath));
            return quoteWindowsPath(fullPath);
        });
        text = text.replace(/\${fileWorkspaceFolder}([/\\][^"'\s]+)?/g, (match) => {
            const workspaceFolder = vscode.workspace.getWorkspaceFolder(activeFile.uri);
            if (workspaceFolder) {
                const fullPath = match.replace('${fileWorkspaceFolder}', workspaceFolder.uri.fsPath);
                return quoteWindowsPath(fullPath);
            }
            return '';
        });

        return text;
    }
}

function quoteWindowsPath(windowsPath: string): string {
    // Remove any existing quotes
    windowsPath = windowsPath.replace(/^"(.*)"$/, '$1');
    // Escape any existing double quotes
    windowsPath = windowsPath.replace(/"/g, '\\"');
    // Ensure the path uses backslashes
    windowsPath = windowsPath.replace(/\//g, '\\');
    return `"${windowsPath}"`;
}
