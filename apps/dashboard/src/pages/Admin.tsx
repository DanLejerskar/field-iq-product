import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type CSSProperties, useState } from 'react';
import { ApiClient } from '../api/client';
import type { EquipmentRow } from '../api/types';

const api = new ApiClient(
  import.meta.env.VITE_API_HOST ?? 'http://localhost:3000',
  () => localStorage.getItem('jwt') ?? undefined,
);

export function Admin() {
  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 32 }}>
      <h1 style={{ marginTop: 0 }}>Admin</h1>
      <EquipmentPanel />
      <PromptSandbox />
    </div>
  );
}

function EquipmentPanel() {
  const qc = useQueryClient();
  const eq = useQuery({ queryKey: ['equipment'], queryFn: () => api.listEquipment() });
  const [form, setForm] = useState({ name: '', assetTag: '', qrCodeValue: '' });
  const create = useMutation({
    mutationFn: (body: Partial<EquipmentRow>) => api.createEquipment(body),
    onSuccess: () => {
      setForm({ name: '', assetTag: '', qrCodeValue: '' });
      qc.invalidateQueries({ queryKey: ['equipment'] });
    },
  });

  return (
    <section>
      <h2 style={{ fontSize: 16, color: 'var(--ink-dim)' }}>Equipment</h2>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, marginBottom: 16 }}>
        <thead>
          <tr style={{ color: 'var(--ink-dim)', textAlign: 'left' }}>
            <th style={{ padding: '8px 4px', borderBottom: '1px solid var(--border)' }}>Name</th>
            <th style={{ padding: '8px 4px', borderBottom: '1px solid var(--border)' }}>
              Asset tag
            </th>
            <th style={{ padding: '8px 4px', borderBottom: '1px solid var(--border)' }}>
              QR value
            </th>
          </tr>
        </thead>
        <tbody>
          {(eq.data ?? []).map((r) => (
            <tr key={r.id} style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: '8px 4px' }}>{r.name}</td>
              <td style={{ padding: '8px 4px', color: 'var(--ink-dim)' }}>{r.assetTag}</td>
              <td style={{ padding: '8px 4px', color: 'var(--ink-dim)' }}>{r.qrCodeValue}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          placeholder="Name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          style={inputStyle}
        />
        <input
          placeholder="Asset tag"
          value={form.assetTag}
          onChange={(e) => setForm({ ...form, assetTag: e.target.value })}
          style={inputStyle}
        />
        <input
          placeholder="QR value"
          value={form.qrCodeValue}
          onChange={(e) => setForm({ ...form, qrCodeValue: e.target.value })}
          style={inputStyle}
        />
        <button
          onClick={() => create.mutate(form)}
          disabled={!form.name || !form.qrCodeValue || create.isPending}
          style={primaryButton}
        >
          {create.isPending ? 'Adding…' : 'Add'}
        </button>
      </div>
    </section>
  );
}

function PromptSandbox() {
  const [stepId, setStepId] = useState('00000000-0000-0000-0000-000000000000');
  const [prompt, setPrompt] = useState('Look at this photo. Confirm a padlock is visible.');
  const run = useMutation({
    mutationFn: () => api.testPrompt(stepId, { prompt }),
  });

  return (
    <section>
      <h2 style={{ fontSize: 16, color: 'var(--ink-dim)' }}>Prompt sandbox</h2>
      <p style={{ color: 'var(--ink-faint)', fontSize: 13 }}>
        Iterate on a verification prompt against a sample photo. Mock by default; flip
        VERIFIER_MOCK=false + ANTHROPIC_API_KEY on the verifier for a live verdict.
      </p>
      <input
        placeholder="Step id"
        value={stepId}
        onChange={(e) => setStepId(e.target.value)}
        style={{ ...inputStyle, width: '100%', marginBottom: 8 }}
      />
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={5}
        style={{ ...inputStyle, width: '100%', resize: 'vertical' }}
      />
      <button onClick={() => run.mutate()} disabled={run.isPending} style={primaryButton}>
        {run.isPending ? 'Calling…' : 'Run'}
      </button>
      {run.data ? (
        <pre
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: 12,
            marginTop: 12,
            fontSize: 13,
            color: 'var(--ink-dim)',
            overflowX: 'auto',
          }}
        >
          {JSON.stringify(run.data, null, 2)}
        </pre>
      ) : null}
    </section>
  );
}

const inputStyle: CSSProperties = {
  background: 'var(--bg-elev)',
  color: 'var(--ink)',
  border: '1px solid var(--border)',
  padding: '8px 12px',
  borderRadius: 6,
  fontFamily: 'inherit',
};

const primaryButton: CSSProperties = {
  background: 'var(--field)',
  color: 'var(--ink)',
  border: 0,
  padding: '8px 14px',
  borderRadius: 6,
  cursor: 'pointer',
  marginTop: 8,
};
