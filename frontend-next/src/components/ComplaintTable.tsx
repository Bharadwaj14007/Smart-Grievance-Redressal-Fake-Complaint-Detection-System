import Link from 'next/link'
import type { ApiComplaint } from '@shared/api-contracts'

export function ComplaintTable({ items }: { items: ApiComplaint[] }) {
  if (!items.length) return <div className="empty-state"><span className="empty-icon">○</span><strong>No complaints yet</strong><p>When a grievance is submitted or assigned to you, it will appear here.</p></div>
  return (
    <div className="table-scroll">
      <table>
        <thead><tr><th>Grievance</th><th>Category</th><th>Filed</th><th>Status</th><th>Priority</th><th /></tr></thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td><Link className="table-link" href={`/portal/complaints/${item.id}`}>{item.title}<small>{item.trackingId}</small></Link></td>
              <td>{item.category?.name ?? 'Uncategorized'}</td>
              <td>{new Date(item.createdAt).toLocaleDateString()}</td>
              <td><span className={`status-pill status-${item.status.toLowerCase()}`}>{item.status.replaceAll('_', ' ')}</span></td>
              <td><span className={`priority priority-${item.priority.toLowerCase()}`}>{item.priority}</span></td>
              <td><Link className="row-arrow" href={`/portal/complaints/${item.id}`} aria-label={`View ${item.trackingId}`}>→</Link></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
