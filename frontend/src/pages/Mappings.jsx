import { useEffect, useState } from 'react';
import { apiFetch, validateRepo } from '../api.js';

// Error object: null = no error, { message, isWarning } = error or soft warning
// isWarning=true allows submission (e.g. GitHub unreachable), isWarning=false blocks it.

function validateImage(image) {
  const v = image.trim();
  if (!v) return { message: 'Docker image name is required', isWarning: false };
  if (!v.includes('/')) return { message: 'Must include at least one slash (e.g. docker.io/library/nginx)', isWarning: false };
  if (/\s/.test(v)) return { message: 'Image name must not contain spaces', isWarning: false };
  return null;
}

async function checkRepo(repo, setError, setChecking) {
  const v = repo.trim();
  if (!v) {
    setError({ message: 'GitHub repo is required', isWarning: false });
    return false;
  }
  if (!/^[a-zA-Z0-9_.\-]+\/[a-zA-Z0-9_.\-]+$/.test(v)) {
    setError({ message: 'Must be owner/repo format (e.g. nginx/nginx)', isWarning: false });
    return false;
  }
  setChecking(true);
  setError(null);
  try {
    const d = await validateRepo(v);
    if (d.repoExists === true) { setError(null); return true; }
    if (d.repoExists === false) {
      setError({ message: d.repoError || 'Repository not found on GitHub', isWarning: false });
      return false;
    }
    // null — rate-limited or network error; show warning but allow save
    setError({ message: d.repoError || 'Could not verify repo', isWarning: true });
    return true;
  } catch {
    setError({ message: 'Could not reach GitHub to verify', isWarning: true });
    return true;
  } finally {
    setChecking(false);
  }
}

function FieldError({ err }) {
  if (!err) return null;
  return (
    <p className={`text-xs mt-1 ${err.isWarning ? 'text-amber-600' : 'text-red-600'}`}>
      {err.message}
    </p>
  );
}

function borderClass(err) {
  if (!err) return 'border-gray-300';
  return err.isWarning ? 'border-amber-400' : 'border-red-400';
}

export default function Mappings() {
  const [mappings, setMappings] = useState([]);
  const [newImage, setNewImage] = useState('');
  const [newRepo, setNewRepo] = useState('');
  const [addError, setAddError] = useState(null);
  const [addImageError, setAddImageError] = useState(null);
  const [addRepoError, setAddRepoError] = useState(null);
  const [addRepoChecking, setAddRepoChecking] = useState(false);
  const [error, setError] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editImage, setEditImage] = useState('');
  const [editRepo, setEditRepo] = useState('');
  const [editImageError, setEditImageError] = useState(null);
  const [editRepoError, setEditRepoError] = useState(null);
  const [editRepoChecking, setEditRepoChecking] = useState(false);
  const [editSaveError, setEditSaveError] = useState(null);

  function load() {
    apiFetch('/settings/mappings')
      .then((d) => setMappings(d.mappings))
      .catch((err) => setError(err.message));
  }

  useEffect(() => { load(); }, []);

  async function handleAdd(e) {
    e.preventDefault();
    const imgErr = validateImage(newImage);
    setAddImageError(imgErr);
    const repoOk = await checkRepo(newRepo, setAddRepoError, setAddRepoChecking);
    if (imgErr !== null || !repoOk) return;
    setAddError(null);
    try {
      await apiFetch('/settings/mappings', {
        method: 'PUT',
        body: JSON.stringify({ image: newImage.trim(), repo: newRepo.trim() }),
      });
      setNewImage('');
      setNewRepo('');
      setAddImageError(null);
      setAddRepoError(null);
      load();
    } catch (err) {
      setAddError(err.message);
    }
  }

  async function handleDelete(image) {
    try {
      await apiFetch(`/settings/mappings/${encodeURIComponent(image)}`, { method: 'DELETE' });
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  function startEdit(m) {
    setEditingId(m.id);
    setEditImage(m.image);
    setEditRepo(m.repo);
    setEditImageError(null);
    setEditRepoError(null);
    setEditSaveError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditImage('');
    setEditRepo('');
    setEditImageError(null);
    setEditRepoError(null);
    setEditSaveError(null);
  }

  async function handleSave(oldImage) {
    const imgErr = validateImage(editImage);
    setEditImageError(imgErr);
    const repoOk = await checkRepo(editRepo, setEditRepoError, setEditRepoChecking);
    if (imgErr !== null || !repoOk) return;
    setEditSaveError(null);
    try {
      await apiFetch(`/settings/mappings/${encodeURIComponent(oldImage)}`, {
        method: 'PATCH',
        body: JSON.stringify({ newImage: editImage.trim(), repo: editRepo.trim() }),
      });
      cancelEdit();
      load();
    } catch (err) {
      setEditSaveError(err.message);
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900">Image → Repo Mappings</h1>

      {/* Add form */}
      <form onSubmit={handleAdd} className="bg-white rounded-lg shadow p-4 flex flex-wrap gap-3 items-start">
        <div className="flex flex-col gap-1 flex-1 min-w-0 w-full sm:min-w-[180px]">
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
        <div className="flex flex-col gap-1 flex-1 min-w-0 w-full sm:min-w-[160px]">
          <label className="text-xs font-medium text-gray-600">GitHub repo (owner/repo)</label>
          <input
            type="text"
            placeholder="e.g. nginx/nginx"
            value={newRepo}
            onChange={(e) => { setNewRepo(e.target.value); setAddRepoError(null); }}
            onBlur={() => { if (newRepo.trim()) checkRepo(newRepo, setAddRepoError, setAddRepoChecking); }}
            className={`border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${borderClass(addRepoError)}`}
          />
          {addRepoChecking
            ? <p className="text-xs text-gray-400 mt-1">Checking GitHub…</p>
            : <FieldError err={addRepoError} />}
        </div>
        {/* Invisible label keeps button vertically aligned with the input row */}
        <div className="flex flex-col gap-1">
          <span className="text-xs invisible select-none" aria-hidden="true">x</span>
          <button
            type="submit"
            disabled={addRepoChecking}
            className="bg-indigo-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-indigo-700 disabled:opacity-60"
          >
            Add
          </button>
        </div>
        {addError && <p className="w-full text-red-600 text-xs">{addError}</p>}
      </form>

      {error && <p className="text-red-600 text-sm">Error: {error}</p>}

      <div className="bg-white rounded-lg shadow overflow-hidden overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              {['Image', 'GitHub Repo', ''].map((h, i) => (
                <th key={i} className="px-4 py-3 text-left font-medium text-gray-500 uppercase tracking-wider text-xs">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {mappings.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-gray-400">
                  No mappings yet
                </td>
              </tr>
            ) : (
              mappings.map((m) =>
                editingId === m.id ? (
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
                    <td className="px-4 py-2 align-top">
                      <input
                        type="text"
                        value={editRepo}
                        onChange={(e) => { setEditRepo(e.target.value); setEditRepoError(null); }}
                        onBlur={() => { if (editRepo.trim()) checkRepo(editRepo, setEditRepoError, setEditRepoChecking); }}
                        className={`border rounded px-2 py-1 text-xs w-full focus:outline-none focus:ring-2 focus:ring-indigo-500 ${borderClass(editRepoError)}`}
                      />
                      {editRepoChecking
                        ? <p className="text-xs text-gray-400 mt-1">Checking…</p>
                        : <FieldError err={editRepoError} />}
                    </td>
                    <td className="px-4 py-2 align-top">
                      {editSaveError && <p className="text-xs text-red-600 mb-1">{editSaveError}</p>}
                      <div className="flex gap-3 whitespace-nowrap">
                        <button
                          onClick={() => handleSave(m.image)}
                          disabled={editRepoChecking}
                          className="text-indigo-600 hover:text-indigo-800 text-xs font-medium disabled:opacity-60"
                        >
                          Save
                        </button>
                        <button
                          onClick={cancelEdit}
                          className="text-gray-500 hover:text-gray-700 text-xs font-medium"
                        >
                          Cancel
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={m.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs text-gray-700">{m.image}</td>
                    <td className="px-4 py-3 text-gray-700">{m.repo}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button
                        onClick={() => startEdit(m)}
                        disabled={editingId !== null}
                        className="text-indigo-500 hover:text-indigo-700 text-xs font-medium mr-3 disabled:opacity-40"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(m.image)}
                        disabled={editingId !== null}
                        className="text-red-500 hover:text-red-700 text-xs font-medium disabled:opacity-40"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                )
              )
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
