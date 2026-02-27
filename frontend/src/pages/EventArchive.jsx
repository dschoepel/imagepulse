import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../api.js';

function StatusBadge({ status }) {
  const colours = {
    new:     'bg-green-100 text-green-800',
    update:  'bg-blue-100 text-blue-800',
    unknown: 'bg-gray-100 text-gray-600',
  };
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${colours[status] ?? colours.unknown}`}>
      {status}
    </span>
  );
}

function SortHeader({ label, col, sortBy, sortDir, onSort, className }) {
  const active = sortBy === col;
  return (
    <th className={`cursor-pointer select-none ${className}`} onClick={() => onSort(col)}>
      <span className="inline-flex items-center gap-1">
        {label}
        <span className={active ? 'text-indigo-500' : 'text-gray-300'}>
          {active ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
        </span>
      </span>
    </th>
  );
}

function ArchiveDetail({ ev }) {
  let platform = '—';
  try {
    const p = JSON.parse(ev.raw_payload);
    if (p?.platform) platform = p.platform;
  } catch {}

  return (
    <div className="bg-indigo-50 px-4 py-4 sm:px-6 text-sm">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left — Notification sent */}
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Notification sent</p>
          {ev.notification_title ? (
            <>
              <p className="font-medium text-gray-800 mb-1">{ev.notification_title}</p>
              <pre className="text-xs text-gray-600 whitespace-pre-wrap bg-white rounded border border-gray-200 p-3">
                {ev.notification_body}
              </pre>
            </>
          ) : (
            <p className="text-gray-400 italic">No notification recorded</p>
          )}
        </div>

        {/* Right — Metadata */}
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Metadata</p>
          <dl className="space-y-1.5 text-xs">
            <div className="flex gap-2">
              <dt className="text-gray-500 w-24 shrink-0">Full digest</dt>
              <dd className="font-mono text-gray-700 break-all">{ev.digest || '—'}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-gray-500 w-24 shrink-0">Platform</dt>
              <dd className="text-gray-700">{platform}</dd>
            </div>
            {ev.resolved_version && (
              <div className="flex gap-2">
                <dt className="text-gray-500 w-24 shrink-0">Version</dt>
                <dd className="font-mono text-gray-800">{ev.resolved_version}</dd>
              </div>
            )}
            <div className="flex gap-2">
              <dt className="text-gray-500 w-24 shrink-0">Original date</dt>
              <dd className="text-gray-700">{new Date(ev.created_at + 'Z').toLocaleString()}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-gray-500 w-24 shrink-0">Archived at</dt>
              <dd className="text-gray-700">{new Date(ev.archived_at + 'Z').toLocaleString()}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-gray-500 w-24 shrink-0">Release</dt>
              <dd>
                {ev.github_release_url
                  ? <a href={ev.github_release_url} target="_blank" rel="noreferrer"
                       className="text-indigo-600 hover:underline text-xs">View on GitHub ↗</a>
                  : <span className="text-gray-400">—</span>}
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  );
}

export default function EventArchive() {
  const [events, setEvents]       = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [page, setPage]           = useState(1);
  const [image, setImage]         = useState('');
  const [status, setStatus]       = useState('');
  const [sortBy, setSortBy]       = useState('archived_at');
  const [sortDir, setSortDir]     = useState('desc');
  const [perPage, setPerPage]     = useState(() => {
    try { return Number(localStorage.getItem('archive-per-page')) || 25; } catch { return 25; }
  });
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(null);
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ page, limit: perPage, sortBy, sortDir });
    if (image)  params.set('image', image);
    if (status) params.set('status', status);

    apiFetch(`/archive?${params}`)
      .then((data) => {
        setEvents(data.events);
        setPagination(data.pagination);
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [page, perPage, image, status, sortBy, sortDir]);

  function handleFilterChange() {
    setPage(1);
    setExpandedId(null);
  }

  function handleSort(col) {
    if (sortBy === col) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(col);
      setSortDir('asc');
    }
    setPage(1);
    setExpandedId(null);
  }

  function handlePerPageChange(n) {
    try { localStorage.setItem('archive-per-page', String(n)); } catch {}
    setPerPage(n);
    setPage(1);
    setExpandedId(null);
  }

  const pages = pagination.pages;

  function pageNumbers() {
    const nums = [];
    for (let i = 1; i <= pages; i++) {
      if (i === 1 || i === pages || Math.abs(i - page) <= 1) {
        nums.push(i);
      } else if (nums[nums.length - 1] !== '…') {
        nums.push('…');
      }
    }
    return nums;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Event Archive</h1>
        <Link to="/events" className="text-sm text-indigo-600 hover:underline">
          ← Back to Events
        </Link>
      </div>
      <p className="text-sm text-gray-500 -mt-2">
        Events moved here by <strong>Archive &amp; Clean</strong> in Settings. Read-only.
      </p>

      {/* Filter bar */}
      <div className="flex gap-3 flex-wrap items-center">
        <input
          type="text"
          placeholder="Filter by image…"
          value={image}
          onChange={(e) => { setImage(e.target.value); handleFilterChange(); }}
          className="border border-gray-300 rounded-md px-3 py-2 text-sm w-full sm:w-56 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value); handleFilterChange(); }}
          className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">All statuses</option>
          <option value="new">new</option>
          <option value="update">update</option>
        </select>
        <div className="ml-auto flex items-center gap-2 text-sm text-gray-500">
          <span>Rows:</span>
          <select
            value={perPage}
            onChange={(e) => handlePerPageChange(Number(e.target.value))}
            className="border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {[5, 10, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
      </div>

      {error && <p className="text-red-600 text-sm">Error: {error}</p>}

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="w-8 px-2 py-3" />
              <SortHeader label="Image"    col="image"       sortBy={sortBy} sortDir={sortDir} onSort={handleSort} className="px-2 sm:px-4 py-3 text-left font-medium text-gray-500 uppercase tracking-wider text-xs" />
              <SortHeader label="Tag"      col="tag"         sortBy={sortBy} sortDir={sortDir} onSort={handleSort} className="hidden sm:table-cell px-4 py-3 text-left font-medium text-gray-500 uppercase tracking-wider text-xs" />
              <SortHeader label="Status"   col="status"      sortBy={sortBy} sortDir={sortDir} onSort={handleSort} className="px-2 sm:px-4 py-3 text-left font-medium text-gray-500 uppercase tracking-wider text-xs" />
              <SortHeader label="Archived" col="archived_at" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} className="px-2 sm:px-4 py-3 text-left font-medium text-gray-500 uppercase tracking-wider text-xs" />
              <SortHeader label="Original" col="created_at"  sortBy={sortBy} sortDir={sortDir} onSort={handleSort} className="hidden sm:table-cell px-4 py-3 text-left font-medium text-gray-500 uppercase tracking-wider text-xs" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-400">Loading…</td></tr>
            ) : events.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-400">No archived events</td></tr>
            ) : (
              events.map((ev) => (
                <>
                  <tr
                    key={ev.id}
                    onClick={() => setExpandedId((prev) => (prev === ev.id ? null : ev.id))}
                    className="hover:bg-gray-50 cursor-pointer"
                  >
                    <td className="w-8 px-2 py-3 text-center text-gray-400 text-xs select-none">
                      {expandedId === ev.id ? '▼' : '▶'}
                    </td>
                    <td className="px-2 sm:px-4 py-3 max-w-[80px] sm:max-w-xs">
                      <span className="font-mono text-xs text-gray-700 truncate block">{ev.image}</span>
                    </td>
                    <td className="hidden sm:table-cell px-4 py-3 font-mono text-xs text-gray-700">{ev.tag}</td>
                    <td className="px-2 sm:px-4 py-3"><StatusBadge status={ev.status} /></td>
                    <td className="px-2 sm:px-4 py-3 text-gray-500 whitespace-nowrap text-xs">
                      {new Date(ev.archived_at + 'Z').toLocaleString()}
                    </td>
                    <td className="hidden sm:table-cell px-4 py-3 text-gray-400 whitespace-nowrap text-xs">
                      {new Date(ev.created_at + 'Z').toLocaleString()}
                    </td>
                  </tr>
                  {expandedId === ev.id && (
                    <tr key={`${ev.id}-detail`}>
                      <td colSpan={6} className="p-0">
                        <ArchiveDetail ev={ev} />
                      </td>
                    </tr>
                  )}
                </>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-between flex-wrap gap-3">
          <span className="text-sm text-gray-500">
            {pagination.total === 0 ? '0' : `${(page - 1) * perPage + 1}–${Math.min(page * perPage, pagination.total)}`} of {pagination.total}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 text-sm rounded border border-gray-300 disabled:opacity-40 hover:bg-gray-50"
            >
              Prev
            </button>
            {pageNumbers().map((n, i) =>
              n === '…' ? (
                <span key={`ellipsis-${i}`} className="px-2 text-gray-400">…</span>
              ) : (
                <button
                  key={n}
                  onClick={() => setPage(n)}
                  className={`px-3 py-1.5 text-sm rounded border ${
                    n === page
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {n}
                </button>
              )
            )}
            <button
              onClick={() => setPage((p) => Math.min(pages, p + 1))}
              disabled={page === pages}
              className="px-3 py-1.5 text-sm rounded border border-gray-300 disabled:opacity-40 hover:bg-gray-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
