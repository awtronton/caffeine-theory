import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  AlertCircle,
  ArrowDownUp,
  BadgeCheck,
  Building2,
  CalendarDays,
  ChevronDown,
  ClipboardList,
  Database,
  FileCheck2,
  FileSpreadsheet,
  Globe2,
  Landmark,
  Mail,
  MapPin,
  PencilLine,
  Phone,
  Printer,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Scale,
  UsersRound,
  WalletCards,
  X,
} from 'lucide-react'

import DashboardLayout from '../layouts/DashboardLayout'
import WorkspacePageHeader from '../components/ui/WorkspacePageHeader'
import {
  getBanks,
  getBankOpsOverview,
  saveBankOpsProfile,
  getOpsFinancialSources,
  getOpsFinancialMappings,
  saveOpsFinancialMapping,
  deleteOpsFinancialMapping,
  getBankOpsFinancial,
  getOpsReconciliation,
  previewOpsFinancialFormula,
} from '../services/dataWarehouseService'

import '../styles/bank-ops-vibe.css'

const PROFILE_FIELDS = [
  'legal_name',
  'address',
  'city',
  'province',
  'website',
  'email',
  'phone',
  'status_pengawasan',
  'status_date',
]

const FINANCIAL_METRICS = [
  { key: 'total_assets', label: 'Total Aset' },
  { key: 'total_deposits', label: 'Total Dana Pihak Ketiga' },
  { key: 'savings', label: 'Tabungan', child: true },
  { key: 'term_deposits', label: 'Deposito', child: true },
  { key: 'total_loans', label: 'Total Kredit (Baki Debet)' },
  { key: 'interbank_placements', label: 'Penempatan pada Bank Lain' },
  { key: 'foreclosed_assets', label: 'AYDA' },
  { key: 'current_year_profit', label: 'Laba (Rugi) Tahun Berjalan' },
  { key: 'prior_year_profit', label: 'Laba (Rugi) Tahun Lalu' },
  { key: 'operating_income', label: 'Pendapatan Operasional' },
  { key: 'operating_expenses', label: 'Beban Operasional' },
  { key: 'paid_up_capital', label: 'Modal Disetor' },
  { key: 'total_capital', label: 'Total Modal' },
  { key: 'core_capital', label: 'Modal Inti', child: true },
  { key: 'supplementary_capital', label: 'Modal Pelengkap', child: true },
  { key: 'written_off_loans', label: 'Kredit yang Dihapusbuku' },
  { key: 'car', label: 'Rasio KPMM (CAR)', ratio: true },
  { key: 'npl_gross', label: 'NPL Gross', ratio: true },
  { key: 'roa', label: 'ROA', ratio: true },
  { key: 'bopo', label: 'BOPO', ratio: true },
  { key: 'nim', label: 'NIM', ratio: true },
  { key: 'cash_ratio', label: 'Cash Ratio (CR)', ratio: true },
  { key: 'ldr', label: 'LDR', ratio: true },
  { key: 'liquid_assets_ratio', label: 'Total Aset Likuid terhadap Total Aset', ratio: true },
]

const HEALTH_COMPONENTS = [
  { label: 'Profil Risiko' },
  { label: 'Risiko Kredit', child: true },
  { label: 'Risiko Operasional', child: true },
  { label: 'Risiko Kepatuhan', child: true },
  { label: 'Risiko Likuiditas', child: true },
  { label: 'Tata Kelola' },
  { label: 'Permodalan' },
  { label: 'Rentabilitas' },
]

const EMPTY_PROFILE = Object.fromEntries(
  PROFILE_FIELDS.map((field) => [field, '']),
)

function formatNumber(value) {
  return new Intl.NumberFormat('id-ID').format(Number(value || 0))
}

function formatDate(value) {
  if (!value) return 'Belum ditetapkan'
  const parsed = new Date(`${value}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return value
  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(parsed)
}

function formatPeriod(period, short = false) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period || '')) return '—'
  const [year, month] = period.split('-').map(Number)
  const date = new Date(year, month - 1, 1)
  return new Intl.DateTimeFormat('id-ID', {
    month: short ? 'short' : 'long',
    year: short ? '2-digit' : 'numeric',
  }).format(date)
}

function financialPeriodLabels(period) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period || '')) {
    return ['Des lalu', 'Bulan lalu', 'Bulan ini']
  }
  const [year, month] = period.split('-').map(Number)
  const previous = new Date(year, month - 2, 1)
  const prevKey = `${previous.getFullYear()}-${String(
    previous.getMonth() + 1,
  ).padStart(2, '0')}`
  return [
    `Des'${String(year - 1).slice(-2)}`,
    formatPeriod(prevKey, true),
    formatPeriod(period, true),
  ]
}

function OpsSection({ icon: Icon, title, badge, children, className = '' }) {
  return (
    <section className={`ops-card ${className}`}>
      <div className="ops-card-heading">
        <span className="ops-card-heading-title">
          {Icon && <Icon size={14} strokeWidth={1.8} />}
          {title}
        </span>
        {badge && <span className="ops-card-badge">{badge}</span>}
      </div>
      {children}
    </section>
  )
}

function PendingContent({ text = 'Data belum tersedia.', stage }) {
  return (
    <div className="ops-pending">
      <span>{text}</span>
      {stage && <small>{stage}</small>}
    </div>
  )
}

function EmptyRoster({ columns, stage }) {
  return (
    <div className="ops-table-scroll">
      <table className="ops-table ops-roster-table">
        <thead>
          <tr>
            {columns.map((column) => <th key={column}>{column}</th>)}
          </tr>
        </thead>
      </table>
      <PendingContent text="Belum ada data yang diinput." stage={stage} />
    </div>
  )
}

function BankPicker({ banks, value, onChange, disabled }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [focusedIndex, setFocusedIndex] = useState(0)
  const wrapperRef = useRef(null)
  const inputRef = useRef(null)

  const selected = banks.find((bank) => String(bank.bank_id) === String(value))
  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    return banks.filter((bank) =>
      bank.bank_name.toLowerCase().includes(keyword),
    )
  }, [banks, query])

  useEffect(() => {
    if (!open) return undefined
    inputRef.current?.focus()
    function handleOutside(event) {
      if (!wrapperRef.current?.contains(event.target)) setOpen(false)
    }
    function handleEscape(event) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', handleOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('pointerdown', handleOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [open])

  function choose(bank) {
    onChange(String(bank.bank_id))
    setQuery('')
    setFocusedIndex(0)
    setOpen(false)
  }

  function handleSearchKey(event) {
    if (event.key === 'ArrowDown' && filtered.length) {
      event.preventDefault()
      setFocusedIndex((index) => Math.min(index + 1, filtered.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setFocusedIndex((index) => Math.max(0, index - 1))
    } else if (event.key === 'Enter' && filtered.length) {
      event.preventDefault()
      choose(filtered[Math.min(focusedIndex, filtered.length - 1)])
    }
  }

  return (
    <div className="ops-bank-picker" ref={wrapperRef}>
      <button
        type="button"
        className={`ops-select-button ${open ? 'is-open' : ''}`}
        aria-label="Pilih BPR"
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => {
          setOpen((current) => !current)
          setQuery('')
          setFocusedIndex(0)
        }}
      >
        <Building2 size={14} />
        <span>{selected?.bank_name || 'Pilih BPR'}</span>
        <ChevronDown size={14} />
      </button>
      {open && (
        <div className="ops-bank-popover">
          <div className="ops-bank-search">
            <Search size={14} />
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value)
                setFocusedIndex(0)
              }}
              onKeyDown={handleSearchKey}
              placeholder="Cari nama BPR..."
              aria-label="Cari nama BPR"
            />
          </div>
          <div className="ops-bank-options" role="listbox" aria-label="Daftar BPR">
            {filtered.map((bank, index) => (
              <button
                key={bank.bank_id}
                type="button"
                role="option"
                aria-selected={String(bank.bank_id) === String(value)}
                className={`ops-bank-option ${
                  String(bank.bank_id) === String(value) ? 'is-selected' : ''
                } ${focusedIndex === index ? 'is-focused' : ''}`}
                onMouseEnter={() => setFocusedIndex(index)}
                onClick={() => choose(bank)}
              >
                {bank.bank_name}
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="ops-bank-empty">Tidak ada BPR yang cocok.</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function ProfileEditor({ bank, profile, saving, error, onClose, onSave }) {
  const [form, setForm] = useState(() => ({
    ...EMPTY_PROFILE,
    ...Object.fromEntries(
      PROFILE_FIELDS.map((key) => [key, profile?.[key] ?? '']),
    ),
  }))

  function setField(key, value) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function submit(event) {
    event.preventDefault()
    onSave({
      ...form,
      status_date: form.status_date || null,
    })
  }

  return (
    <div className="ops-modal-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !saving) onClose()
    }}>
      <form className="ops-modal" onSubmit={submit} aria-label="Edit profil bank">
        <div className="ops-modal-header">
          <div>
            <div className="ops-eyebrow">MASTER BANK</div>
            <h2>Edit profil {bank.bank_name}</h2>
            <p>Informasi ini tersimpan berdasarkan bank_id di PostgreSQL.</p>
          </div>
          <button type="button" className="ops-icon-button" aria-label="Tutup" onClick={onClose} disabled={saving}>
            <X size={17} />
          </button>
        </div>
        <div className="ops-modal-body">
          <label className="ops-field ops-field-wide">
            <span>Nama resmi BPR</span>
            <input value={form.legal_name} maxLength={200} placeholder={`Contoh: PT ${bank.bank_name}`}
              onChange={(event) => setField('legal_name', event.target.value)} />
          </label>
          <label className="ops-field ops-field-wide">
            <span>Alamat kantor pusat</span>
            <textarea rows={2} value={form.address} maxLength={5000} placeholder="Alamat kantor pusat"
              onChange={(event) => setField('address', event.target.value)} />
          </label>
          <label className="ops-field">
            <span>Kota/Kabupaten</span>
            <input value={form.city} maxLength={120} onChange={(event) => setField('city', event.target.value)} />
          </label>
          <label className="ops-field">
            <span>Provinsi</span>
            <input value={form.province} maxLength={120} onChange={(event) => setField('province', event.target.value)} />
          </label>
          <label className="ops-field">
            <span>Website</span>
            <input value={form.website} maxLength={255} placeholder="https://..."
              onChange={(event) => setField('website', event.target.value)} />
          </label>
          <label className="ops-field">
            <span>Email</span>
            <input value={form.email} maxLength={255} placeholder="email@bank.co.id"
              onChange={(event) => setField('email', event.target.value)} />
          </label>
          <label className="ops-field">
            <span>Telepon</span>
            <input value={form.phone} maxLength={80} onChange={(event) => setField('phone', event.target.value)} />
          </label>
          <label className="ops-field">
            <span>Status pengawasan</span>
            <input value={form.status_pengawasan} maxLength={120} placeholder="Contoh: Normal"
              onChange={(event) => setField('status_pengawasan', event.target.value)} />
          </label>
          <label className="ops-field">
            <span>Tanggal penetapan status</span>
            <input type="date" value={form.status_date}
              onChange={(event) => setField('status_date', event.target.value)} />
          </label>
        </div>
        {error && <div className="ops-modal-error" role="alert"><AlertCircle size={14} />{error}</div>}
        <div className="ops-modal-actions">
          <button type="button" className="ops-button ops-button-secondary" onClick={onClose} disabled={saving}>Batal</button>
          <button type="submit" className="ops-button ops-button-primary" disabled={saving}>
            {saving ? <RefreshCw size={14} className="ops-spin" /> : <Save size={14} />}
            {saving ? 'Menyimpan...' : 'Simpan Profil'}
          </button>
        </div>
      </form>
    </div>
  )
}

const EMPTY_FINANCIAL_FORM = {
  table_name: '', value_column: '', account_column: '', account_value: '',
  aggregation: 'sum', multiplier: '1',
}

function formatOpsValue(value, ratio = false) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—'
  return new Intl.NumberFormat('id-ID', {
    minimumFractionDigits: ratio ? 2 : 0,
    maximumFractionDigits: ratio ? 2 : 0,
  }).format(Number(value)) + (ratio ? '%' : '')
}

function formatOpsChange(value, ratio = false) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—'
  return new Intl.NumberFormat('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .format(Number(value)) + (ratio ? ' pp' : '%')
}

function DirectMappingEditor({ metric, sources, saving, error, onSave, onDelete, onCancel, modeSwitch }) {
  const [form, setForm] = useState(() => ({
    ...EMPTY_FINANCIAL_FORM,
    aggregation: metric.kind === 'ratio' ? 'single' : 'sum',
    ...Object.fromEntries(Object.entries(metric.mapping?.mode === 'formula' ? {} : (metric.mapping || {})).map(([k,v]) => [k, v ?? ''])),
  }))
  const table = sources.find((item) => item.table_name === form.table_name)
  const columns = table?.columns || []
  const valueColumns = columns.filter((column) => column.is_numeric && !column.masked)
  const change = (key, value) => setForm((current) => ({ ...current, [key]: value }))
  return (
    <div className="ops-mapping-overlay" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel() }}>
      <div className="ops-mapping-dialog" role="dialog" aria-modal="true" aria-label="Pemetaan indikator OPS">
        <div className="ops-mapping-dialog-header">
          <div><span className="ops-eyebrow">FINANCIAL SOURCE MAPPING</span><h3>{metric.label}</h3></div>
          <button type="button" className="ops-icon-button" onClick={onCancel} aria-label="Tutup"><X size={16}/></button>
        </div>
        {modeSwitch}
        {error && <p className="ops-financial-error" role="alert">{error}</p>}
        <form onSubmit={(event) => { event.preventDefault(); onSave(metric.metric_key, form) }}>
          <label>Tabel sumber
            <select required value={form.table_name} onChange={(event) => setForm((current) => ({...current, table_name: event.target.value, value_column:'', account_column:'', account_value:''}))}>
              <option value="">Pilih tabel</option>
              {sources.map((source) => <option key={source.table_name} value={source.table_name}>{source.table_name}</option>)}
            </select>
          </label>
          <label>Kolom nilai (numeric, unmasked)
            <select required value={form.value_column} onChange={(event) => change('value_column', event.target.value)}>
              <option value="">Pilih kolom nilai</option>
              {valueColumns.map((column) => <option key={column.name} value={column.name}>{column.name} ({column.data_type})</option>)}
            </select>
          </label>
          <label>Kolom kode akun (opsional)
            <select value={form.account_column} onChange={(event) => change('account_column', event.target.value)}>
              <option value="">Tidak menggunakan filter akun</option>
              {columns.map((column) => <option key={column.name} value={column.name}>{column.name}</option>)}
            </select>
          </label>
          <label>Nilai kode akun {form.account_column ? '(wajib)' : '(kosongkan)'}
            <input value={form.account_value} disabled={!form.account_column} required={!!form.account_column}
              onChange={(event) => change('account_value', event.target.value)} placeholder="Isi kode persis seperti pada sumber" />
          </label>
          <div className="ops-mapping-form-row">
            <label>Agregasi
              <select value={metric.kind==='ratio' ? 'single' : form.aggregation}
                disabled={metric.kind==='ratio'} onChange={(event) => change('aggregation', event.target.value)}>
                <option value="sum">SUM (jumlah baris)</option>
                <option value="single">SINGLE (tepat 1 baris)</option>
              </select>
            </label>
            <label>Multiplier
              <select value={String(form.multiplier)} onChange={(event) => change('multiplier', event.target.value)}>
                <option value="1">1 (nilai sesuai sumber)</option>
                <option value="100">100 (rasio 0,58 → 58%)</option>
                <option value="1000">1.000</option>
                <option value="1000000">1.000.000</option>
              </select>
            </label>
          </div>
          <p className="ops-mapping-note">Mapping berlaku untuk semua BPR dengan struktur tabel yang sama. Filter bank_id, bulan, tahun diterapkan otomatis. Pastikan kode akun, satuan dan agregasi sesuai definisi laporan. Data tidak ditampilkan bila mapping belum tersimpan atau sumber ambigu.</p>
          <div className="ops-mapping-actions">
            {metric.mapping && <button type="button" className="ops-button ops-button-danger" disabled={saving} onClick={() => onDelete(metric.metric_key)}>Hapus mapping</button>}
            <button type="button" className="ops-button ops-button-secondary" onClick={onCancel}>Batal</button>
            <button type="submit" className="ops-button ops-button-primary" disabled={saving || !form.table_name || !form.value_column}>{saving ? 'Menyimpan...' : 'Simpan mapping'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

function FormulaMappingEditor({ metric, metrics, sources, saving, error, onSave, onDelete, onCancel, modeSwitch, bankId, period }) {
  const initial = metric.mapping?.mode === 'formula' ? metric.mapping : null
  const [expression, setExpression] = useState(initial?.expression || '')
  const [components, setComponents] = useState(() =>
    initial?.components?.length ? initial.components : [{ symbol: 'A', ...EMPTY_FINANCIAL_FORM }],
  )
  const [previewResult, setPreviewResult] = useState(null)
  const [previewError, setPreviewError] = useState('')
  const [previewing, setPreviewing] = useState(false)
  async function runPreview() {
    if (!bankId || !period) { setPreviewError('Pilih bank dan periode OPS terlebih dahulu.'); return }
    setPreviewing(true)
    setPreviewResult(null)
    setPreviewError('')
    try {
      const result = await previewOpsFinancialFormula({
        bank_id:bankId, period, metric_key:metric.metric_key, expression, components,
      })
      setPreviewResult(result)
    } catch (err) {
      setPreviewError(err.message || 'Preview gagal.')
    } finally {
      setPreviewing(false)
    }
  }
  const updateComponent = (index, fields) => setComponents((current) => current.map((item, i) =>
    i === index ? { ...item, ...fields } : item,
  ))
  const addComponent = () => {
    if (components.length >= 12) return
    const taken = new Set(components.map((c) => c.symbol))
    const name = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').find((letter) => !taken.has(letter)) || `X${components.length + 1}`
    setComponents((current) => [...current, { symbol: name, ...EMPTY_FINANCIAL_FORM }])
  }
  const metricRefs = metrics.filter((m) => m.metric_key !== metric.metric_key)
  const appendToken = (token) => setExpression((value) => `${value}${value && !value.endsWith(' ') ? ' ' : ''}${token}`)
  return (
    <div className="ops-mapping-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel() }}>
      <div className="ops-mapping-dialog ops-formula-dialog" role="dialog" aria-modal="true" aria-label={`Formula ${metric.label}`}>
        <div className="ops-mapping-dialog-header">
          <div><span className="ops-eyebrow">MULTI-SOURCE FORMULA</span><h3>{metric.label}</h3></div>
          <button type="button" className="ops-icon-button" onClick={onCancel} aria-label="Tutup"><X size={16}/></button>
        </div>
        {modeSwitch}
        {error && <p className="ops-financial-error" role="alert">{error}</p>}
        <form onSubmit={(event) => { event.preventDefault(); onSave(metric.metric_key, { mode:'formula', expression, components }) }}>
          <div className="ops-formula-help">Setiap komponen dihitung terpisah pada <code>bank_id</code>, <code>bulan</code>, dan <code>tahun</code> yang sama. Setelah itu formula dievaluasi; tidak ada JOIN antar-tabel.</div>
          <div className="ops-formula-section-top">
            <strong>Komponen sumber ({components.length}/12)</strong>
            <button type="button" className="ops-mapping-edit" onClick={addComponent} disabled={components.length >= 12}>+ Tambah komponen</button>
          </div>
          {components.map((component, index) => {
            const source = sources.find((row) => row.table_name === component.table_name)
            const columns = source?.columns || []
            const numeric = columns.filter((col) => col.is_numeric && !col.masked)
            return (
              <div className="ops-formula-component" key={index}>
                <div className="ops-formula-component-top">
                  <label>Simbol <input required maxLength={20} value={component.symbol} onChange={(event) => updateComponent(index, { symbol:event.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '') })} placeholder="A" /></label>
                  <label>Tabel sumber
                    <select required value={component.table_name || ''} onChange={(event) => updateComponent(index, { table_name:event.target.value, value_column:'', account_column:'', account_value:'' })}>
                      <option value="">Pilih tabel</option>
                      {sources.map((item) => <option key={item.table_name} value={item.table_name}>{item.table_name}</option>)}
                    </select>
                  </label>
                  <label>Kolom numerik
                    <select required value={component.value_column || ''} onChange={(event) => updateComponent(index, { value_column:event.target.value })}>
                      <option value="">Pilih kolom</option>
                      {numeric.map((col) => <option key={col.name} value={col.name}>{col.name}</option>)}
                    </select>
                  </label>
                  <button type="button" className="ops-formula-delete-component" disabled={components.length <= 1} onClick={() => setComponents((current) => current.filter((_, i) => i !== index))} title="Hapus komponen" aria-label="Hapus komponen"><X size={13}/></button>
                </div>
                <div className="ops-formula-component-bottom">
                  <label>Kolom kode akun
                    <select value={component.account_column || ''} onChange={(event) => updateComponent(index, { account_column:event.target.value, account_value:'' })}>
                      <option value="">Tanpa filter</option>
                      {columns.map((col) => <option key={col.name} value={col.name}>{col.name}</option>)}
                    </select>
                  </label>
                  <label>Nilai kode akun <input value={component.account_value || ''} disabled={!component.account_column} required={!!component.account_column} onChange={(event) => updateComponent(index, { account_value:event.target.value })} placeholder="Kode akun" /></label>
                  <label>Agregasi
                    <select value={component.aggregation || 'sum'} onChange={(event) => updateComponent(index, { aggregation:event.target.value })}>
                      <option value="sum">SUM</option><option value="single">SINGLE</option>
                    </select>
                  </label>
                  <label>Multiplier
                    <input type="number" step="any" required value={component.multiplier ?? 1} onChange={(event) => updateComponent(index, { multiplier:event.target.value })}/>
                  </label>
                </div>
              </div>
            )
          })}
          <label className="ops-formula-expression-label">Formula
            <input required spellCheck={false} value={expression} maxLength={400} onChange={(event) => setExpression(event.target.value)} placeholder="Contoh: (A / B) * 100" />
          </label>
          <div className="ops-formula-token-row">
            {components.filter((c) => c.symbol).map((c, i) => <button type="button" key={`${c.symbol}-${i}`} onClick={() => appendToken(c.symbol)}>{c.symbol}</button>)}
            {['+', '-', '*', '/', '(', ')', '100'].map((token) => <button type="button" key={token} onClick={() => appendToken(token)}>{token}</button>)}
          </div>
          <label className="ops-formula-expression-label">Referensi indikator lain (opsional)
            <select value="" onChange={(event) => { if(event.target.value) appendToken(`metric_${event.target.value}`) }}>
              <option value="">Tambahkan referensi indikator...</option>
              {metricRefs.map((item) => <option key={item.metric_key} value={item.metric_key}>{item.label} ({'metric_' + item.metric_key})</option>)}
            </select>
          </label>
          <div className="ops-formula-preview-area">
            <button type="button" className="ops-button ops-button-secondary" disabled={previewing || !expression.trim() || !bankId || !period} onClick={runPreview}>
              {previewing ? 'Menghitung...' : 'Preview perhitungan (tidak disimpan)'}
            </button>
            {previewError && <p className="ops-financial-error" role="alert">{previewError}</p>}
            {previewResult?.metric && <div className="ops-formula-preview-grid">
              {(previewResult.reference_periods || []).map((label, index) => <div key={label}>
                <strong>{label} · {formatOpsValue(previewResult.metric.values?.[index], metric.kind === 'ratio')}</strong>
                <small>{previewResult.metric.period_status?.[index]}</small>
                {(previewResult.metric.formula_trace?.[index] || []).map((row, i) => <span key={i}>
                  <code>{row.symbol}</code>: {row.value ?? '—'} ({row.status})
                  {row.type === 'source' ? ` · ${row.table_name}.${row.value_column}` : ` · ${row.metric_key}`}
                </span>)}
              </div>)}
            </div>}
          </div>
          <p className="ops-mapping-note">Ekspresi hanya boleh menggunakan angka, nama komponen, referensi <code>metric_...</code>, dan operator + − × ÷ ( ). Referensi indikator dapat dipakai ulang. Nilai sumber kosong, ambigu, atau pembagian dengan nol menghasilkan status error, bukan angka 0. Rumus hanya disimpan setelah lolos validasi.</p>
          <div className="ops-mapping-actions">
            {metric.mapping && <button type="button" className="ops-button ops-button-danger" disabled={saving} onClick={() => onDelete(metric.metric_key)}>Hapus mapping</button>}
            <button type="button" className="ops-button ops-button-secondary" onClick={onCancel}>Batal</button>
            <button type="submit" className="ops-button ops-button-primary" disabled={saving || !expression.trim()}>{saving ? 'Menyimpan...' : 'Simpan formula'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

function FinancialMappingEditor(props) {
  const [mode, setMode] = useState(props.metric.mapping?.mode === 'formula' ? 'formula' : 'direct')
  const switcher = (
      <div className="ops-mapping-mode-switch" role="group" aria-label="Metode perhitungan indikator">
        <button type="button" className={mode === 'direct' ? 'is-active' : ''} onClick={() => setMode('direct')}>Direct Mapping</button>
        <button type="button" className={mode === 'formula' ? 'is-active' : ''} onClick={() => setMode('formula')}>Formula Builder</button>
      </div>
  )
  return mode === 'formula'
    ? <FormulaMappingEditor {...props} modeSwitch={switcher} />
    : <DirectMappingEditor {...props} modeSwitch={switcher} />
}

function DetailBPR() {
  const [searchParams, setSearchParams] = useSearchParams()
  const bankId = searchParams.get('bank_id') || ''
  const [banks, setBanks] = useState([])
  const [bankError, setBankError] = useState('')
  const [loadingBanks, setLoadingBanks] = useState(true)
  const [overview, setOverview] = useState(null)
  const [loadingOps, setLoadingOps] = useState(false)
  const [opsError, setOpsError] = useState('')
  const [refreshToken, setRefreshToken] = useState(0)
  const [selectedPeriod, setSelectedPeriod] = useState('')
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [notice, setNotice] = useState('')
  const [financialMappings, setFinancialMappings] = useState([])
  const [financialSources, setFinancialSources] = useState([])
  const [financialResult, setFinancialResult] = useState(null)
  const [financialError, setFinancialError] = useState('')
  const [mappingEditor, setMappingEditor] = useState(null)
  const [mappingSaving, setMappingSaving] = useState(false)
  const [traceMetric, setTraceMetric] = useState('')
  const [financialRefresh, setFinancialRefresh] = useState(0)
  const [reconcileOpen, setReconcileOpen] = useState(false)
  const [reconcileTable, setReconcileTable] = useState('')
  const [reconcileColumns, setReconcileColumns] = useState({assets:'', liabilities:'', equity:'', derived:''})
  const [reconcileResult, setReconcileResult] = useState(null)
  const [reconcileBusy, setReconcileBusy] = useState(false)
  const [reconcileError, setReconcileError] = useState('')


  useEffect(() => {
    let active = true
    getBanks()
      .then((result) => {
        if (!active) return
        const items = Array.isArray(result?.banks) ? result.banks : []
        setBanks(items)
        if (items.length && !items.some((bank) => String(bank.bank_id) === bankId)) {
          setSearchParams({ bank_id: String(items[0].bank_id) }, { replace: true })
        }
      })
      .catch((error) => {
        if (active) setBankError(error.message)
      })
      .finally(() => {
        if (active) setLoadingBanks(false)
      })
    return () => { active = false }
    // Initial master bank fetch; bank changes are handled by the next effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!bankId || !banks.some((bank) => String(bank.bank_id) === bankId)) return undefined
    let active = true
    setLoadingOps(true)
    setOpsError('')
    setOverview(null)
    getBankOpsOverview(bankId)
      .then((result) => {
        if (!active) return
        setOverview(result)
        const periods = result.coverage?.available_periods || []
        setSelectedPeriod((previous) =>
          periods.some((item) => item.period === previous)
            ? previous
            : (periods[0]?.period || ''),
        )
      })
      .catch((error) => {
        if (active) setOpsError(error.message)
      })
      .finally(() => {
        if (active) setLoadingOps(false)
      })
    return () => { active = false }
  }, [bankId, banks, refreshToken])

  useEffect(() => {
    let active = true
    Promise.all([getOpsFinancialMappings(), getOpsFinancialSources()])
      .then(([mappings, sources]) => {
        if (!active) return
        setFinancialMappings(mappings.metrics || [])
        setFinancialSources(sources.tables || [])
      })
      .catch((error) => { if (active) setFinancialError(error.message) })
    return () => { active = false }
  }, [financialRefresh])

  useEffect(() => {
    if (!bankId || !selectedPeriod) {
      setFinancialResult(null)
      return undefined
    }
    let active = true
    setFinancialResult(null)
    getBankOpsFinancial(bankId, selectedPeriod)
      .then((result) => { if (active) setFinancialResult(result) })
      .catch((error) => { if (active) setFinancialError(error.message) })
    return () => { active = false }
  }, [bankId, selectedPeriod, financialRefresh])

  async function saveMapping(metricKey, form) {
    setMappingSaving(true)
    setFinancialError('')
    try {
      await saveOpsFinancialMapping(metricKey, form.mode === 'formula'
        ? { mode:'formula', expression:form.expression, components:form.components }
        : { ...form, mode:'direct', aggregation:form.aggregation || 'sum', multiplier:Number(form.multiplier) })
      setMappingEditor(null)
      setFinancialRefresh((current) => current + 1)
      setNotice('Pemetaan indikator keuangan berhasil disimpan.')
    } catch (error) {
      setFinancialError(error.message)
    } finally { setMappingSaving(false) }
  }

  async function removeMapping(metricKey) {
    setMappingSaving(true)
    try {
      await deleteOpsFinancialMapping(metricKey)
      setMappingEditor(null)
      setFinancialRefresh((current) => current + 1)
      setNotice('Pemetaan indikator dihapus.')
    } catch (error) {
      setFinancialError(error.message)
    } finally { setMappingSaving(false) }
  }

  const selectedBank = banks.find((bank) => String(bank.bank_id) === bankId)
  const currentOverview = String(overview?.bank?.bank_id || '') === bankId
    ? overview
    : null
  const bank = currentOverview?.bank || selectedBank
  const profile = currentOverview?.profile || EMPTY_PROFILE
  const coverage = currentOverview?.coverage
  const periods = coverage?.available_periods || []
  const selectedReconcileSource = financialSources.find((source) => source.table_name === reconcileTable)
  const reconcileNumericColumns = (selectedReconcileSource?.columns || [])
    .filter((column) => column.is_numeric && !column.masked && !['bulan', 'tahun'].includes(column.name))
  const reconcileReady = Boolean(
    bankId && selectedPeriod && reconcileTable &&
    reconcileColumns.assets && reconcileColumns.liabilities && reconcileColumns.equity
  )

  useEffect(() => {
    setReconcileResult(null)
    setReconcileError('')
  }, [bankId, selectedPeriod, reconcileTable, reconcileColumns])

  useEffect(() => {
    if (!reconcileTable && financialSources.length) {
      const suggested = financialSources.find((table) => table.table_name === 'lapbul_0100')
      if (suggested) setReconcileTable(suggested.table_name)
    }
  }, [financialSources, reconcileTable])

  useEffect(() => {
    if (!selectedReconcileSource) return
    const present = new Set(reconcileNumericColumns.map((column) => column.name))
    setReconcileColumns((current) => ({
      assets: current.assets && present.has(current.assets) ? current.assets : (present.has('sandi_1000000000') ? 'sandi_1000000000' : ''),
      liabilities: current.liabilities && present.has(current.liabilities) ? current.liabilities : (present.has('sandi_2000000000') ? 'sandi_2000000000' : ''),
      equity: current.equity && present.has(current.equity) ? current.equity : (present.has('sandi_3000000000') ? 'sandi_3000000000' : ''),
      derived: current.derived && present.has(current.derived) ? current.derived : '',
    }))
  // We only seed suggested columns when the table selection changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reconcileTable, financialSources])

  async function runOpsReconciliation() {
    if (!reconcileReady) return
    setReconcileBusy(true)
    setReconcileError('')
    setReconcileResult(null)
    try {
      const result = await getOpsReconciliation(bankId, selectedPeriod, {
        tableName: reconcileTable,
        assetsColumn: reconcileColumns.assets,
        liabilitiesColumn: reconcileColumns.liabilities,
        equityColumn: reconcileColumns.equity,
        derivedColumn: reconcileColumns.derived,
      })
      setReconcileResult(result)
    } catch (error) {
      setReconcileError(error.message || 'Rekonsiliasi tidak dapat dijalankan.')
    } finally {
      setReconcileBusy(false)
    }
  }

  const periodLabels = financialPeriodLabels(selectedPeriod)
  const selectedPeriodCoverage = periods.find((item) => item.period === selectedPeriod)

  function changeBank(nextId) {
    setEditing(false)
    setNotice('')
    setSelectedPeriod('')
    setSearchParams({ bank_id: nextId })
  }

  async function saveProfile(payload) {
    setSaving(true)
    setSaveError('')
    try {
      const result = await saveBankOpsProfile(bankId, payload)
      setOverview((current) => current ? { ...current, profile: result.profile } : current)
      setEditing(false)
      setNotice('Profil bank berhasil disimpan.')
    } catch (error) {
      setSaveError(error.message)
    } finally {
      setSaving(false)
    }
  }

  const bankDisplayName = profile.legal_name || bank?.bank_name || 'Detail Bank'

  return (
    <DashboardLayout>
      <WorkspacePageHeader
        title="Detail Bank"
        description="Bank Intelligence · One Page Summary (OPS)"
        badge="7A.2"
      />
      <div className="ops-workspace">
        <div className="ops-toolbar">
          <div>
            <div className="ops-eyebrow">BANK INTELLIGENCE / 7A.2</div>
            <h1>One Page Summary</h1>
            <p>Profil dan kesiapan data bank dalam satu tampilan.</p>
          </div>
          <div className="ops-toolbar-actions">
            <div className="ops-toolbar-field">
              <label>Bank</label>
              <BankPicker banks={banks} value={bankId} onChange={changeBank} disabled={loadingBanks || banks.length === 0} />
            </div>
            <div className="ops-toolbar-field ops-period-field">
              <label>Posisi data</label>
              <div className="ops-period-select-wrap">
                <CalendarDays size={14} />
                <select
                  aria-label="Pilih posisi data"
                  value={selectedPeriod}
                  onChange={(event) => setSelectedPeriod(event.target.value)}
                  disabled={!periods.length}
                >
                  {!periods.length && <option value="">Belum tersedia</option>}
                  {periods.map((item) => (
                    <option key={item.period} value={item.period}>{formatPeriod(item.period)}</option>
                  ))}
                </select>
              </div>
            </div>
            <button className="ops-icon-button ops-toolbar-refresh" type="button" title="Refresh data OPS"
              aria-label="Refresh data OPS" disabled={!bankId || loadingOps}
              onClick={() => { setNotice(''); setRefreshToken((value) => value + 1) }}>
              <RefreshCw size={16} className={loadingOps ? 'ops-spin' : ''} />
            </button>
            <button className="ops-button ops-button-secondary ops-print-button" type="button"
              disabled={!currentOverview} onClick={() => window.print()}>
              <Printer size={15} /> Print
            </button>
          </div>
        </div>

        {bankError && <div className="ops-alert ops-alert-error" role="alert"><AlertCircle size={16} />{bankError}</div>}
        {opsError && <div className="ops-alert ops-alert-error" role="alert"><AlertCircle size={16} />{opsError}</div>}
        {notice && <div className="ops-alert ops-alert-success" role="status"><BadgeCheck size={16} />{notice}</div>}
        {(loadingBanks || loadingOps) && <div className="ops-loading"><RefreshCw size={18} className="ops-spin" /> Memuat informasi bank...</div>}

        {currentOverview && !loadingOps && (
          <article className="ops-sheet" id="ops-print-area">
            <div className="ops-sheet-heading">
              <div className="ops-bank-title">
                <span className="ops-eyebrow">ONE PAGE SUMMARY · {bank?.bank_name}</span>
                <h2>{bankDisplayName}</h2>
                <div className="ops-contact-grid">
                  <span><MapPin size={12} />{profile.address || 'Alamat kantor pusat belum diisi'}</span>
                  <span><Globe2 size={12} />{profile.website || 'Website belum diisi'}</span>
                  <span><Mail size={12} />{profile.email || 'Email belum diisi'}</span>
                  {profile.phone && <span><Phone size={12} />{profile.phone}</span>}
                </div>
              </div>
              <div className="ops-bank-meta">
                <span className="ops-bank-status-label">STATUS PENGAWASAN</span>
                <strong className={`ops-status-pill ${profile.status_pengawasan ? 'is-recorded' : ''}`}>
                  {profile.status_pengawasan || 'Belum diisi'}
                </strong>
                <small>Penetapan: {formatDate(profile.status_date)}</small>
                <button className="ops-button ops-button-secondary ops-edit-profile" type="button"
                  onClick={() => { setSaveError(''); setEditing(true) }}>
                  <PencilLine size={13} /> Edit Profil
                </button>
              </div>
            </div>

            <div className="ops-coverage-strip">
              <div><span>Bank ID</span><strong>{bank?.bank_id || '—'}</strong></div>
              <div><span>Tabel terisi</span><strong>{formatNumber(coverage?.tables_with_data)}</strong></div>
              <div><span>Baris data bank</span><strong>{formatNumber(coverage?.rows_for_bank)}</strong></div>
              <div><span>Periode tersedia</span><strong>{formatNumber(coverage?.period_count)}</strong></div>
              <div><span>Posisi dipilih</span><strong>{formatPeriod(selectedPeriod)}</strong></div>
            </div>

            <div className="ops-report-grid">
              <div className="ops-report-column">
                <OpsSection title="Susunan Direksi / Pengurus" icon={UsersRound}>
                  <EmptyRoster columns={['Nama', 'Jabatan', 'Masa Jabatan']} stage="Governance · 7A.3" />
                </OpsSection>
                <OpsSection title="Dewan Komisaris / Pengawas" icon={UsersRound}>
                  <EmptyRoster columns={['Nama', 'Jabatan', 'Masa Jabatan']} stage="Governance · 7A.3" />
                </OpsSection>
                <OpsSection title="Informasi Legalitas" icon={FileCheck2}>
                  <div className="ops-key-value-list">
                    {['Anggaran Dasar', 'Izin Prinsip', 'Izin Usaha', 'Mulai Operasional'].map((label) => (
                      <div key={label}><span>{label}</span><strong>Belum diinput</strong></div>
                    ))}
                  </div>
                </OpsSection>
                <OpsSection title="Tingkat Kesehatan" icon={ShieldCheck} badge="7A.4">
                  <div className="ops-table-scroll">
                    <table className="ops-table ops-health-table">
                      <thead><tr><th>Komponen</th><th>Periode sebelumnya</th><th>Periode saat ini</th></tr></thead>
                      <tbody>
                        {HEALTH_COMPONENTS.map((item) => (
                          <tr key={item.label}>
                            <td className={item.child ? 'ops-indent' : ''}>{item.label}</td>
                            <td className="ops-cell-muted">—</td><td className="ops-cell-muted">—</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="ops-section-note">Data penilaian TKS belum dihubungkan ke sumber penilaian.</p>
                </OpsSection>
                <OpsSection title="Produk / Jasa" icon={WalletCards}>
                  <EmptyRoster columns={['Jenis Produk', 'Keterangan']} stage="Master produk · 7A.3" />
                </OpsSection>
                <OpsSection title="Supervisory Concern & Action" icon={ClipboardList} badge="7A.5">
                  <div className="ops-supervisory-status">
                    <span>Status: <strong>{profile.status_pengawasan || 'Belum diisi'}</strong></span>
                    <span>Penetapan: <strong>{formatDate(profile.status_date)}</strong></span>
                  </div>
                  <EmptyRoster columns={['Supervisory Concern', 'Supervisory Action']} stage="Input pengawas · 7A.5" />
                </OpsSection>
              </div>

              <div className="ops-report-column">
                <OpsSection title="Komposisi Pemegang Saham / Pendiri" icon={Landmark}>
                  <EmptyRoster columns={['Nama Pemilik', 'Nominal', '%', 'PSP / Bukan']} stage="Governance · 7A.3" />
                </OpsSection>
                <OpsSection title="Jaringan Kantor" icon={Building2}>
                  <EmptyRoster columns={['Kantor Cabang / Outlet', 'Alamat']} stage="Master kantor · 7A.3" />
                </OpsSection>
                <OpsSection title="Kinerja Keuangan" icon={ArrowDownUp} badge="Auto Mapping · 7A.2" className="ops-financial-card">
                  <div className="ops-financial-context">
                    <div>
                      <strong>Posisi {formatPeriod(selectedPeriod)}</strong>
                      <small>Angka berasal dari PostgreSQL setelah pemetaan indikator dikonfirmasi.</small>
                    </div>
                    <span className="ops-outline-badge">{financialMappings.filter((item) => item.mapping).length} / {FINANCIAL_METRICS.length} dipetakan</span>
                  </div>
                  {financialError && <p className="ops-financial-error" role="alert">{financialError}</p>}
                  <div className="ops-table-scroll">
                    <table className="ops-table ops-financial-table">
                      <thead><tr><th>Komponen</th>{periodLabels.map((label) => <th key={label}>{label}</th>)}<th>YtD</th><th>MoM</th><th className="ops-financial-edit-head">Mapping</th></tr></thead>
                      {FINANCIAL_METRICS.map((item) => {
                          const result = financialResult?.metrics?.find((metric) => metric.metric_key === item.key)
                          const config = financialMappings.find((metric) => metric.metric_key === item.key)
                          const values = result?.values || [null, null, null]
                          return (
                            <tbody key={item.key}>
                            <tr title={result?.period_status?.join(' / ') || 'Belum tersedia'}>
                              <td className={item.child ? 'ops-indent' : ''}>{item.label}</td>
                              {values.map((value, index) => <td key={index} className={value === null ? 'ops-cell-muted' : 'ops-financial-value'}>{formatOpsValue(value, item.ratio)}</td>)}
                              <td className="ops-financial-value">{formatOpsChange(result?.ytd, item.ratio)}</td>
                              <td className="ops-financial-value">{formatOpsChange(result?.mom, item.ratio)}</td>
                              <td className="ops-financial-edit-cell"><button type="button" className={config?.mapping ? 'ops-mapping-edit is-mapped' : 'ops-mapping-edit'}
                                aria-label={`Mapping ${item.label}`} onClick={() => { setFinancialError(''); setMappingEditor(config || { metric_key:item.key, label:item.label, kind:item.ratio ? 'ratio' : 'amount', mapping:null }) }}>
                                <PencilLine size={12}/>{config?.mapping ? 'Mapped' : 'Map'}</button>
                                {result?.mapping && <button type="button" className="ops-mapping-edit ops-trace-button" title="Lihat asal nilai dan status sumber" onClick={() => setTraceMetric((key) => key === item.key ? '' : item.key)}>Trace</button>}
                              </td>
                            </tr>
                            {traceMetric === item.key && result?.mapping && (
                              <tr className="ops-formula-trace-row"><td colSpan={7}>
                                <strong>Source Trace · {item.label}</strong>
                                <div className="ops-formula-trace-grid">
                                  <div>
                                    <b>Definisi dan freshness</b>
                                    <span>Mode: {result.mapping.mode || 'direct'}</span>
                                    <span>Freshness: {result.freshness || '—'}</span>
                                    {result.mapping.mode === 'formula' && <span>Formula: <code>{result.mapping.expression}</code></span>}
                                    {(result.source_lineage || []).map((source, index) => <span key={`${source.table_name}.${source.column_name}-${index}`}>
                                      <code>{source.table_name}.{source.column_name}</code> · {source.kind} · {source.calculation?.status || 'source'}
                                      {source.calculation?.formula && <small>Formula sumber: {source.calculation.formula}</small>}
                                      {source.calculation?.reason && <small>{source.calculation.reason}</small>}
                                    </span>)}
                                  </div>
                                  {periodLabels.map((label, index) => <div key={label}>
                                    <b>{label}</b>
                                    <span>Status: {result.period_status?.[index] || '—'}</span>
                                    <span>Nilai: {formatOpsValue(result.values?.[index], item.ratio)}</span>
                                    {(result.formula_trace?.[index] || []).map((trace, ti) => <span key={`${trace.symbol}-${ti}`}>
                                      <code>{trace.symbol}</code> = {trace.value ?? '—'} · {trace.status}
                                      {trace.type === 'source' ? ` · ${trace.table_name}.${trace.value_column} · ${trace.aggregation} · ${trace.rows ?? 0} row` : ` · ${trace.metric_key}`}
                                    </span>)}
                                  </div>)}
                                </div>
                              </td></tr>)}
                            </tbody>
                          )
                        })}
                    </table>
                  </div>
                  <div className="ops-financial-note"><FileSpreadsheet size={14}/>
                    Nominal: YtD/MoM = pertumbuhan %. Rasio: perubahan dalam pp. Nilai yang tidak tersedia/ambigu ditampilkan —. Angka contoh Excel tidak digunakan.
                  </div>
                </OpsSection>
                <section className="ops-reconciliation-tool" aria-label="Alat bantu pemeriksaan OPS">
                  <div className="ops-reconciliation-tool-row">
                    <div className="ops-reconciliation-tool-label">
                      <span className="ops-reconciliation-tool-title">Pemeriksaan opsional</span>
                      <span className="ops-reconciliation-tool-subtitle">Rekonsiliasi neraca tidak termasuk isi utama OPS</span>
                    </div>
                    <button
                      type="button"
                      className={`ops-reconciliation-toggle ${reconcileOpen ? 'is-open' : ''}`}
                      onClick={() => setReconcileOpen((open) => !open)}
                      aria-expanded={reconcileOpen}
                      aria-controls="ops-reconciliation-panel"
                      aria-label={reconcileOpen ? 'Tutup rekonsiliasi neraca' : 'Buka rekonsiliasi neraca'}
                      title={reconcileOpen ? 'Tutup rekonsiliasi neraca' : 'Buka rekonsiliasi neraca'}
                    >
                      <Scale size={16} strokeWidth={1.8} />
                    </button>
                  </div>
                  {reconcileOpen && (
                    <div id="ops-reconciliation-panel" className="ops-reconciliation-reveal">
                      <OpsSection title="Rekonsiliasi Neraca" icon={ShieldCheck} badge="Checklist · Read-only">
                  <div className="ops-reconcile-description">
                    Cocokkan Total Aset dengan Total Liabilitas + Total Ekuitas menggunakan kolom laporan 0100 yang kamu pilih. Pengaturan hanya dipakai untuk pemeriksaan ini; kode akun tidak disimpan otomatis sebagai mapping resmi OPS.
                  </div>
                  <div className="ops-reconcile-grid">
                    <label>Tabel sumber
                      <select value={reconcileTable} onChange={(event) => {setReconcileTable(event.target.value); setReconcileColumns({assets:'', liabilities:'', equity:'', derived:''})}}>
                        <option value="">Pilih tabel</option>
                        {financialSources.map((source) => <option key={source.table_name} value={source.table_name}>{source.table_name}</option>)}
                      </select>
                    </label>
                    {[
                      ['assets', 'Total Aset'],
                      ['liabilities', 'Total Liabilitas'],
                      ['equity', 'Total Ekuitas'],
                      ['derived', 'Calculated Column (opsional)'],
                    ].map(([key, title]) => <label key={key}>{title}
                      <select value={reconcileColumns[key]} onChange={(event) => setReconcileColumns((prev) => ({...prev, [key]:event.target.value}))}>
                        <option value="">{key === 'derived' ? 'Tanpa pembanding turunan' : 'Pilih kolom'}</option>
                        {reconcileNumericColumns.map((column) => <option key={column.name} value={column.name}>{column.name}</option>)}
                      </select>
                    </label>)}
                  </div>
                  <div className="ops-reconcile-actions">
                    <button type="button" className="ops-button ops-button-secondary" disabled={!reconcileReady || reconcileBusy} onClick={runOpsReconciliation}>
                      {reconcileBusy ? 'Memeriksa...' : 'Run Reconciliation'}
                    </button>
                    <span>Bank: {banks.find((bank) => String(bank.bank_id) === String(bankId))?.bank_name || '—'} · Posisi: {formatPeriod(selectedPeriod)}</span>
                  </div>
                  {reconcileError && <p className="ops-financial-error" role="alert">{reconcileError}</p>}
                  {reconcileResult && <div className="ops-reconcile-results">
                    <strong>Status: {reconcileResult.status === 'balanced' ? 'Balanced' : reconcileResult.status === 'stale_source' ? 'Balanced · sumber stale' : reconcileResult.status}</strong>
                    {reconcileResult.values && <div className="ops-reconcile-values">
                      {Object.entries(reconcileResult.values).map(([key, value]) => <div key={key}><small>{key}</small><b>{value === null ? '—' : formatOpsValue(value, false)}</b></div>)}
                      <div><small>Selisih Neraca</small><b>{reconcileResult.difference === null ? '—' : formatOpsValue(reconcileResult.difference, false)}</b></div>
                      {reconcileResult.derived_difference !== null && <div><small>Selisih Calculated Column</small><b>{formatOpsValue(reconcileResult.derived_difference, false)}</b></div>}
                    </div>}
                    {Object.entries(reconcileResult.provenance || {}).map(([key, source]) => <div className="ops-reconcile-source" key={key}>
                      {key}: <code>{source.table_name}.{source.column_name}</code> · {source.freshness?.status || 'source'}
                      {source.freshness?.formula && <span> · {source.freshness.formula}</span>}
                    </div>)}
                    <p>{reconcileResult.note || 'Pastikan satuan seluruh kolom sama dan hanya ada satu baris per bank-periode.'}</p>
                  </div>}
                      </OpsSection>
                    </div>
                  )}
                </section>
                <OpsSection title="Ketersediaan Data Warehouse" icon={Database} badge="Live metadata">
                  <div className="ops-warehouse-summary">
                    <div>
                      <strong>{selectedPeriodCoverage ? formatNumber(selectedPeriodCoverage.row_count) : '0'}</strong>
                      <span>baris pada periode dipilih</span>
                    </div>
                    <div>
                      <strong>{selectedPeriodCoverage?.table_count || 0}</strong>
                      <span>tabel pada periode dipilih</span>
                    </div>
                  </div>
                  {coverage?.tables?.length ? (
                    <div className="ops-table-scroll">
                      <table className="ops-table ops-warehouse-table">
                        <thead><tr><th>Nama tabel</th><th>Baris bank</th><th>Periode terakhir</th></tr></thead>
                        <tbody>
                          {coverage.tables.map((item) => (
                            <tr key={item.table_name}>
                              <td><Database size={12} />{item.table_name}</td>
                              <td>{formatNumber(item.row_count)}</td>
                              <td>{formatPeriod(item.latest_period, true)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <PendingContent text="Belum ada data warehouse untuk bank ini. Upload data terlebih dahulu." />
                  )}
                  {!!coverage?.failed_tables?.length && (
                    <p className="ops-section-note ops-warning">
                      {coverage.failed_tables.length} tabel tidak dapat dibaca. Periksa log backend.
                    </p>
                  )}
                  <p className="ops-section-note">Jumlah baris hanya menunjukkan ketersediaan data, bukan angka laporan keuangan.</p>
                </OpsSection>
              </div>
            </div>
            <div className="ops-sheet-footer">
              <span>CAFFEINE THEORY · OPS FINANCIAL MAPPING 7A.2</span>
              <span>TKS dan supervisory action menunggu integrasi. Indikator keuangan memerlukan mapping sumber yang disimpan.</span>
            </div>
          </article>
        )}

        {!loadingBanks && !loadingOps && !currentOverview && !opsError && !bankError && (
          <div className="ops-loading">Pilih BPR untuk menampilkan OPS.</div>
        )}
      </div>

      {mappingEditor && <FinancialMappingEditor
        key={mappingEditor.metric_key}
        metric={mappingEditor}
        sources={financialSources}
        metrics={financialMappings}
        bankId={bankId}
        period={selectedPeriod}
        saving={mappingSaving}
        error={financialError}
        onSave={saveMapping}
        onDelete={removeMapping}
        onCancel={() => setMappingEditor(null)}
      />}

      {editing && bank && (
        <ProfileEditor
          key={bankId}
          bank={bank}
          profile={profile}
          saving={saving}
          error={saveError}
          onClose={() => { if (!saving) setEditing(false) }}
          onSave={saveProfile}
        />
      )}
    </DashboardLayout>
  )
}

export default DetailBPR
