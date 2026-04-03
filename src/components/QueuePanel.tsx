import { RefreshCcw, Trash2, RotateCcw } from 'lucide-react'
import type { SegmentRow } from '@/types/electron'

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

const STATUS_COLORS: Record<SegmentRow['status'], string> = {
  pending: '#94a3b8',
  uploading: '#60a5fa',
  uploaded: '#2dd4bf',
  complete_pending: '#fbbf24',
  completed: '#4ade80',
  error: '#fb923c',
  dead: '#f87171',
}

const STATUS_LABELS: Record<SegmentRow['status'], string> = {
  pending: 'În așteptare',
  uploading: 'Se încarcă',
  uploaded: 'Încărcat',
  complete_pending: 'Finalizare',
  completed: 'Complet',
  error: 'Eroare',
  dead: 'Eșuat',
}

function canRetry(status: SegmentRow['status']): boolean {
  return status === 'error' || status === 'dead'
}

function canDelete(status: SegmentRow['status']): boolean {
  return status !== 'uploading'
}

interface Props {
  items: SegmentRow[]
  loading: boolean
  onDelete: (id: string) => void
  onRetry: (id: string) => void
  onRefresh: () => void
}

export function QueuePanel({ items, loading, onDelete, onRetry, onRefresh }: Props) {
  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 600, fontSize: '1rem' }}>Coadă de upload</span>
          {items.length > 0 && (
            <span
              style={{
                background: 'rgba(129,140,248,0.2)',
                color: '#c7d2fe',
                borderRadius: 999,
                padding: '2px 8px',
                fontSize: '0.8rem',
                fontWeight: 500,
              }}
            >
              {items.length}
            </span>
          )}
        </div>
        <button
          className="icon-button"
          onClick={onRefresh}
          disabled={loading}
          title="Reîncarcă lista"
          aria-label="Reîncarcă"
          style={{ opacity: loading ? 0.5 : 1 }}
        >
          <RefreshCcw size={15} className={loading ? 'spin' : ''} />
        </button>
      </div>

      {/* List */}
      {items.length === 0 ? (
        <p className="empty-state" style={{ color: '#64748b', textAlign: 'center', padding: '24px 0' }}>
          Nicio înregistrare în coadă
        </p>
      ) : (
        <div className="queue-list">
          {items.map(item => (
            <div key={item.id} className="queue-item">
              <div className="queue-item-info" style={{ flex: 1, minWidth: 0 }}>
                <strong style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.title}
                </strong>
                <p style={{ margin: '2px 0', color: '#94a3b8', fontSize: '0.85rem' }}>
                  Segment {item.segment_index}
                  {item.total_segments ? ` / ${item.total_segments}` : ''}
                  {' · '}{formatBytes(item.audio_bytes)}
                </p>
                {item.error_count > 0 && (
                  <p style={{ margin: '2px 0', color: '#fb923c', fontSize: '0.8rem' }}>
                    {item.error_count} {item.error_count === 1 ? 'eroare' : 'erori'}
                    {item.last_error ? `: ${item.last_error}` : ''}
                  </p>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                {/* Status badge */}
                <span
                  style={{
                    padding: '2px 8px',
                    borderRadius: 999,
                    fontSize: '0.78rem',
                    fontWeight: 500,
                    background: `${STATUS_COLORS[item.status]}22`,
                    color: STATUS_COLORS[item.status],
                    border: `1px solid ${STATUS_COLORS[item.status]}44`,
                  }}
                >
                  {STATUS_LABELS[item.status]}
                </span>

                {/* Retry */}
                {canRetry(item.status) && (
                  <button
                    className="icon-button"
                    onClick={() => onRetry(item.id)}
                    title="Reîncearcă"
                    aria-label="Reîncearcă"
                  >
                    <RotateCcw size={14} />
                  </button>
                )}

                {/* Delete */}
                {canDelete(item.status) && (
                  <button
                    className="icon-button"
                    onClick={() => onDelete(item.id)}
                    title="Șterge segment"
                    aria-label="Șterge"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
