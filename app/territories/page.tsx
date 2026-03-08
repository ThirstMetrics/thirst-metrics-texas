/**
 * Territory Management Page
 * Manager/admin view: list, create, edit, delete territories and assign users.
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import TerritoryForm from '@/components/territory-form';
import { useIsMobile } from '@/lib/hooks/use-media-query';

interface TerritoryUser {
  id: string;
  role: string;
  email?: string;
}

interface Territory {
  id: string;
  name: string;
  county_codes: string[] | null;
  zip_codes: string[] | null;
  assigned_user_id: string | null;
  created_at: string;
  assigned_user?: TerritoryUser | null;
}

export default function TerritoriesPage() {
  const router = useRouter();
  const isMobile = useIsMobile();

  const [territories, setTerritories] = useState<Territory[]>([]);
  const [users, setUsers] = useState<TerritoryUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editTerritory, setEditTerritory] = useState<Territory | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchTerritories = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/territories');
      if (res.status === 401) {
        router.push('/login?redirect=/territories');
        return;
      }
      if (res.status === 403) {
        router.push('/dashboard');
        return;
      }
      if (!res.ok) throw new Error('Failed to fetch territories');
      const data = await res.json();
      setTerritories(data.territories || []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load territories';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [router]);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch('/api/territories/users');
      if (!res.ok) return;
      const data = await res.json();
      setUsers(data.users || []);
    } catch {
      // Non-fatal: user list is optional for display
    }
  }, []);

  useEffect(() => {
    fetchTerritories();
    fetchUsers();
  }, [fetchTerritories, fetchUsers]);

  const handleDelete = async (territoryId: string, name: string) => {
    if (!confirm(`Delete territory "${name}"? This will unlink any assigned users.`)) return;
    setDeletingId(territoryId);
    try {
      const res = await fetch(`/api/territories/${territoryId}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to delete');
      }
      setTerritories((prev) => prev.filter((t) => t.id !== territoryId));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete territory';
      alert(msg);
    } finally {
      setDeletingId(null);
    }
  };

  const handleFormSuccess = () => {
    setShowForm(false);
    setEditTerritory(null);
    fetchTerritories();
  };

  const formatCodes = (codes: string[] | null, max = 5): string => {
    if (!codes || codes.length === 0) return 'None';
    if (codes.length <= max) return codes.join(', ');
    return `${codes.slice(0, max).join(', ')} +${codes.length - max} more`;
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f4f5f7' }}>
      {/* Page Header */}
      <div style={styles.pageHeader}>
        <div style={styles.pageHeaderContent}>
          <h1 style={styles.headerTitle}>Territory Management</h1>
          <p style={styles.headerSubtitle}>
            Define sales regions and assign team members
          </p>
        </div>
      </div>

      {/* Content */}
      <div
        style={{
          ...styles.content,
          padding: isMobile ? '16px' : '24px',
        }}
      >
        {/* Toolbar */}
        <div
          style={{
            ...styles.toolbar,
            flexDirection: isMobile ? 'column' : 'row',
            alignItems: isMobile ? 'flex-start' : 'center',
          }}
        >
          <div>
            <span style={styles.countLabel}>
              {territories.length} {territories.length === 1 ? 'territory' : 'territories'}
            </span>
          </div>
          <button
            onClick={() => {
              setEditTerritory(null);
              setShowForm(true);
            }}
            style={styles.addButton}
          >
            + Add Territory
          </button>
        </div>

        {/* Error */}
        {error && <div style={styles.errorBox}>{error}</div>}

        {/* Loading */}
        {loading && (
          <div style={styles.loadingContainer}>
            <p>Loading territories...</p>
          </div>
        )}

        {/* Empty State */}
        {!loading && territories.length === 0 && !error && (
          <div style={styles.emptyState}>
            <div style={styles.emptyIcon}>T</div>
            <p style={styles.emptyTitle}>No territories yet</p>
            <p style={styles.emptyText}>
              Create your first territory to start assigning sales regions to team members.
            </p>
            <button
              onClick={() => {
                setEditTerritory(null);
                setShowForm(true);
              }}
              style={styles.addButton}
            >
              + Create Territory
            </button>
          </div>
        )}

        {/* Territory Cards Grid */}
        {!loading && territories.length > 0 && (
          <div
            style={{
              ...styles.grid,
              gridTemplateColumns: isMobile
                ? '1fr'
                : 'repeat(auto-fill, minmax(360px, 1fr))',
            }}
          >
            {territories.map((territory) => (
              <div key={territory.id} style={styles.card}>
                {/* Card Header */}
                <div style={styles.cardHeader}>
                  <div style={styles.cardIcon}>T</div>
                  <div style={styles.cardHeaderInfo}>
                    <h3 style={styles.cardTitle}>{territory.name}</h3>
                    <span
                      style={{
                        ...styles.assignedBadge,
                        background: territory.assigned_user_id
                          ? '#dcfce7'
                          : '#f3f4f6',
                        color: territory.assigned_user_id ? '#166534' : '#6b7280',
                      }}
                    >
                      {territory.assigned_user?.email
                        ? territory.assigned_user.email
                        : territory.assigned_user_id
                        ? 'Assigned'
                        : 'Unassigned'}
                    </span>
                  </div>
                </div>

                {/* Details */}
                <div style={styles.detailsSection}>
                  <div style={styles.detailRow}>
                    <span style={styles.detailLabel}>Counties</span>
                    <span style={styles.detailValue}>
                      {formatCodes(territory.county_codes)}
                    </span>
                  </div>
                  <div style={styles.detailRow}>
                    <span style={styles.detailLabel}>ZIPs</span>
                    <span style={styles.detailValue}>
                      {formatCodes(territory.zip_codes)}
                    </span>
                  </div>
                  {territory.assigned_user && (
                    <div style={styles.detailRow}>
                      <span style={styles.detailLabel}>Role</span>
                      <span style={styles.detailValue}>
                        {territory.assigned_user.role}
                      </span>
                    </div>
                  )}
                  <div style={styles.detailRow}>
                    <span style={styles.detailLabel}>Created</span>
                    <span style={styles.detailValue}>
                      {new Date(territory.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div style={styles.cardActions}>
                  <button
                    onClick={() => {
                      setEditTerritory(territory);
                      setShowForm(true);
                    }}
                    style={styles.editButton}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(territory.id, territory.name)}
                    disabled={deletingId === territory.id}
                    style={styles.deleteButton}
                  >
                    {deletingId === territory.id ? '...' : 'Delete'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Territory Form Modal */}
      {showForm && (
        <TerritoryForm
          onSuccess={handleFormSuccess}
          onCancel={() => {
            setShowForm(false);
            setEditTerritory(null);
          }}
          users={users}
          editTerritory={editTerritory}
        />
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  pageHeader: {
    background: 'linear-gradient(135deg, #0d7377 0%, #0a5f63 100%)',
    padding: '24px',
  },
  pageHeaderContent: {
    maxWidth: '1400px',
    margin: '0 auto',
  },
  headerTitle: {
    fontSize: '28px',
    fontWeight: '700',
    color: 'white',
    margin: 0,
  },
  headerSubtitle: {
    fontSize: '14px',
    color: 'rgba(255,255,255,0.8)',
    marginTop: '4px',
    marginBottom: 0,
  },
  content: {
    maxWidth: '1400px',
    margin: '0 auto',
    padding: '24px',
  },
  toolbar: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '12px',
    marginBottom: '20px',
  },
  countLabel: {
    fontSize: '14px',
    color: '#666',
    fontWeight: '500',
  },
  addButton: {
    padding: '10px 20px',
    background: '#0d7377',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  errorBox: {
    padding: '12px',
    background: '#fee',
    color: '#c33',
    borderRadius: '6px',
    marginBottom: '16px',
    fontSize: '14px',
  },
  loadingContainer: {
    textAlign: 'center',
    padding: '40px',
    color: '#666',
  },
  emptyState: {
    textAlign: 'center',
    padding: '60px 20px',
    background: 'white',
    borderRadius: '12px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
  },
  emptyIcon: {
    width: '56px',
    height: '56px',
    borderRadius: '14px',
    background: 'linear-gradient(135deg, #0d7377 0%, #042829 100%)',
    color: 'white',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '24px',
    fontWeight: '700',
    margin: '0 auto 16px',
  },
  emptyTitle: {
    fontSize: '18px',
    fontWeight: '600',
    color: '#333',
    margin: '0 0 8px',
  },
  emptyText: {
    color: '#666',
    marginBottom: '24px',
    fontSize: '14px',
    maxWidth: '360px',
    margin: '0 auto 24px',
  },
  grid: {
    display: 'grid',
    gap: '16px',
  },
  card: {
    background: 'white',
    borderRadius: '12px',
    padding: '20px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '16px',
  },
  cardIcon: {
    width: '40px',
    height: '40px',
    borderRadius: '10px',
    background: 'linear-gradient(135deg, #0d7377 0%, #042829 100%)',
    color: 'white',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: '700',
    fontSize: '16px',
    flexShrink: 0,
  },
  cardHeaderInfo: {
    flex: 1,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '8px',
    minWidth: 0,
  },
  cardTitle: {
    fontSize: '16px',
    fontWeight: '600',
    color: '#333',
    margin: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  assignedBadge: {
    fontSize: '11px',
    padding: '3px 10px',
    borderRadius: '12px',
    fontWeight: '500',
    whiteSpace: 'nowrap',
    flexShrink: 0,
    maxWidth: '160px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  detailsSection: {
    marginBottom: '16px',
    borderTop: '1px solid #f0f0f0',
    paddingTop: '12px',
  },
  detailRow: {
    display: 'flex',
    gap: '8px',
    marginBottom: '6px',
    alignItems: 'flex-start',
  },
  detailLabel: {
    fontSize: '12px',
    fontWeight: '600',
    color: '#888',
    width: '68px',
    flexShrink: 0,
    paddingTop: '1px',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  },
  detailValue: {
    fontSize: '13px',
    color: '#444',
    flex: 1,
    wordBreak: 'break-word',
  },
  cardActions: {
    display: 'flex',
    gap: '8px',
    borderTop: '1px solid #f0f0f0',
    paddingTop: '12px',
  },
  editButton: {
    padding: '6px 14px',
    background: '#f0fdf4',
    color: '#0d7377',
    border: '1px solid #0d7377',
    borderRadius: '6px',
    fontSize: '13px',
    cursor: 'pointer',
    fontWeight: '500',
  },
  deleteButton: {
    padding: '6px 14px',
    background: '#fef2f2',
    color: '#ef4444',
    border: '1px solid #ef4444',
    borderRadius: '6px',
    fontSize: '13px',
    cursor: 'pointer',
    marginLeft: 'auto',
  },
};
