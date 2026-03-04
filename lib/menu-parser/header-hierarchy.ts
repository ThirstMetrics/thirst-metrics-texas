/**
 * Header Hierarchy Builder
 * Uses a stack-based walk to assign parent_header_id to items.
 *
 * Headers form a tree: header_1 > header_2 > header_3 > line_items.
 * Each item is assigned the nearest ancestor header as its parent.
 */

import { ParsedMenuItem, ItemType } from './types';

const HEADER_DEPTH: Record<ItemType, number> = {
  header_1: 1,
  header_2: 2,
  header_3: 3,
  line_item: 4,
};

interface HeaderStackEntry {
  index: number;       // index into the items array
  depth: number;       // header depth (1, 2, or 3)
}

/**
 * Assign parent_header_id references based on header hierarchy.
 * Returns a mapping of item index → parent item index (or -1 for no parent).
 *
 * Algorithm: maintain a stack of open headers. When encountering:
 * - A header: pop stack until we find a shallower header (or empty), push this header
 * - A line_item: its parent is the top of the stack (if any)
 */
export function buildHierarchy(items: ParsedMenuItem[]): Map<number, number> {
  const parentMap = new Map<number, number>();
  const stack: HeaderStackEntry[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const depth = HEADER_DEPTH[item.item_type];

    if (item.item_type !== 'line_item') {
      // This is a header — pop stack until we find a shallower header
      while (stack.length > 0 && stack[stack.length - 1].depth >= depth) {
        stack.pop();
      }
      // Parent is top of stack (if any)
      if (stack.length > 0) {
        parentMap.set(i, stack[stack.length - 1].index);
      } else {
        parentMap.set(i, -1);
      }
      // Push this header onto stack
      stack.push({ index: i, depth });
    } else {
      // Line item — parent is top of stack
      if (stack.length > 0) {
        parentMap.set(i, stack[stack.length - 1].index);
      } else {
        parentMap.set(i, -1);
      }
    }
  }

  return parentMap;
}
