import { useEffect, useState } from 'react';
import { apiFetch } from '../api.js';

function Toggle({ checked, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
        checked ? 'bg-indigo-600' : 'bg-gray-300'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

function Field({ label, type = 'text', value, onChange, placeholder }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-gray-600">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 w-full max-w-sm"
      />
    </div>
  );
}

function Section({ title, children }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="bg-white rounded-lg shadow">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex justify-between items-center px-5 py-4 text-left"
      >
        <span className="font-semibold text-gray-800">{title}</span>
        <span className="text-gray-400">{open ? '▲' : '▼'}</span>
      </button>
      {open && <div className="px-5 pb-5 space-y-4">{children}</div>}
    </div>
  );
}

export default function Settings() {
  const [s, setS] = useState({});
  const [ntfyStatus, setNtfyStatus] = useState(null);
  const [emailStatus, setEmailStatus] = useState(null);
  const [retentionStatus, setRetentionStatus] = useState(null);

  useEffect(() => {
    apiFetch('/settings')
      .then((d) => setS(d.settings))
      .catch(() => {});
  }, []);

  function set(key, value) {
    setS((prev) => ({ ...prev, [key]: value }));
  }

  async function saveSection(keys, setStatus) {
    setStatus(null);
    const payload = Object.fromEntries(keys.map((k) => [k, s[k] ?? '']));
    try {
      await apiFetch('/settings', {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      setStatus({ ok: true, msg: 'Saved.' });
    } catch (err) {
      setStatus({ ok: false, msg: err.message });
    }
  }

  async function testNtfy() {
    setNtfyStatus(null);
    try {
      await apiFetch('/settings/test-ntfy', { method: 'POST' });
      setNtfyStatus({ ok: true, msg: 'Test notification sent.' });
    } catch (err) {
      setNtfyStatus({ ok: false, msg: err.message });
    }
  }

  async function testEmail() {
    setEmailStatus(null);
    try {
      await apiFetch('/settings/test-email', { method: 'POST' });
      setEmailStatus({ ok: true, msg: 'Test email sent.' });
    } catch (err) {
      setEmailStatus({ ok: false, msg: err.message });
    }
  }

  function StatusMsg({ status }) {
    if (!status) return null;
    return (
      <p className={`text-sm ${status.ok ? 'text-green-600' : 'text-red-600'}`}>{status.msg}</p>
    );
  }

  const ntfyKeys = ['ntfy_enabled', 'ntfy_url', 'ntfy_topic', 'ntfy_token'];
  const emailKeys = [
    'email_enabled', 'smtp_host', 'smtp_port', 'smtp_secure',
    'smtp_user', 'smtp_pass', 'email_from', 'email_to',
  ];
  const retentionKeys = ['retention_days'];

  return (
    <div className="space-y-4 max-w-xl">
      <h1 className="text-2xl font-bold text-gray-900">Settings</h1>

      {/* ntfy */}
      <Section title="ntfy Notifications">
        <div className="flex items-center gap-3">
          <Toggle
            checked={s.ntfy_enabled === 'true'}
            onChange={(v) => set('ntfy_enabled', v ? 'true' : 'false')}
          />
          <span className="text-sm text-gray-600">Enable ntfy</span>
        </div>
        <Field label="ntfy URL" value={s.ntfy_url ?? ''} onChange={(v) => set('ntfy_url', v)} placeholder="https://ntfy.sh" />
        <Field label="Topic" value={s.ntfy_topic ?? ''} onChange={(v) => set('ntfy_topic', v)} placeholder="my-topic" />
        <Field label="Token" type="password" value={s.ntfy_token ?? ''} onChange={(v) => set('ntfy_token', v)} placeholder="optional" />
        <div className="flex gap-3 items-center flex-wrap">
          <button
            onClick={() => saveSection(ntfyKeys, setNtfyStatus)}
            className="bg-indigo-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-indigo-700"
          >
            Save
          </button>
          <button
            onClick={testNtfy}
            className="border border-gray-300 px-4 py-2 rounded text-sm font-medium hover:bg-gray-50"
          >
            Send test
          </button>
          <StatusMsg status={ntfyStatus} />
        </div>
      </Section>

      {/* Email */}
      <Section title="Email Notifications">
        <div className="flex items-center gap-3">
          <Toggle
            checked={s.email_enabled === 'true'}
            onChange={(v) => set('email_enabled', v ? 'true' : 'false')}
          />
          <span className="text-sm text-gray-600">Enable email</span>
        </div>
        <Field label="SMTP Host" value={s.smtp_host ?? ''} onChange={(v) => set('smtp_host', v)} placeholder="smtp.example.com" />
        <Field label="SMTP Port" value={s.smtp_port ?? ''} onChange={(v) => set('smtp_port', v)} placeholder="587" />
        <div className="flex items-center gap-3">
          <Toggle
            checked={s.smtp_secure === 'true'}
            onChange={(v) => set('smtp_secure', v ? 'true' : 'false')}
          />
          <span className="text-sm text-gray-600">TLS (port 465)</span>
        </div>
        <Field label="SMTP Username" value={s.smtp_user ?? ''} onChange={(v) => set('smtp_user', v)} />
        <Field label="SMTP Password" type="password" value={s.smtp_pass ?? ''} onChange={(v) => set('smtp_pass', v)} />
        <Field label="From" value={s.email_from ?? ''} onChange={(v) => set('email_from', v)} placeholder="noreply@example.com" />
        <Field label="To" value={s.email_to ?? ''} onChange={(v) => set('email_to', v)} placeholder="you@example.com" />
        <div className="flex gap-3 items-center flex-wrap">
          <button
            onClick={() => saveSection(emailKeys, setEmailStatus)}
            className="bg-indigo-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-indigo-700"
          >
            Save
          </button>
          <button
            onClick={testEmail}
            className="border border-gray-300 px-4 py-2 rounded text-sm font-medium hover:bg-gray-50"
          >
            Send test
          </button>
          <StatusMsg status={emailStatus} />
        </div>
      </Section>

      {/* Retention */}
      <Section title="Event Retention">
        <Field
          label="Retention (days; 0 = keep forever)"
          value={s.retention_days ?? '0'}
          onChange={(v) => set('retention_days', v)}
          placeholder="0"
        />
        <div className="flex gap-3 items-center flex-wrap">
          <button
            onClick={() => saveSection(retentionKeys, setRetentionStatus)}
            className="bg-indigo-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-indigo-700"
          >
            Save
          </button>
          <StatusMsg status={retentionStatus} />
        </div>
      </Section>
    </div>
  );
}
