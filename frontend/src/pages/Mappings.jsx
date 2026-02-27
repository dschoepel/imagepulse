import { useEffect, useState } from 'react';
import { apiFetch, validateRepo, validateUrl } from '../api.js';

// ── Validation helpers ────────────────────────────────────────────────────────

function validateImage(image) {
  const v = image.trim();
  if (!v) return { message: 'Docker image name is required', isWarning: false };
  if (!v.includes('/')) return { message: 'Must include at least one slash (e.g. docker.io/library/nginx)', isWarning: false };
  if (/\s/.test(v)) return { message: 'Image name must not contain spaces', isWarning: false };
  return null;
}

async function checkRepo(repo, setError, setChecking) {
  const v = repo.trim();
  if (!v) { setError({ message: 'GitHub repo is required', isWarning: false }); return false; }
  if (!/^[a-zA-Z0-9_.\-]+\/[a-zA-Z0-9_.\-]+$/.test(v)) {
    setError({ message: 'Must be owner/repo format (e.g. nginx/nginx)', isWarning: false });
    return false;
  }
  setChecking(true); setError(null);
  try {
    const d = await validateRepo(v);
    if (d.repoExists === true)  { setError(null); return true; }
    if (d.repoExists === false) { setError({ message: d.repoError || 'Repository not found on GitHub', isWarning: false }); return false; }
    setError({ message: d.repoError || 'Could not verify repo', isWarning: true }); return true;
  } catch {
    setError({ message: 'Could not reach GitHub to verify', isWarning: true }); return true;
  } finally { setChecking(false); }
}

async function checkUrl(url, setError, setChecking) {
  const v = url.trim();
  if (!v) { setError({ message: 'Release notes URL is required', isWarning: false }); return false; }
  setChecking(true); setError(null);
  try {
    const d = await validateUrl(v);
    if (d.urlReachable === true)  { setError(null); return true; }
    if (d.urlReachable === false) { setError({ message: d.urlError || 'URL is not reachable', isWarning: false }); return false; }
    setError({ message: d.urlError || 'Could not verify URL', isWarning: true }); return true;
  } catch {
    setError({ message: 'Could not verify URL', isWarning: true }); return true;
  } finally { setChecking(false); }
}

// ── Small shared components ───────────────────────────────────────────────────

function FieldError({ err }) {
  if (!err) return null;
  return <p className={`text-xs mt-1 ${err.isWarning ? 'text-amber-600' : 'text-red-600'}`}>{err.message}</p>;
}

function borderClass(err) {
  if (!err) return 'border-gray-300';
  return err.isWarning ? 'border-amber-400' : 'border-red-400';
}

function RadioGroup({ value, onChange }) {
  return (
    <div className="flex gap-5 items-center">
      <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
        <input type="radio" name="link-type" value="github" checked={value === 'github'}
               onChange={() => onChange('github')}
               className="accent-indigo-600" />
        GitHub Repo
      </label>
      <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
        <input type="radio" name="link-type" value="url" checked={value === 'url'}
               onChange={() => onChange('url')}
               className="accent-indigo-600" />
        Release Notes URL
      </label>
    </div>
  );
}

function LinkCell({ m }) {
  if (m.link_type === 'url' && m.url) {
    return (
      <div>
        <span className="text-xs text-gray-400 block mb-0.5">Release Notes URL:</span>
        <a href={m.url} target="_blank" rel="noreferrer"
           className="text-indigo-600 hover:underline text-sm break-all">
          {m.url}
        </a>
      </div>
    );
  }
  const repo = m.repo || '—';
  const href = m.repo ? `https://github.com/${m.repo}` : null;
  return (
    <div>
      <span className="text-xs text-gray-400 block mb-0.5">GitHub Repo:</span>
      {href
        ? <a href={href} target="_blank" rel="noreferrer"
             className="text-indigo-600 hover:underline text-sm">{repo}</a>
        : <span className="text-sm text-gray-500">{repo}</span>
      }
    </div>
  );
}

const PER_PAGE_OPTIONS = [5, 10, 25, 50, 100];

// ── Main component ────────────────────────────────────────────────────────────

export default function Mappings() {
  const [mappings, setMappings]   = useState([]);
  const [error, setError]         = useState(null);
  const [filter, setFilter]       = useState('');
  const [perPage, setPerPage]     = useState(25);
  const [page, setPage]           = useState(1);

  // Add-form state
  const [newImage,         setNewImage]         = useState('');
  const [newLinkType,      setNewLinkType]      = useState('github');
  const [newRepo,          setNewRepo]          = useState('');
  const [newUrl,           setNewUrl]           = useState('');
  const [addImageError,    setAddImageError]    = useState(null);
  const [addLinkError,     setAddLinkError]     = useState(null);
  const [addLinkChecking,  setAddLinkChecking]  = useState(false);
  const [addError,         setAddError]         = useState(null);

  // Edit state
  const [editingId,        setEditingId]        = useState(null);
  const [editImage,        setEditImage]        = useState('');
  const [editLinkType,     setEditLinkType]     = useState('github');
  const [editRepo,         setEditRepo]         = useState('');
  const [editUrl,          setEditUrl]          = useState('');
  const [editImageError,   setEditImageError]   = useState(null);
  const [editLinkError,    setEditLinkError]    = useState(null);
  const [editLinkChecking, setEditLinkChecking] = useState(false);
  const [editSaveError,    setEditSaveError]    = useState(null);

  function load() {
    apiFetch('/settings/mappings')
      .then((d) => setMappings(d.mappings))
      .catch((err) => setError(err.message));
  }
  useEffect(() => { load(); }, []);

  // Reset to page 1 when filter changes
  useEffect(() => { setPage(1); }, [filter]);

  // ── Derived list ────────────────────────────────────────────────────────────
  const filtered = mappings.filter(
    (m) => !filter || m.image.toLowerCase().includes(filter.toLowerCase())
  );
  const totalPages  = Math.max(1, Math.ceil(filtered.length / perPage));
  const safePage    = Math.min(page, totalPages);
  const pageStart   = (safePage - 1) * perPage;
  const paginated   = filtered.slice(pageStart, pageStart + perPage);
  const rangeStart  = filtered.length === 0 ? 0 : pageStart + 1;
  const rangeEnd    = Math.min(pageStart + perPage, filtered.length);

  // ── Add ─────────────────────────────────────────────────────────────────────
  async function handleAdd(e) {
    e.preventDefault();
    const imgErr = validateImage(newImage);
    setAddImageError(imgErr);

    let linkOk;
    if (newLinkType === 'github') {
      linkOk = await checkRepo(newRepo, setAddLinkError, setAddLinkChecking);
    } else {
      linkOk = await checkUrl(newUrl, setAddLinkError, setAddLinkChecking);
    }

    if (imgErr || !linkOk) return;
    setAddError(null);
    try {
      await apiFetch('/settings/mappings', {
        method: 'PUT',
        body: JSON.stringify({
          image:     newImage.trim(),
          repo:      newLinkType === 'github' ? newRepo.trim() : '',
          url:       newLinkType === 'url'    ? newUrl.trim()  : '',
          link_type: newLinkType,
        }),
      });
      setNewImage(''); setNewRepo(''); setNewUrl('');
      setAddImageError(null); setAddLinkError(null);
      load();
    } catch (err) { setAddError(err.message); }
  }

  // ── Delete ──────────────────────────────────────────────────────────────────
  async function handleDelete(image) {
    try {
      await apiFetch(`/settings/mappings/${encodeURIComponent(image)}`, { method: 'DELETE' });
      load();
    } catch (err) { setError(err.message); }
  }

  // ── Edit ────────────────────────────────────────────────────────────────────
  function startEdit(m) {
    setEditingId(m.id);
    setEditImage(m.image);
    setEditLinkType(m.link_type || 'github');
    setEditRepo(m.repo || '');
    setEditUrl(m.url || '');
    setEditImageError(null); setEditLinkError(null); setEditSaveError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditImage(''); setEditLinkType('github'); setEditRepo(''); setEditUrl('');
    setEditImageError(null); setEditLinkError(null); setEditSaveError(null);
  }

  async function handleSave(oldImage) {
    const imgErr = validateImage(editImage);
    setEditImageError(imgErr);

    let linkOk;
    if (editLinkType === 'github') {
      linkOk = await checkRepo(editRepo, setEditLinkError, setEditLinkChecking);
    } else {
      linkOk = await checkUrl(editUrl, setEditLinkError, setEditLinkChecking);
    }

    if (imgErr || !linkOk) return;
    setEditSaveError(null);
    try {
      await apiFetch(`/settings/mappings/${encodeURIComponent(oldImage)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          newImage:  editImage.trim(),
          repo:      editLinkType === 'github' ? editRepo.trim() : '',
          url:       editLinkType === 'url'    ? editUrl.trim()  : '',
          link_type: editLinkType,
        }),
      });
      cancelEdit(); load();
    } catch (err) { setEditSaveError(err.message); }
  }

  // ── Pagination helpers ──────────────────────────────────────────────────────
  function pageNumbers() {
    const nums = [];
    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || Math.abs(i - safePage) <= 1) {
        nums.push(i);
      } else if (nums[nums.length - 1] !== '…') {
        nums.push('…');
      }
    }
    return nums;
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-2xl font-bold text-gray-900">Image → Repo Mappings</h1>

      {/* Add form */}
      <form onSubmit={handleAdd} className="bg-white rounded-lg shadow p-4 space-y-3">
        <div className="flex flex-wrap gap-3 items-start">
          {/* Docker image */}
          <div className="flex flex-col gap-1 flex-1 min-w-0 w-full sm:min-w-[220px]">
            <label className="text-xs font-medium text-gray-600">Docker image</label>
            <input
              type="text"
              placeholder="e.g. docker.io/library/nginx"
              value={newImage}
              onChange={(e) => { setNewImage(e.target.value); setAddImageError(null); }}
              onBlur={() => setAddImageError(validateImage(newImage))}
              className={`border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${borderClass(addImageError)}`}
            />
            <FieldError err={addImageError} />
          </div>

          {/* Submit button */}
          <div className="flex flex-col gap-1">
            <span className="text-xs invisible select-none hidden sm:block" aria-hidden="true">x</span>
            <button
              type="submit"
              disabled={addLinkChecking}
              className="bg-indigo-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-indigo-700 disabled:opacity-60"
            >
              Add
            </button>
          </div>
        </div>

        {/* Link type toggle + conditional input */}
        <div className="flex flex-col gap-2">
          <RadioGroup value={newLinkType} onChange={(v) => { setNewLinkType(v); setAddLinkError(null); }} />
          {newLinkType === 'github' ? (
            <div className="flex flex-col gap-1 w-full max-w-sm">
              <label className="text-xs font-medium text-gray-600">GitHub repo (owner/repo)</label>
              <input
                type="text"
                placeholder="e.g. nginx/nginx"
                value={newRepo}
                onChange={(e) => { setNewRepo(e.target.value); setAddLinkError(null); }}
                onBlur={() => { if (newRepo.trim()) checkRepo(newRepo, setAddLinkError, setAddLinkChecking); }}
                className={`border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 w-full ${borderClass(addLinkError)}`}
              />
              {addLinkChecking
                ? <p className="text-xs text-gray-400 mt-1">Checking GitHub…</p>
                : <FieldError err={addLinkError} />}
            </div>
          ) : (
            <div className="flex flex-col gap-1 w-full max-w-sm">
              <label className="text-xs font-medium text-gray-600">Release notes URL</label>
              <input
                type="url"
                placeholder="e.g. https://wordpress.org/news/category/releases/"
                value={newUrl}
                onChange={(e) => { setNewUrl(e.target.value); setAddLinkError(null); }}
                onBlur={() => { if (newUrl.trim()) checkUrl(newUrl, setAddLinkError, setAddLinkChecking); }}
                className={`border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 w-full ${borderClass(addLinkError)}`}
              />
              {addLinkChecking
                ? <p className="text-xs text-gray-400 mt-1">Checking URL…</p>
                : <FieldError err={addLinkError} />}
            </div>
          )}
        </div>

        {addError && <p className="text-red-600 text-xs">{addError}</p>}
      </form>

      {error && <p className="text-red-600 text-sm">Error: {error}</p>}

      {/* Search + per-page */}
      <div className="flex items-center gap-3 flex-wrap">
        <input
          type="text"
          placeholder="Filter by image…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 flex-1 min-w-[180px] max-w-xs"
        />
        {filter && (
          <button onClick={() => setFilter('')} className="text-xs text-gray-400 hover:text-gray-600">
            Clear
          </button>
        )}
        <div className="ml-auto flex items-center gap-2 text-sm text-gray-500">
          <span>Rows:</span>
          <select
            value={perPage}
            onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1); }}
            className="border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {PER_PAGE_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              {['Image', 'Link', ''].map((h, i) => (
                <th key={i} className="px-4 py-3 text-left font-medium text-gray-500 uppercase tracking-wider text-xs">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {paginated.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-gray-400">
                  {filter ? 'No mappings match your filter' : 'No mappings yet'}
                </td>
              </tr>
            ) : (
              paginated.map((m) =>
                editingId === m.id ? (
                  /* ── Edit row ── */
                  <tr key={m.id} className="bg-indigo-50">
                    <td className="px-4 py-2 align-top">
                      <input
                        type="text"
                        value={editImage}
                        onChange={(e) => { setEditImage(e.target.value); setEditImageError(null); }}
                        onBlur={() => setEditImageError(validateImage(editImage))}
                        className={`border rounded px-2 py-1 text-xs font-mono w-full focus:outline-none focus:ring-2 focus:ring-indigo-500 ${borderClass(editImageError)}`}
                      />
                      <FieldError err={editImageError} />
                    </td>
                    <td className="px-4 py-2 align-top space-y-2">
                      <RadioGroup value={editLinkType} onChange={(v) => { setEditLinkType(v); setEditLinkError(null); }} />
                      {editLinkType === 'github' ? (
                        <div>
                          <input
                            type="text"
                            value={editRepo}
                            placeholder="owner/repo"
                            onChange={(e) => { setEditRepo(e.target.value); setEditLinkError(null); }}
                            onBlur={() => { if (editRepo.trim()) checkRepo(editRepo, setEditLinkError, setEditLinkChecking); }}
                            className={`border rounded px-2 py-1 text-xs w-full max-w-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 ${borderClass(editLinkError)}`}
                          />
                          {editLinkChecking
                            ? <p className="text-xs text-gray-400 mt-1">Checking…</p>
                            : <FieldError err={editLinkError} />}
                        </div>
                      ) : (
                        <div>
                          <input
                            type="url"
                            value={editUrl}
                            placeholder="https://…"
                            onChange={(e) => { setEditUrl(e.target.value); setEditLinkError(null); }}
                            onBlur={() => { if (editUrl.trim()) checkUrl(editUrl, setEditLinkError, setEditLinkChecking); }}
                            className={`border rounded px-2 py-1 text-xs w-full max-w-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 ${borderClass(editLinkError)}`}
                          />
                          {editLinkChecking
                            ? <p className="text-xs text-gray-400 mt-1">Checking…</p>
                            : <FieldError err={editLinkError} />}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2 align-top">
                      {editSaveError && <p className="text-xs text-red-600 mb-1">{editSaveError}</p>}
                      <div className="flex gap-3 whitespace-nowrap">
                        <button
                          onClick={() => handleSave(m.image)}
                          disabled={editLinkChecking}
                          className="text-indigo-600 hover:text-indigo-800 text-xs font-medium disabled:opacity-60"
                        >Save</button>
                        <button
                          onClick={cancelEdit}
                          className="text-gray-500 hover:text-gray-700 text-xs font-medium"
                        >Cancel</button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  /* ── Read row ── */
                  <tr key={m.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs text-gray-700">{m.image}</td>
                    <td className="px-4 py-3"><LinkCell m={m} /></td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button
                        onClick={() => startEdit(m)}
                        disabled={editingId !== null}
                        className="text-indigo-500 hover:text-indigo-700 text-xs font-medium mr-3 disabled:opacity-40"
                      >Edit</button>
                      <button
                        onClick={() => handleDelete(m.image)}
                        disabled={editingId !== null}
                        className="text-red-500 hover:text-red-700 text-xs font-medium disabled:opacity-40"
                      >Delete</button>
                    </td>
                  </tr>
                )
              )
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination controls */}
      {totalPages > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-y-2 text-sm text-gray-500">
          <span>{rangeStart}–{rangeEnd} of {filtered.length}</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={safePage === 1}
              className="px-2 py-1 rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-40 text-xs"
            >Prev</button>
            {pageNumbers().map((n, i) =>
              n === '…' ? (
                <span key={`ellipsis-${i}`} className="px-2 text-gray-400">…</span>
              ) : (
                <button
                  key={n}
                  onClick={() => setPage(n)}
                  className={`px-2.5 py-1 rounded border text-xs ${
                    n === safePage
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'border-gray-300 hover:bg-gray-50'
                  }`}
                >{n}</button>
              )
            )}
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage === totalPages}
              className="px-2 py-1 rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-40 text-xs"
            >Next</button>
          </div>
        </div>
      )}
    </div>
  );
}
