/**
 * Territory Form Component
 * Modal form for creating and editing territories.
 */

'use client';

import { useState } from 'react';
import { useIsMobile } from '@/lib/hooks/use-media-query';

interface TerritoryUser {
  id: string;
  role: string;
  email?: string;
}

interface TerritoryFormProps {
  onSuccess: () => void;
  onCancel: () => void;
  users: TerritoryUser[];
  editTerritory?: {
    id: string;
    name: string;
    county_codes: string[] | null;
    zip_codes: string[] | null;
    assigned_user_id: string | null;
  } | null;
}

export default function TerritoryForm({
  onSuccess,
  onCancel,
  users,
  editTerritory,
}: TerritoryFormProps) {
  const isMobile = useIsMobile();
  const isEdit = !!editTerritory;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(editTerritory?.name || '');
  const [countyCodes, setCountyCodes] = useState(
    (editTerritory?.county_codes || []).join(', ')
  );
  const [zipCodes, setZipCodes] = useState(
    (editTerritory?.zip_codes || []).join(', ')
  );
  const [assignedUserId, setAssignedUserId] = useState(
    editTerritory?.assigned_user_id || ''
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (!name.trim()) {
      setError('Territory name is required');
      setLoading(false);
      return;
    }

    const payload: Record<string, unknown> = {
      name: name.trim(),
      county_codes: countyCodes.split(',').map((v) => v.trim()).filter(Boolean),
      zip_codes: zipCodes.split(',').map((v) => v.trim()).filter(Boolean),
      assigned_user_id: assignedUserId || null,
    };

    try {
      let res: Response;

      if (isEdit) {
        res = await fetch(`/api/territories/${editTerritory!.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch('/api/territories', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save territory');
      }

      onSuccess();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Something went wrong';
      setError(msg);
      setLoading(false);
    }
  };

  return (
    <div style={styles.overlay} onClick={onCancel}>
      <div
        style={{
          ...styles.modal,
          ...(isMobile ? { width: '95%', padding: '16px' } : {}),
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <form onSubmit={handleSubmit}>
          <div style={styles.header}>
            <h2 style={styles.title}>
              {isEdit ? 'Edit Territory' : 'Add Territory'}
            </h2>
            <button type="button" onClick={onCancel} style={styles.closeButton}>
              ×
            </button>
          </div>

          {error && <div style={styles.error}>{error}</div>}

          <div style={styles.field}>
            <label style={styles.label}>Territory Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="e.g. Dallas Metro North"
              style={styles.input}
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>County Codes</label>
            <input
              type="text"
              value={countyCodes}
              onChange={(e) => setCountyCodes(e.target.value)}
              placeholder="e.g. 057, 113, 085"
              style={styles.input}
            />
            <span style={styles.hint}>Comma-separated 3-digit Texas county codes</span>
          </div>

          <div style={styles.field}>
            <label style={styles.label}>ZIP Codes</label>
            <input
              type="text"
              value={zipCodes}
              onChange={(e) => setZipCodes(e.target.value)}
              placeholder="e.g. 75201, 75202, 75203"
              style={styles.input}
            />
            <span style={styles.hint}>Comma-separated ZIP codes</span>
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Assigned Salesperson</label>
            <select
              value={assignedUserId}
              onChange={(e) => setAssignedUserId(e.target.value)}
              style={styles.select}
            >
              <option value="">— Unassigned —</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.email || u.id} ({u.role})
                </option>
              ))}
            </select>
          </div>

          <div style={styles.actions}>
            <button type="submit" disabled={loading} style={styles.submitButton}>
              {loading ? 'Saving...' : isEdit ? 'Update Territory' : 'Create Territory'}
            </button>
            <button type="button" onClick={onCancel} style={styles.cancelButton}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modal: {
    background: 'white',
    borderRadius: '12px',
    padding: '24px',
    width: '480px',
    maxWidth: '95vw',
    maxHeight: '90vh',
    overflowY: 'auto',
    boxShadow: '0 8px 30px rgba(0,0,0,0.2)',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px',
  },
  title: {
    fontSize: '20px',
    fontWeight: '600',
    color: '#333',
    margin: 0,
  },
  closeButton: {
    background: 'none',
    border: 'none',
    fontSize: '24px',
    color: '#999',
    cursor: 'pointer',
    padding: '4px 8px',
    lineHeight: 1,
  },
  error: {
    padding: '10px 12px',
    background: '#fee',
    color: '#c33',
    borderRadius: '6px',
    marginBottom: '16px',
    fontSize: '14px',
  },
  field: {
    marginBottom: '16px',
  },
  label: {
    display: 'block',
    marginBottom: '6px',
    fontSize: '14px',
    fontWeight: '500',
    color: '#333',
  },
  input: {
    width: '100%',
    padding: '10px 12px',
    border: '1px solid #ddd',
    borderRadius: '6px',
    fontSize: '14px',
    boxSizing: 'border-box' as const,
  },
  select: {
    width: '100%',
    padding: '10px 12px',
    border: '1px solid #ddd',
    borderRadius: '6px',
    fontSize: '14px',
    boxSizing: 'border-box' as const,
    background: 'white',
  },
  hint: {
    display: 'block',
    marginTop: '4px',
    fontSize: '12px',
    color: '#888',
  },
  actions: {
    display: 'flex',
    gap: '12px',
    justifyContent: 'flex-end',
    marginTop: '20px',
  },
  submitButton: {
    padding: '10px 20px',
    background: '#0d7377',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
  },
  cancelButton: {
    padding: '10px 20px',
    background: '#999',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    fontSize: '14px',
    cursor: 'pointer',
  },
};
