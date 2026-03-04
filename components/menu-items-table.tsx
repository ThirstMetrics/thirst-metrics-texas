/**
 * Menu Items Table Component
 * Renders parsed menu items below the section editor when a section is selected.
 *
 * Features:
 * - Parse button to trigger parsing
 * - Column layout varies by section type
 * - Inline editing: click cell → input, Enter/blur saves via PUT
 * - Type toggle: cycle header_1 ↔ header_2 ↔ header_3 ↔ line_item
 * - Delete individual items
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

// ============================================
// Types
// ============================================

interface MenuItem {
  id: string;
  item_type: 'header_1' | 'header_2' | 'header_3' | 'line_item';
  sort_order: number;
  raw_text: string | null;
  bin_number: string | null;
  item_name: string | null;
  producer: string | null;
  varietal: string | null;
  appellation: string | null;
  vintage: number | null;
  format: string | null;
  price: number | null;
  price_text: string | null;
  notes: string | null;
  parent_header_id: string | null;
  product_id: string | null;
  match_status: string | null;
}

interface MenuItemsTableProps {
  sectionId: string;
  sectionType: string;
  photoId: string;
}

type EditingCell = {
  itemId: string;
  field: string;
} | null;

// ============================================
// Constants
// ============================================

const ITEM_TYPES = ['header_1', 'header_2', 'header_3', 'line_item'] as const;

const TYPE_LABELS: Record<string, string> = {
  header_1: 'H1',
  header_2: 'H2',
  header_3: 'H3',
  line_item: 'Item',
};

const TYPE_COLORS: Record<string, string> = {
  header_1: '#7c3aed',
  header_2: '#8b5cf6',
  header_3: '#a78bfa',
  line_item: '#0d7377',
};

const BRAND = {
  primary: '#0d7377',
  primaryLight: '#e6f5f5',
};

// Column configs per section category
type ColumnDef = { key: string; label: string; width: string };

function getColumns(sectionType: string): ColumnDef[] {
  switch (sectionType) {
    case 'wine_list':
    case 'wines_by_glass':
    case 'large_format_wine':
    case 'small_format_wine':
      return [
        { key: 'item_type', label: 'Type', width: '50px' },
        { key: 'bin_number', label: 'Bin#', width: '50px' },
        { key: 'item_name', label: 'Name', width: '1fr' },
        { key: 'producer', label: 'Producer', width: '120px' },
        { key: 'varietal', label: 'Varietal', width: '110px' },
        { key: 'vintage', label: 'Yr', width: '50px' },
        { key: 'format', label: 'Fmt', width: '60px' },
        { key: 'price', label: 'Price', width: '60px' },
      ];
    case 'draft_beers':
    case 'bottled_beers':
      return [
        { key: 'item_type', label: 'Type', width: '50px' },
        { key: 'item_name', label: 'Name', width: '1fr' },
        { key: 'producer', label: 'Brewery', width: '120px' },
        { key: 'varietal', label: 'Style', width: '100px' },
        { key: 'notes', label: 'ABV', width: '60px' },
        { key: 'price', label: 'Price', width: '60px' },
      ];
    case 'spirits_list':
      return [
        { key: 'item_type', label: 'Type', width: '50px' },
        { key: 'item_name', label: 'Brand / Expression', width: '1fr' },
        { key: 'producer', label: 'Producer', width: '120px' },
        { key: 'price', label: 'Price', width: '60px' },
      ];
    case 'cocktails':
      return [
        { key: 'item_type', label: 'Type', width: '50px' },
        { key: 'item_name', label: 'Name', width: '1fr' },
        { key: 'notes', label: 'Notes', width: '150px' },
        { key: 'price', label: 'Price', width: '60px' },
      ];
    case 'sake_by_glass':
    case 'sake_by_bottle':
      return [
        { key: 'item_type', label: 'Type', width: '50px' },
        { key: 'item_name', label: 'Name', width: '1fr' },
        { key: 'varietal', label: 'Grade', width: '110px' },
        { key: 'appellation', label: 'Region', width: '100px' },
        { key: 'price', label: 'Price', width: '60px' },
      ];
    default:
      return [
        { key: 'item_type', label: 'Type', width: '50px' },
        { key: 'item_name', label: 'Name', width: '1fr' },
        { key: 'price', label: 'Price', width: '60px' },
      ];
  }
}

// ============================================
// Component
// ============================================

export default function MenuItemsTable({ sectionId, sectionType, photoId }: MenuItemsTableProps) {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parseInfo, setParseInfo] = useState<{ strategy: string; lineCount: number; productsSeeded: number } | null>(null);
  const [editingCell, setEditingCell] = useState<EditingCell>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  const columns = getColumns(sectionType);

  // ----------------------------------------
  // Fetch existing items
  // ----------------------------------------

  const fetchItems = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/ocr/sections/${sectionId}/items`);
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setItems(data.items || []);
      }
    } catch (e: any) {
      setError(e.message || 'Failed to fetch items');
    } finally {
      setLoading(false);
    }
  }, [sectionId]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  // ----------------------------------------
  // Parse section
  // ----------------------------------------

  const handleParse = useCallback(async () => {
    setParsing(true);
    setError(null);
    setParseInfo(null);
    try {
      const res = await fetch(`/api/admin/ocr/sections/${sectionId}/parse`, {
        method: 'POST',
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setItems(data.items || []);
        setParseInfo({
          strategy: data.strategy,
          lineCount: data.lineCount,
          productsSeeded: data.productsSeeded || 0,
        });
      }
    } catch (e: any) {
      setError(e.message || 'Failed to parse section');
    } finally {
      setParsing(false);
    }
  }, [sectionId]);

  // Auto-parse on mount if no items exist
  useEffect(() => {
    if (!loading && items.length === 0 && !error) {
      handleParse();
    }
    // Only run when loading completes (not on every items change)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  // ----------------------------------------
  // Inline editing
  // ----------------------------------------

  const startEdit = useCallback((itemId: string, field: string) => {
    setEditingCell({ itemId, field });
    // Focus the input after render
    setTimeout(() => editInputRef.current?.focus(), 0);
  }, []);

  const saveEdit = useCallback(async (itemId: string, field: string, value: string) => {
    setEditingCell(null);

    // Find the current item
    const item = items.find(i => i.id === itemId);
    if (!item) return;

    // Convert value based on field type
    let parsedValue: any = value || null;
    if (field === 'price' && value) {
      parsedValue = parseFloat(value.replace(/[^0-9.]/g, ''));
      if (isNaN(parsedValue)) parsedValue = null;
    } else if (field === 'vintage' && value) {
      parsedValue = parseInt(value, 10);
      if (isNaN(parsedValue)) parsedValue = null;
    }

    // Skip if unchanged
    if ((item as any)[field] === parsedValue) return;

    // Optimistic update
    setItems(prev => prev.map(i =>
      i.id === itemId ? { ...i, [field]: parsedValue } : i
    ));

    try {
      const res = await fetch(`/api/admin/ocr/sections/${sectionId}/items/${itemId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: parsedValue }),
      });
      const data = await res.json();
      if (data.error) {
        console.error('Failed to save edit:', data.error);
        fetchItems(); // Revert on error
      } else if (data.item) {
        setItems(prev => prev.map(i => i.id === itemId ? data.item : i));
      }
    } catch (e) {
      console.error('Failed to save edit:', e);
      fetchItems();
    }
  }, [items, sectionId, fetchItems]);

  // ----------------------------------------
  // Type toggle
  // ----------------------------------------

  const cycleType = useCallback(async (itemId: string, direction: 'up' | 'down') => {
    const item = items.find(i => i.id === itemId);
    if (!item) return;

    const currentIdx = ITEM_TYPES.indexOf(item.item_type);
    let newIdx: number;

    if (direction === 'up') {
      newIdx = Math.max(0, currentIdx - 1);
    } else {
      newIdx = Math.min(ITEM_TYPES.length - 1, currentIdx + 1);
    }

    if (newIdx === currentIdx) return;
    const newType = ITEM_TYPES[newIdx];

    // Optimistic update
    setItems(prev => prev.map(i =>
      i.id === itemId ? { ...i, item_type: newType } : i
    ));

    try {
      await fetch(`/api/admin/ocr/sections/${sectionId}/items/${itemId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_type: newType }),
      });
    } catch (e) {
      console.error('Failed to update type:', e);
      fetchItems();
    }
  }, [items, sectionId, fetchItems]);

  // ----------------------------------------
  // Delete item
  // ----------------------------------------

  const deleteItem = useCallback(async (itemId: string) => {
    setItems(prev => prev.filter(i => i.id !== itemId));
    try {
      await fetch(`/api/admin/ocr/sections/${sectionId}/items/${itemId}`, {
        method: 'DELETE',
      });
    } catch (e) {
      console.error('Failed to delete item:', e);
      fetchItems();
    }
  }, [sectionId, fetchItems]);

  // ----------------------------------------
  // Render helpers
  // ----------------------------------------

  function renderCell(item: MenuItem, col: ColumnDef) {
    const { key } = col;

    // Type column: shows badge with up/down arrows
    if (key === 'item_type') {
      const color = TYPE_COLORS[item.item_type] || '#6b7280';
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
          <button
            onClick={(e) => { e.stopPropagation(); cycleType(item.id, 'up'); }}
            style={styles.arrowBtn}
            title="Promote (shallower header)"
          >
            ▲
          </button>
          <span style={{
            ...styles.typeBadge,
            background: `${color}15`,
            color: color,
            borderColor: color,
          }}>
            {TYPE_LABELS[item.item_type] || item.item_type}
          </span>
          <button
            onClick={(e) => { e.stopPropagation(); cycleType(item.id, 'down'); }}
            style={styles.arrowBtn}
            title="Demote (deeper header or line item)"
          >
            ▼
          </button>
        </div>
      );
    }

    // Price column: format as currency
    if (key === 'price') {
      const val = item.price;
      const display = val != null ? `$${val.toFixed(2)}` : '';

      if (editingCell?.itemId === item.id && editingCell.field === key) {
        return (
          <input
            ref={editInputRef}
            defaultValue={val != null ? String(val) : ''}
            onBlur={(e) => saveEdit(item.id, key, e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') saveEdit(item.id, key, (e.target as HTMLInputElement).value);
              if (e.key === 'Escape') setEditingCell(null);
            }}
            style={styles.editInput}
          />
        );
      }

      return (
        <span onClick={() => startEdit(item.id, key)} style={styles.editableCell}>
          {display || <span style={styles.emptyCell}>—</span>}
        </span>
      );
    }

    // Editable text fields
    const value = (item as any)[key];
    const display = value != null ? String(value) : '';

    if (editingCell?.itemId === item.id && editingCell.field === key) {
      return (
        <input
          ref={editInputRef}
          defaultValue={display}
          onBlur={(e) => saveEdit(item.id, key, e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') saveEdit(item.id, key, (e.target as HTMLInputElement).value);
            if (e.key === 'Escape') setEditingCell(null);
          }}
          style={styles.editInput}
        />
      );
    }

    return (
      <span onClick={() => startEdit(item.id, key)} style={styles.editableCell}>
        {display || <span style={styles.emptyCell}>—</span>}
      </span>
    );
  }

  // ----------------------------------------
  // Main render
  // ----------------------------------------

  const gridTemplate = columns.map(c => c.width).join(' ') + ' 30px'; // +delete button

  return (
    <div style={styles.container}>
      {/* Toolbar */}
      <div style={styles.toolbar}>
        <span style={styles.title}>
          Parsed Items {items.length > 0 && `(${items.length})`}
        </span>
        <div style={styles.toolbarRight}>
          {parseInfo && (
            <span style={styles.parseInfo}>
              {parseInfo.strategy} | {parseInfo.lineCount} lines | {parseInfo.productsSeeded} products
            </span>
          )}
          <button
            onClick={handleParse}
            disabled={parsing}
            style={{
              ...styles.parseButton,
              opacity: parsing ? 0.6 : 1,
            }}
          >
            {parsing ? 'Parsing...' : items.length > 0 ? 'Re-parse' : 'Parse'}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={styles.error}>{error}</div>
      )}

      {/* Table */}
      {items.length > 0 && (
        <div style={styles.tableWrapper}>
          {/* Header row */}
          <div style={{ ...styles.headerRow, gridTemplateColumns: gridTemplate }}>
            {columns.map(col => (
              <div key={col.key} style={styles.headerCell}>
                {col.label}
              </div>
            ))}
            <div style={styles.headerCell}></div>
          </div>

          {/* Data rows */}
          {items.map((item) => {
            const isHeader = item.item_type !== 'line_item';
            return (
              <div
                key={item.id}
                style={{
                  ...styles.dataRow,
                  gridTemplateColumns: gridTemplate,
                  background: isHeader ? '#f8f4ff' : 'white',
                  fontWeight: isHeader ? 600 : 400,
                }}
              >
                {columns.map(col => (
                  <div key={col.key} style={styles.cell}>
                    {renderCell(item, col)}
                  </div>
                ))}
                <div style={styles.cell}>
                  <button
                    onClick={() => deleteItem(item.id)}
                    style={styles.deleteBtn}
                    title="Delete item"
                  >
                    ×
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Empty state */}
      {!loading && !parsing && items.length === 0 && !error && (
        <div style={styles.empty}>
          No parsed items. Click "Parse" to extract menu items from this section.
        </div>
      )}

      {/* Loading */}
      {(loading || parsing) && items.length === 0 && (
        <div style={styles.loading}>
          {parsing ? 'Parsing section...' : 'Loading items...'}
        </div>
      )}
    </div>
  );
}

// ============================================
// Styles
// ============================================

const styles: Record<string, React.CSSProperties> = {
  container: {
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    overflow: 'hidden',
    background: 'white',
  },
  toolbar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 14px',
    background: '#f8fafc',
    borderBottom: '1px solid #e2e8f0',
    flexWrap: 'wrap',
    gap: '8px',
  },
  title: {
    fontSize: '13px',
    fontWeight: 600,
    color: '#475569',
  },
  toolbarRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  parseInfo: {
    fontSize: '11px',
    color: '#94a3b8',
  },
  parseButton: {
    padding: '5px 14px',
    borderRadius: '6px',
    border: `1px solid ${BRAND.primary}`,
    background: BRAND.primary,
    color: 'white',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: 600,
  },
  error: {
    padding: '10px 14px',
    background: '#fef2f2',
    color: '#dc2626',
    fontSize: '12px',
    borderBottom: '1px solid #fecaca',
  },
  tableWrapper: {
    overflowX: 'auto',
  },
  headerRow: {
    display: 'grid',
    borderBottom: '2px solid #e2e8f0',
    minWidth: '600px',
  },
  headerCell: {
    padding: '6px 8px',
    fontSize: '11px',
    fontWeight: 600,
    color: '#64748b',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },
  dataRow: {
    display: 'grid',
    borderBottom: '1px solid #f1f5f9',
    minWidth: '600px',
    transition: 'background 0.1s',
  },
  cell: {
    padding: '4px 8px',
    fontSize: '12px',
    color: '#1e293b',
    display: 'flex',
    alignItems: 'center',
    minHeight: '28px',
    overflow: 'hidden',
  },
  editableCell: {
    cursor: 'pointer',
    width: '100%',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  emptyCell: {
    color: '#cbd5e1',
  },
  editInput: {
    width: '100%',
    padding: '2px 4px',
    border: `1px solid ${BRAND.primary}`,
    borderRadius: '3px',
    fontSize: '12px',
    outline: 'none',
    background: '#f0fdfa',
  },
  typeBadge: {
    display: 'inline-block',
    padding: '1px 5px',
    borderRadius: '4px',
    fontSize: '10px',
    fontWeight: 700,
    border: '1px solid',
    whiteSpace: 'nowrap' as const,
    minWidth: '28px',
    textAlign: 'center' as const,
  },
  arrowBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '0 1px',
    fontSize: '8px',
    color: '#94a3b8',
    lineHeight: 1,
  },
  deleteBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: '#dc2626',
    fontSize: '16px',
    fontWeight: 700,
    lineHeight: 1,
    padding: '0 4px',
    opacity: 0.5,
  },
  empty: {
    padding: '20px',
    textAlign: 'center' as const,
    color: '#94a3b8',
    fontSize: '13px',
  },
  loading: {
    padding: '20px',
    textAlign: 'center' as const,
    color: '#64748b',
    fontSize: '13px',
  },
};
