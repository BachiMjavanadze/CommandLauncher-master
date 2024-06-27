import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { Action } from '../config/Configuration';

interface StorageData {
    [actionLabel: string]: {
        [varName: string]: string | string[];
    };
}

export class ValueStorage {
    private static readonly STORAGE_FILE = '.vscode/terminal_snippets_temp.jsonc';

    private static getStorageFilePath(): string {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            throw new Error('No workspace folder found');
        }
        return path.join(workspaceFolders[0].uri.fsPath, this.STORAGE_FILE);
    }

    private static readStorageFile(): StorageData | null {
        const filePath = this.getStorageFilePath();
        if (!fs.existsSync(filePath)) {
            return {};
        }
        try {
            const data = fs.readFileSync(filePath, 'utf8');
            return JSON.parse(data) as StorageData;
        } catch (error) {
            this.showErrorMessage();
            return null;
        }
    }

    private static writeStorageFile(data: StorageData): void {
        const filePath = this.getStorageFilePath();
        const dirPath = path.dirname(filePath);
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
        }
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    }

    private static showErrorMessage(): void {
        vscode.window.showErrorMessage(
            "'.vscode/terminal_snippets_temp.jsonc' is damaged. Please fix or delete it (it will be recreated next time).",
            { modal: false }
        );
    }

    public static storeValues(action: Action, variables: { [key: string]: string }): void {
        const data = this.readStorageFile();
        if (data === null) return; // Don't store if file is damaged

        const label = action.label || action.command;
        
        if (!data[label]) {
            data[label] = {};
        }

        for (const [varName, value] of Object.entries(variables)) {
            const varDetails = action.variables?.[varName];
            if (varDetails && varDetails.options) {
                if (!data[label][varName]) {
                    data[label][varName] = varDetails.options.slice();
                }
                if (Array.isArray(data[label][varName])) {
                    if (!(data[label][varName] as string[]).includes(value)) {
                        (data[label][varName] as string[]).unshift(value);
                    }
                }
            } else {
                data[label][varName] = value;
            }
        }

        this.writeStorageFile(data);
    }

    public static getStoredValues(label: string): { [key: string]: string | string[] } | undefined | null {
        const data = this.readStorageFile();
        if (data === null) return null; // Indicate damaged file
        return data[label];
    }

    public static getStoredValueForVariable(varName: string): string | string[] | undefined {
        const data = this.readStorageFile();
        if (data === null) return undefined;

        for (const actionData of Object.values(data)) {
            if (actionData[varName] !== undefined) {
                return actionData[varName];
            }
        }

        return undefined;
    }
}
