// ValueStorage.ts
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { Action, Variable } from '../config/Configuration';

interface StorageData {
    [groupName: string]: {
        [actionLabel: string]: {
            [varName: string]: string | string[];
        };
    };
}

export class ValueStorage {
    private static readonly STORAGE_FILE = '.vscode/terminal_snippets_temp.json';

    private static getStorageFilePath(): string {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            throw new Error('No workspace folder found');
        }
        return path.join(workspaceFolders[0].uri.fsPath, this.STORAGE_FILE);
    }

    private static readStorageFile(): StorageData {
        const filePath = this.getStorageFilePath();
        if (!fs.existsSync(filePath)) {
            return {};
        }
        try {
            const data = fs.readFileSync(filePath, 'utf8');
            return JSON.parse(data) as StorageData;
        } catch (error) {
            this.showErrorMessage();
            throw new Error('Storage file is damaged');
        }
    }

    private static showErrorMessage(): void {
        vscode.window.showErrorMessage(
            "'.vscode/terminal_snippets_temp.jsonc' is damaged. Please fix or delete it (it will be recreated next time).",
            { modal: true }
        );
    }

    private static writeStorageFile(data: StorageData): void {
        const filePath = this.getStorageFilePath();
        const dirPath = path.dirname(filePath);
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
        }
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    }

    public static storeValues(action: Action, variables: { [key: string]: string | string[] }): void {
        const data = this.readStorageFile();
        if (data === null) return;

        const groupName = action.group || 'Ungrouped';
        const label = action.label || action.command;
        
        if (!data[groupName]) {
            data[groupName] = {};
        }
        if (!data[groupName][label]) {
            data[groupName][label] = {};
        }

        for (const [varName, value] of Object.entries(variables)) {
            data[groupName][label][varName] = value;
        }

        this.writeStorageFile(data);
    }

    public static getStoredValues(group: string, label: string): { [key: string]: string | string[] } | undefined | null {
        const data = this.readStorageFile();
        if (data === null) return null;
        return data[group]?.[label];
    }

    public static getStoredValueForVariable(action: Action, varName: string): string | string[] | undefined {
        const data = this.readStorageFile();
        if (data === null) return undefined;

        const groupName = action.group || 'Ungrouped';
        const actionLabel = action.label || action.command;
        
        if (action.searchStoredValueInCurrentGroup) {
            return data[groupName]?.[actionLabel]?.[varName];
        } else {
            for (const group of Object.values(data)) {
                for (const actionData of Object.values(group)) {
                    if (varName in actionData) {
                        return actionData[varName];
                    }
                }
            }
        }
        return undefined;
    }

    public static updateDefaultValue(action: Action, varName: string, variable: Variable): void {
        if (variable.defaultValue?.setStoredValueAsDefault) {
            const storedValue = this.getStoredValueForVariable(action, varName);
            if (storedValue !== undefined) {
                if (Array.isArray(storedValue) && storedValue.length > 0) {
                    variable.defaultValue.value = storedValue[0];
                } else if (typeof storedValue === 'string') {
                    variable.defaultValue.value = storedValue;
                }
            }
        }
    }
}
