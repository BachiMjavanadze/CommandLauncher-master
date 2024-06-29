import { Action } from "../config/Configuration";
import { loadActions } from "../config/JsonDecoder";
import { CommandTreeProvider, Item } from "./CommandTree";
import { TogglerCommand, getTogglerState, loadTogglerCommands } from '../config/TogglerCommand';

export function buildCommandTreeProvider(): CommandTreeProvider {
    return new CommandTreeProvider(loadItems());
}

export function loadItems(): Item[] {
    const actions = loadActions().filter(action => !action.isContextMenuCommand);
    const togglerCommands = loadTogglerCommands();
    const groups = findGroups(actions, togglerCommands);
    return buildItems(groups);
}

function findGroups(actions: Action[], togglerCommands: TogglerCommand[]): Map<string, (Action | TogglerCommand)[]> {
    const groups = new Map<string, (Action | TogglerCommand)[]>();
    
    actions.forEach(v => {
        const groupName = v.group || 'Ungrouped';
        if (groups.has(groupName)) {
            groups.get(groupName)!.push(v);
        } else {
            groups.set(groupName, [v]);
        }
    });

    togglerCommands.forEach(tc => {
        if (groups.has(tc.group)) {
            groups.get(tc.group)!.push(tc);
        } else {
            groups.set(tc.group, [tc]);
        }
    });

    return groups;
}

function buildItems(groups: Map<string, (Action | TogglerCommand)[]>): Item[] {
  const items: Item[] = [];
  const sortedGroups = new Map([...groups.entries()].sort((a, b) => {
      if (a[0] === 'Ungrouped') return 1;
      if (b[0] === 'Ungrouped') return -1;
      return a[0].localeCompare(b[0]);
  }));

  sortedGroups.forEach((groupItems, groupName) => {
      const children = groupItems
          .filter(item => {
              if ('command1' in item) {
                  return item.showOnExplorer !== false;
              } else {
                  return (item as Action).showOnExplorer !== false;
              }
          })
          .map(item => {
              if ('command1' in item && 'command2' in item) {
                  // This is a TogglerCommand
                  const isFirstState = !getTogglerState(groupName, item.command1.label);
                  return new Item(
                      isFirstState ? item.command1.label : item.command2.label,
                      undefined,
                      undefined,
                      item
                  );
              } else {
                  // This is a regular Action
                  return new Item(buildLabel(item as Action), item as Action);
              }
          });
      if (children.length > 0) {
          items.push(new Item(groupName, undefined, children));
      }
  });
  return items;
}

function buildLabel(action: Action) {
    if (action.label === undefined) {
        return action.command;
    }
    return action.label.length ? action.label : action.command;
}
