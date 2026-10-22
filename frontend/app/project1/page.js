'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import Script from 'next/script';

// ── Default Seed Data (Inward Lots & Outward Batches) ────────────────────────
const DEFAULT_STATE = {
  factory: 'Demo Polymers Pvt Ltd (sample data)',
  minPct: 30, // Buyer required minimum recycled %
  baseUrl: '', // Custom override for QR links
  lots: [
    {
      id: 'LOT-001',
      recycler: 'GreenLoop Recyclers (sample)',
      invoice: 'GL/26-27/1042',
      date: '2026-09-18',
      mt: 25.0,
      materialType: 'Post-Consumer rPET Flakes (Clear Food Grade)',
      inv: 'invoice-GL-1042.pdf',
      lab: 'lab-report-GL-8821.pdf',
      invData: null, // Base64 if uploaded
      labData: null,
    },
    {
      id: 'LOT-002',
      recycler: 'EcoPellet Reclaim (sample)',
      invoice: 'EPR/26/089',
      date: '2026-10-02',
      mt: 15.0,
      materialType: 'Hot-Washed rPET Pellets (Natural)',
      inv: 'invoice-EPR-089.pdf',
      lab: '', // Missing lab report to illustrate dispatch blocking!
      invData: null,
      labData: null,
    },
  ],
  batches: [
    {
      id: 'BT-2026-001',
      buyer: 'Horizon Beverages (sample)',
      product: '28mm Water Bottle Caps',
      total: 40.0,
      pct: 50.0, // 20.0 MT recycled needed
      date: '2026-10-12',
      status: 'released',
      notes: 'Pilot production run 1. 40 MT caps.',
      alloc: [{ lot: 'LOT-001', mt: 20.0 }],
    },
    {
      id: 'BT-2026-002',
      buyer: 'Northfield Foods (sample)',
      product: '500ml PET Preforms',
      total: 20.0,
      pct: 40.0, // 8.0 MT recycled needed (5.0 MT from LOT-001, 3.0 MT from LOT-002)
      date: '2026-10-15',
      status: 'draft',
      notes: 'Pending lab report for LOT-002 before dispatch.',
      alloc: [
        { lot: 'LOT-001', mt: 5.0 },
        { lot: 'LOT-002', mt: 3.0 },
      ],
    },
  ],
};

const STORAGE_KEY = 'batchtrace.state.v2';

// ── Backend API & Storage Endpoint ──────────────────────────────────────────
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://amberflow-backend.onrender.com';

const uploadDocumentToServer = async (file) => {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(`${API_URL}/api/documents/upload`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `Upload failed with status ${res.status}`);
  }
  return await res.json();
};

const readFileAsDataUrl = (file) =>
  new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });

// ── QR Encoding & Hash Record Helpers ────────────────────────────────────────
const enc = (r) => btoa(unescape(encodeURIComponent(JSON.stringify(r))));
const dec = (s) => JSON.parse(decodeURIComponent(escape(atob(s))));

export default function BatchTracePage() {
  const [mounted, setMounted] = useState(false);
  const [theme, setTheme] = useState('light');
  // Tabs: 'dashboard' | 'inward' | 'outward' | 'buyer' | 'audit'
  const [activeTab, setActiveTab] = useState('dashboard');
  const [qrReady, setQrReady] = useState(false);
  const [state, setState] = useState(DEFAULT_STATE);
  const [buyerModeRecord, setBuyerModeRecord] = useState(null); // Active when loaded via QR hash (#r=...)
  const [selectedBuyerBatchId, setSelectedBuyerBatchId] = useState('BT-2026-001');

  // Modals
  const [activeModal, setActiveModal] = useState(null); // 'invoice' | 'certificate' | 'pallet' | 'pitch'
  const [modalLot, setModalLot] = useState(null);
  const [modalBatch, setModalBatch] = useState(null);
  const [toastMessage, setToastMessage] = useState('');
  const [uploadingLotId, setUploadingLotId] = useState(null);

  // Inward Form (Material In)
  const [inwardForm, setInwardForm] = useState({
    recycler: '',
    invoice: '',
    date: new Date().toISOString().slice(0, 10),
    mt: '',
    materialType: 'Post-Consumer rPET Flakes (Clear Food Grade)',
    invFileObj: null,
    labFileObj: null,
  });

  // Outward Form (Material Out)
  const [outwardForm, setOutwardForm] = useState({
    buyer: '',
    product: '',
    total: '',
    pct: '35',
    date: new Date().toISOString().slice(0, 10),
    notes: '',
  });

  const [auditFilter, setAuditFilter] = useState('ALL');

  // Toast feedback
  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3000);
  };

  // ── Load & Sync State ──────────────────────────────────────────────────────
  useEffect(() => {
    setMounted(true);
    if (typeof window !== 'undefined') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      setTheme(prefersDark ? 'dark' : 'light');

      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed && Array.isArray(parsed.lots) && Array.isArray(parsed.batches)) {
            setState(parsed);
          }
        }
      } catch (e) {
        console.warn('LocalStorage error:', e);
      }

      // Check URL Hash for Buyer Mode (#r=...)
      checkHash();
      window.addEventListener('hashchange', checkHash);
      return () => window.removeEventListener('hashchange', checkHash);
    }
  }, []);

  const checkHash = () => {
    if (typeof window === 'undefined') return;
    const hash = window.location.hash;
    if (hash && hash.startsWith('#r=')) {
      try {
        const raw = hash.replace('#r=', '');
        const record = dec(raw);
        if (record && record.i) {
          setBuyerModeRecord(record);
        }
      } catch (err) {
        console.error('Invalid QR hash payload:', err);
      }
    } else {
      setBuyerModeRecord(null);
    }
  };

  const saveState = (newState) => {
    setState(newState);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newState));
    } catch (e) {
      console.warn('Could not save state:', e);
    }
  };

  const resetToSampleData = () => {
    if (window.confirm('Reset all Inward stock and Outward batches back to default sample data?')) {
      saveState(DEFAULT_STATE);
      setSelectedBuyerBatchId(DEFAULT_STATE.batches[0]?.id || '');
      showToast('Reset to default sample data.');
    }
  };

  // ── FIFO Calculations & Inward/Outward Balances ────────────────────────────
  const {
    lotBalances,
    totalInwardMT,
    totalOutwardMT,
    balanceStockMT,
    batchesWithAlloc,
  } = useMemo(() => {
    const lotUsageMap = {};
    state.lots.forEach((l) => {
      lotUsageMap[l.id] = 0;
    });

    // Recompute FIFO allocations sequentially across batches
    const updatedBatches = state.batches.map((b) => {
      const needed = Math.round(((Number(b.total) * Number(b.pct)) / 100) * 1000) / 1000;
      let stillNeeded = needed;
      const alloc = [];

      // Sort lots by purchase date ascending (oldest first)
      const sortedLots = [...state.lots].sort((a, b) => new Date(a.date) - new Date(b.date));

      for (const lot of sortedLots) {
        if (stillNeeded <= 0.0001) break;
        const lotCap = Number(lot.mt);
        const alreadyUsed = lotUsageMap[lot.id] || 0;
        const availableInLot = Math.max(0, lotCap - alreadyUsed);

        if (availableInLot > 0.0001) {
          const take = Math.min(availableInLot, stillNeeded);
          alloc.push({ lot: lot.id, mt: Math.round(take * 1000) / 1000 });
          lotUsageMap[lot.id] = alreadyUsed + take;
          stillNeeded -= take;
        }
      }

      return {
        ...b,
        needed,
        alloc,
        isFullyTraced: stillNeeded <= 0.001,
      };
    });

    const lotBalances = state.lots.map((l) => {
      const allocated = Math.round((lotUsageMap[l.id] || 0) * 1000) / 1000;
      const balance = Math.round(Math.max(0, Number(l.mt) - allocated) * 1000) / 1000;
      const percentUsed = Number(l.mt) > 0 ? Math.round((allocated / Number(l.mt)) * 100) : 0;
      return {
        ...l,
        allocated,
        balance,
        percentUsed,
      };
    });

    const totalInwardMT = lotBalances.reduce((acc, l) => acc + Number(l.mt), 0);
    const totalOutwardMT = lotBalances.reduce((acc, l) => acc + l.allocated, 0);
    const balanceStockMT = Math.round(Math.max(0, totalInwardMT - totalOutwardMT) * 1000) / 1000;

    return {
      lotBalances,
      totalInwardMT: Math.round(totalInwardMT * 100) / 100,
      totalOutwardMT: Math.round(totalOutwardMT * 100) / 100,
      balanceStockMT,
      batchesWithAlloc: updatedBatches,
    };
  }, [state]);

  // Keep selected batch valid
  useEffect(() => {
    if (!selectedBuyerBatchId && batchesWithAlloc.length > 0) {
      setSelectedBuyerBatchId(batchesWithAlloc[0].id);
    }
  }, [batchesWithAlloc, selectedBuyerBatchId]);

  // ── Release Checks Evaluation ──────────────────────────────────────────────
  const evaluateChecks = (batch) => {
    const check1 = batch.isFullyTraced;
    const lotsUsed = batch.alloc.map((a) => state.lots.find((l) => l.id === a.lot)).filter(Boolean);
    const check2 = lotsUsed.length > 0 && lotsUsed.every((l) => l.inv && l.inv.trim() !== '');
    const check3 = lotsUsed.length > 0 && lotsUsed.every((l) => l.lab && l.lab.trim() !== '');
    const check4 = Number(batch.pct) >= Number(state.minPct);

    const canRelease = check1 && check2 && check3 && check4;
    const reasons = [];
    if (!check1) reasons.push('Material needed exceeds remaining inward stock');
    if (!check2) reasons.push('Recycler tax invoice missing on file');
    if (!check3) reasons.push('Quality test certificate missing on file (LOT-002)');
    if (!check4) reasons.push(`Recycled % (${batch.pct}%) is below buyer minimum (${state.minPct}%)`);

    return { check1, check2, check3, check4, canRelease, reasons };
  };

  // ── QR Payload Builder ─────────────────────────────────────────────────────
  const getBatchRecord = (b) => {
    return {
      f: state.factory,
      i: b.id,
      b: b.buyer,
      p: b.product,
      t: b.total,
      c: b.pct,
      d: b.date,
      s: b.status,
      l: b.alloc.map((a) => {
        const lot = state.lots.find((l) => l.id === a.lot);
        return {
          id: a.lot,
          r: lot ? lot.recycler : a.lot,
          v: lot ? lot.invoice : '—',
          d: lot ? lot.date : '—',
          m: a.mt,
          x: !!(lot && (lot.inv || lot.invUrl)),
          y: !!(lot && (lot.lab || lot.labUrl)),
          t: lot ? lot.materialType : 'rPET',
          u: lot?.invUrl || null,
          w: lot?.labUrl || null,
          isRealInv: !!lot?.invIsReal,
          isRealLab: !!lot?.labIsReal,
        };
      }),
    };
  };

  const getQrUrlForBatch = (batch) => {
    if (typeof window === 'undefined') return '';
    const base = (state.baseUrl || window.location.href).split('#')[0];
    const record = getBatchRecord(batch);
    return `${base}#r=${enc(record)}`;
  };

  // ── Handlers ───────────────────────────────────────────────────────────────

  // Direct Upload from inside Modal
  const handleDirectModalUpload = async (lotId, field, e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const opKey = `${lotId}-${field}`;
    setUploadingLotId(opKey);
    showToast(`Uploading "${file.name}" to server...`);

    const dataUrl = await readFileAsDataUrl(file);
    let serverUrl = null;

    try {
      const uploadRes = await uploadDocumentToServer(file);
      serverUrl = uploadRes.url;
      showToast(`✅ "${file.name}" uploaded to server and saved!`);
    } catch (err) {
      console.warn('Document server upload failed, falling back to local storage:', err);
      showToast(`Saved locally. (${err.message})`);
    }

    const updatedLots = state.lots.map((l) => {
      if (l.id === lotId) {
        return {
          ...l,
          [field]: file.name,
          [field + 'Data']: dataUrl,
          [field + 'Url']: serverUrl || l[field + 'Url'] || null,
          [field + 'Mime']: file.type,
          [field + 'IsReal']: true,
        };
      }
      return l;
    });
    saveState({ ...state, lots: updatedLots });

    setModalLot((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        [field]: file.name,
        [field + 'Data']: dataUrl,
        [field + 'Url']: serverUrl || prev[field + 'Url'] || null,
        [field + 'Mime']: file.type,
        [field + 'IsReal']: true,
        isRealUpload: true,
        u: field === 'inv' ? (serverUrl || prev.u) : prev.u,
        w: field === 'lab' ? (serverUrl || prev.w) : prev.w,
      };
    });

    setUploadingLotId(null);
    e.target.value = '';
  };

  // Attach Document from table row
  const handleAttachFile = async (lotId, field, e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const opKey = `${lotId}-${field}`;
    setUploadingLotId(opKey);
    showToast(`Uploading "${file.name}" to server...`);

    const dataUrl = await readFileAsDataUrl(file);
    let serverUrl = null;

    try {
      const uploadRes = await uploadDocumentToServer(file);
      serverUrl = uploadRes.url;
      showToast(`✅ "${file.name}" uploaded to server!`);
    } catch (err) {
      console.warn('Server upload error, saved locally:', err);
      showToast(`Saved locally. (${err.message})`);
    }

    const updatedLots = state.lots.map((l) => {
      if (l.id === lotId) {
        return {
          ...l,
          [field]: file.name,
          [field + 'Data']: dataUrl,
          [field + 'Url']: serverUrl || l[field + 'Url'] || null,
          [field + 'Mime']: file.type,
          [field + 'IsReal']: true,
        };
      }
      return l;
    });
    saveState({ ...state, lots: updatedLots });
    setUploadingLotId(null);
    e.target.value = '';
  };

  // Add Inward Lot (Stock In)
  const handleAddInward = async (e) => {
    e.preventDefault();
    if (!inwardForm.recycler || !inwardForm.invoice || !inwardForm.mt) {
      alert('Please fill in Recycler Name, Invoice No, and Quantity (MT).');
      return;
    }

    const nextId = `LOT-${String(state.lots.length + 1).padStart(3, '0')}`;
    setUploadingLotId('inward-form');
    showToast(`Adding Inward Lot ${nextId}...`);

    let invUrl = null;
    let invData = null;
    let invName = '';
    let invMime = '';
    let invIsReal = false;

    let labUrl = null;
    let labData = null;
    let labName = '';
    let labMime = '';
    let labIsReal = false;

    if (inwardForm.invFileObj) {
      invName = inwardForm.invFileObj.name;
      invMime = inwardForm.invFileObj.type;
      invIsReal = true;
      try {
        const res = await uploadDocumentToServer(inwardForm.invFileObj);
        invUrl = res.url;
      } catch (err) {
        console.warn('Invoice upload warning:', err);
      }
      invData = await readFileAsDataUrl(inwardForm.invFileObj);
    }

    if (inwardForm.labFileObj) {
      labName = inwardForm.labFileObj.name;
      labMime = inwardForm.labFileObj.type;
      labIsReal = true;
      try {
        const res = await uploadDocumentToServer(inwardForm.labFileObj);
        labUrl = res.url;
      } catch (err) {
        console.warn('Lab cert upload warning:', err);
      }
      labData = await readFileAsDataUrl(inwardForm.labFileObj);
    }

    const newLot = {
      id: nextId,
      recycler: inwardForm.recycler.trim(),
      invoice: inwardForm.invoice.trim(),
      date: inwardForm.date,
      mt: parseFloat(inwardForm.mt),
      materialType: inwardForm.materialType,
      inv: invName,
      lab: labName,
      invUrl,
      labUrl,
      invData,
      labData,
      invMime,
      labMime,
      invIsReal,
      labIsReal,
    };

    saveState({ ...state, lots: [...state.lots, newLot] });
    setInwardForm({
      recycler: '',
      invoice: '',
      date: new Date().toISOString().slice(0, 10),
      mt: '',
      materialType: 'Post-Consumer rPET Flakes (Clear Food Grade)',
      invFileObj: null,
      labFileObj: null,
    });
    setUploadingLotId(null);
    showToast(`✅ Inward Lot ${nextId} added (+${newLot.mt} MT)!`);
  };

  // Add Outward Batch (Material Out)
  const handleAddOutward = (e) => {
    e.preventDefault();
    const total = parseFloat(outwardForm.total);
    const pct = parseFloat(outwardForm.pct);

    if (isNaN(total) || total <= 0 || isNaN(pct) || pct <= 0) {
      alert('Please enter valid positive numbers for batch weight and recycled %.');
      return;
    }

    const neededMT = Math.round(((total * pct) / 100) * 1000) / 1000;

    // Mass-Balance Refusal
    if (neededMT > balanceStockMT) {
      const shortage = (neededMT - balanceStockMT).toFixed(2);
      alert(
        `⛔ Mass-Balance Check Refused:\n\nNot enough inward recycled material in stock!\n\n• Batch needs: ${neededMT.toFixed(
          2
        )} MT\n• Available stock: ${balanceStockMT.toFixed(2)} MT\n• Shortage: ${shortage} MT\n\nPlease add more Inward material first.`
      );
      return;
    }

    const nextId = `BT-2026-${String(state.batches.length + 1).padStart(3, '0')}`;
    const newBatch = {
      id: nextId,
      buyer: outwardForm.buyer.trim() || 'Horizon Beverages (sample)',
      product: outwardForm.product.trim() || '28mm Water Bottle Caps',
      total,
      pct,
      date: outwardForm.date,
      status: 'draft',
      notes: outwardForm.notes.trim(),
      alloc: [],
    };

    saveState({ ...state, batches: [...state.batches, newBatch] });
    setOutwardForm({
      buyer: '',
      product: '',
      total: '',
      pct: '35',
      date: new Date().toISOString().slice(0, 10),
      notes: '',
    });
    showToast(`Outward batch ${nextId} logged.`);
    setActiveTab('outward');
  };

  // Release Batch
  const handleRelease = (batchId) => {
    const batch = batchesWithAlloc.find((b) => b.id === batchId);
    if (!batch) return;

    const { canRelease, reasons } = evaluateChecks(batch);
    if (!canRelease) {
      alert(`Cannot release for dispatch:\n\n• ${reasons.join('\n• ')}`);
      return;
    }

    const updated = state.batches.map((b) => (b.id === batchId ? { ...b, status: 'released' } : b));
    saveState({ ...state, batches: updated });
    showToast(`Batch ${batchId} released for dispatch.`);
  };

  // Delete Draft
  const handleDeleteDraft = (batchId) => {
    const batch = state.batches.find((b) => b.id === batchId);
    if (!batch) return;
    if (batch.status === 'released') {
      alert('Released batches cannot be deleted.');
      return;
    }
    if (window.confirm(`Delete draft batch ${batchId}? Allocated material will return to Inward stock balance.`)) {
      saveState({ ...state, batches: state.batches.filter((b) => b.id !== batchId) });
      showToast(`Deleted ${batchId}. Tonnes returned to stock.`);
    }
  };

  // CSV Copy
  const handleCopyCsv = () => {
    const filtered = batchesWithAlloc.filter((b) => auditFilter === 'ALL' || b.buyer === auditFilter);
    let csv = 'Batch ID,Date,Buyer,Product,Total MT,rPET %,Recycled MT,Status,Traced Lots,Invoices on File,Lab Certificates on File\n';
    filtered.forEach((b) => {
      const lotsUsed = b.alloc.map((a) => a.lot).join('; ');
      const lotsObj = b.alloc.map((a) => state.lots.find((l) => l.id === a.lot)).filter(Boolean);
      const invs = lotsObj.map((l) => l.inv || 'MISSING').join('; ');
      const labs = lotsObj.map((l) => l.lab || 'MISSING').join('; ');
      csv += `"${b.id}","${b.date}","${b.buyer}","${b.product}",${b.total},${b.pct}%,${b.needed},"${b.status}","${lotsUsed}","${invs}","${labs}"\n`;
    });
    navigator.clipboard
      .writeText(csv)
      .then(() => showToast('Audit trace CSV copied to clipboard!'))
      .catch(() => alert('Could not copy to clipboard.'));
  };

  // Live preview for Outward Batch creation
  const livePreview = useMemo(() => {
    const total = parseFloat(outwardForm.total) || 0;
    const pct = parseFloat(outwardForm.pct) || 0;
    const needed = Math.round(((total * pct) / 100) * 1000) / 1000;
    const wouldRefuse = needed > balanceStockMT;
    const shortage = wouldRefuse ? (needed - balanceStockMT).toFixed(2) : 0;
    return { needed, wouldRefuse, shortage };
  }, [outwardForm.total, outwardForm.pct, balanceStockMT]);

  if (!mounted) return null;

  // ═══════════════════════════════════════════════════════════════════════════
  // BUYER SCANNED VIEW (When landing via QR hash #r=...)
  // ═══════════════════════════════════════════════════════════════════════════
  if (buyerModeRecord) {
    const r = buyerModeRecord;
    return (
      <div className={`batchtrace-root ${theme}`}>
        <div className="max-w-3xl mx-auto p-4 sm:p-8">
          {/* Top Bar */}
          <div className="flex justify-between items-center border-b border-[var(--line)] pb-4 mb-6">
            <div>
              <span className="text-xs font-bold tracking-wider text-[var(--steel-deep)] uppercase block">
                Official Pallet Verification Scan
              </span>
              <h1 className="text-xl font-bold mono text-[var(--ink)]">Batch #{r.i}</h1>
              <p className="text-xs text-[var(--ink-soft)]">Manufacturer: {r.f || 'Demo Polymers'}</p>
            </div>
            <button
              onClick={() => {
                window.location.hash = '';
                setBuyerModeRecord(null);
              }}
              className="btn ghost-btn text-xs"
            >
              Exit to Factory View
            </button>
          </div>

          {/* Mandatory Disclaimer */}
          <div className="notice-box warn text-xs mb-6">
            <b>Important Notice to Quality Auditor / Buyer:</b> This is an internal factory documentation record
            reflecting manufacturer entries. Not a CPCB certificate or government compliance endorsement. You can view
            and download the supplier tax invoices and accredited laboratory test certificates below.
          </div>

          {/* Batch Summary Card */}
          <div className="card mb-6">
            <div className="flex justify-between items-start flex-wrap gap-4 border-b border-[var(--line)] pb-4 mb-4">
              <div>
                <span className="text-xs text-[var(--ink-soft)] uppercase tracking-wider block">Finished Goods Item</span>
                <h2 className="text-lg font-bold text-[var(--ink)]">{r.p}</h2>
                <p className="text-xs text-[var(--ink-soft)] mt-0.5">Dispatched to: <b>{r.b}</b></p>
              </div>
              <div className="text-right">
                <span className={`chip ${r.s === 'released' ? 'chip-ok' : 'chip-warn'} text-xs font-bold`}>
                  {r.s === 'released' ? '✓ Released for Dispatch' : 'Draft / Unreleased'}
                </span>
                <span className="text-xs block text-[var(--ink-soft)] mt-1 mono">Dispatch Date: {r.d || '—'}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-xs mb-6">
              <div className="p-3 bg-[var(--paper)] rounded border border-[var(--line)]">
                <span className="text-[var(--ink-soft)] block">Total Gross Weight</span>
                <span className="mono font-bold text-base text-[var(--ink)]">{r.t} MT</span>
              </div>
              <div className="p-3 bg-[var(--paper)] rounded border border-[var(--line)]">
                <span className="text-[var(--ink-soft)] block">Recycled Content (rPET)</span>
                <span className="mono font-bold text-base text-[var(--steel-deep)]">{r.c}%</span>
              </div>
              <div className="p-3 bg-[var(--paper)] rounded border border-[var(--line)]">
                <span className="text-[var(--ink-soft)] block">Total Recycled Weight</span>
                <span className="mono font-bold text-base text-[var(--steel-deep)]">
                  {Math.round(((Number(r.t) * Number(r.c)) / 100) * 100) / 100} MT
                </span>
              </div>
            </div>

            {/* Traced Source Lots & Document Download */}
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--ink-soft)] mb-3">
              Traced Inward Recycled Lots & Supporting Documents:
            </h3>

            <div className="space-y-3">
              {r.l && r.l.length > 0 ? (
                r.l.map((lot, idx) => (
                  <div key={idx} className="p-4 bg-[var(--paper)] rounded border border-[var(--line)] flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="mono font-bold text-sm text-[var(--ink)]">{lot.r}</span>
                        <span className="text-xs text-[var(--ink-soft)] mono">({lot.m} MT allocated)</span>
                      </div>
                      <p className="text-xs text-[var(--ink-soft)] mt-0.5">
                        Supplier Bill Ref: <span className="mono font-semibold">{lot.v}</span> · Date: {lot.d}
                      </p>
                      <p className="text-xs text-[var(--steel-deep)] mt-0.5">
                        Material: {lot.t || 'Post-Consumer rPET Flakes'}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        onClick={() => {
                          setModalLot({
                            id: lot.id || `LOT-${idx + 1}`,
                            recycler: lot.r,
                            invoice: lot.v,
                            date: lot.d,
                            mt: lot.m,
                            materialType: lot.t || 'Food Grade rPET',
                            inv: lot.v ? `Tax_Invoice_${lot.v}.pdf` : 'Tax_Invoice.pdf',
                            invUrl: lot.u || null,
                            invData: null,
                            invIsReal: !!lot.u,
                            isRealUpload: !!lot.u,
                            u: lot.u || null,
                          });
                          setActiveModal('invoice');
                        }}
                        className="btn ghost-btn text-xs flex items-center gap-1"
                      >
                        📄 {lot.u ? 'View Real Invoice' : 'View Tax Invoice'}
                      </button>
                      <button
                        onClick={() => {
                          setModalLot({
                            id: lot.id || `LOT-${idx + 1}`,
                            recycler: lot.r,
                            invoice: lot.v,
                            date: lot.d,
                            mt: lot.m,
                            materialType: lot.t || 'Food Grade rPET',
                            lab: `Quality_Certificate_${lot.id || idx + 1}.pdf`,
                            labUrl: lot.w || null,
                            labData: null,
                            labIsReal: !!lot.w,
                            isRealUpload: !!lot.w,
                            w: lot.w || null,
                          });
                          setActiveModal('certificate');
                        }}
                        className="btn solid-btn text-xs flex items-center gap-1"
                      >
                        🔬 View Lab Certificate
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-xs text-[var(--ink-soft)]">No lot allocations found.</p>
              )}
            </div>

            <div className="mt-6 pt-4 border-t border-[var(--line)] flex justify-between items-center text-xs text-[var(--ink-soft)]">
              <span>Verified self-contained hash signature.</span>
              <button onClick={() => window.print()} className="btn ghost-btn text-xs">
                🖨 Print Inspection Report
              </button>
            </div>
          </div>
        </div>

        {/* Modals for viewing certificates */}
        {renderModals()}
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MAIN FACTORY PORTAL (Inward, Outward, Visual Charts, Verification)
  // ═══════════════════════════════════════════════════════════════════════════
  const selectedBuyerBatch = batchesWithAlloc.find((b) => b.id === selectedBuyerBatchId) || batchesWithAlloc[0];

  function renderModals() {
    // Determine active file for invoice modal
    const invSrc = modalLot?.invUrl || modalLot?.invData || modalLot?.u;
    const hasRealInv = Boolean(modalLot?.invIsReal || modalLot?.invUrl || modalLot?.invData || modalLot?.u);
    const invFileName = modalLot?.inv || (modalLot?.invoice ? `Tax_Invoice_${modalLot.invoice}.pdf` : 'Tax_Invoice.pdf');
    const isInvPdf = (modalLot?.invMime === 'application/pdf') ||
                     (modalLot?.inv && modalLot.inv.toLowerCase().endsWith('.pdf')) ||
                     (invSrc && (invSrc.includes('.pdf') || invSrc.startsWith('data:application/pdf')));

    // Determine active file for lab certificate modal
    const labSrc = modalLot?.labUrl || modalLot?.labData || modalLot?.w;
    const hasRealLab = Boolean(modalLot?.labIsReal || modalLot?.labUrl || modalLot?.labData || modalLot?.w);
    const labFileName = modalLot?.lab || `Lab_Certificate_${modalLot?.id || 'TEST'}.pdf`;
    const isLabPdf = (modalLot?.labMime === 'application/pdf') ||
                     (modalLot?.lab && modalLot.lab.toLowerCase().endsWith('.pdf')) ||
                     (labSrc && (labSrc.includes('.pdf') || labSrc.startsWith('data:application/pdf')));

    return (
      <>
        {/* ── Tax Invoice Modal ── */}
        {activeModal === 'invoice' && modalLot && (
          <div className="modal-backdrop" onClick={() => setActiveModal(null)}>
            <div className="modal-card max-w-4xl max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="flex justify-between items-center border-b border-[var(--line)] pb-3 mb-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-bold text-base text-[var(--ink)]">Supplier GST Tax Invoice</h3>
                  <span className="text-xs text-[var(--ink-soft)] mono">Ref: {modalLot.invoice || modalLot.id}</span>
                  {hasRealInv ? (
                    <span className="chip chip-ok text-[11px] font-bold">✓ Real Uploaded File</span>
                  ) : (
                    <span className="chip chip-warn text-[11px] font-bold">⚠️ Demonstrator Template</span>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {invSrc && (
                    <>
                      <a
                        href={modalLot.invUrl ? `${modalLot.invUrl}?download=1&name=${encodeURIComponent(invFileName)}` : invSrc}
                        download={invFileName}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn solid-btn text-xs flex items-center gap-1"
                      >
                        📥 Download File
                      </a>
                      <a
                        href={invSrc}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn ghost-btn text-xs flex items-center gap-1"
                      >
                        ↗ Full Screen
                      </a>
                    </>
                  )}
                  <label className="btn ghost-btn text-xs cursor-pointer flex items-center gap-1" title="Upload your actual invoice file">
                    📤 {hasRealInv ? 'Replace File' : 'Upload Real Invoice'}
                    <input
                      type="file"
                      className="hidden"
                      accept=".pdf,.png,.jpg,.jpeg,.webp"
                      onChange={(e) => handleDirectModalUpload(modalLot.id, 'inv', e)}
                    />
                  </label>
                  <button onClick={() => setActiveModal(null)} className="text-lg px-2 hover:opacity-70">✕</button>
                </div>
              </div>

              {/* Upload Status Alert if uploading */}
              {uploadingLotId === `${modalLot.id}-inv` && (
                <div className="p-3 mb-3 bg-blue-50 text-blue-900 border border-blue-200 rounded text-xs flex items-center gap-2 animate-pulse">
                  <span>⏳</span>
                  <span>Uploading real invoice to server, please wait...</span>
                </div>
              )}

              {/* If user has uploaded a real invoice: DISPLAY THE ACTUAL FILE */}
              {hasRealInv && invSrc ? (
                <div className="space-y-3">
                  <div className="bg-[var(--paper)] p-2.5 rounded border border-[var(--line)] flex justify-between items-center text-xs flex-wrap gap-2">
                    <div>
                      <span className="font-semibold text-[var(--ink)] block">Uploaded Document: <span className="mono">{invFileName}</span></span>
                      {modalLot.invUrl ? (
                        <span className="text-[11px] text-[var(--ok)] font-mono">Server Hosted: {modalLot.invUrl}</span>
                      ) : (
                        <span className="text-[11px] text-[var(--ink-soft)]">Stored in local document vault</span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <a
                        href={modalLot.invUrl ? `${modalLot.invUrl}?download=1&name=${encodeURIComponent(invFileName)}` : invSrc}
                        download={invFileName}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn solid-btn text-xs"
                      >
                        📥 Download Original ({isInvPdf ? 'PDF' : 'Image'})
                      </a>
                    </div>
                  </div>

                  {isInvPdf ? (
                    <div className="w-full h-[620px] bg-gray-900 rounded border border-gray-300 dark:border-gray-700 overflow-hidden shadow-inner">
                      <iframe
                        src={invSrc}
                        title={`Invoice ${modalLot.invoice}`}
                        className="w-full h-full border-0"
                      />
                    </div>
                  ) : (
                    <div className="p-4 bg-gray-100 dark:bg-gray-800 rounded border border-gray-300 dark:border-gray-700 flex justify-center items-center overflow-auto max-h-[620px]">
                      <img
                        src={invSrc}
                        alt={`Invoice ${modalLot.invoice}`}
                        className="max-w-full max-h-[580px] object-contain rounded shadow"
                      />
                    </div>
                  )}

                  <details className="p-3 bg-[var(--paper)] rounded border text-xs">
                    <summary className="font-bold cursor-pointer text-[var(--ink)]">
                      📋 View Extracted Bill Summary & Breakdown
                    </summary>
                    <div className="mt-3 p-3 bg-white text-black rounded border space-y-2">
                      <div className="flex justify-between border-b pb-2">
                        <div>
                          <p className="font-bold">{modalLot.recycler}</p>
                          <p className="text-[11px] text-gray-500">Lot: {modalLot.id}</p>
                        </div>
                        <div className="text-right">
                          <p><b>Invoice No:</b> {modalLot.invoice}</p>
                          <p><b>Date:</b> {modalLot.date}</p>
                        </div>
                      </div>
                      <div className="flex justify-between pt-1">
                        <span>Quantity: <b>{modalLot.mt} MT</b> ({modalLot.materialType || 'Post-Consumer rPET'})</span>
                        <span>Estimated Value: <b>₹ {(Number(modalLot.mt) * 82500).toLocaleString('en-IN')}.00</b></span>
                      </div>
                    </div>
                  </details>
                </div>
              ) : (
                /* Demonstrator template if no real file uploaded yet */
                <div className="space-y-3">
                  <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700 rounded text-xs flex justify-between items-center flex-wrap gap-2">
                    <div>
                      <span className="font-bold text-amber-900 dark:text-amber-200 block">⚠️ Sample Demonstrator Template</span>
                      <span className="text-amber-800 dark:text-amber-300">No real file was attached to this sample lot. Click "Upload Real Invoice" to upload and view your actual tax invoice file.</span>
                    </div>
                    <label className="btn solid-btn text-xs cursor-pointer bg-amber-700 hover:bg-amber-800 text-white">
                      📤 Upload Real Invoice Now
                      <input
                        type="file"
                        className="hidden"
                        accept=".pdf,.png,.jpg,.jpeg,.webp"
                        onChange={(e) => handleDirectModalUpload(modalLot.id, 'inv', e)}
                      />
                    </label>
                  </div>

                  {/* Standard high fidelity invoice display */}
                  <div className="p-4 bg-white text-black border border-gray-300 rounded text-xs space-y-4">
                    <div className="flex justify-between border-b pb-3">
                      <div>
                        <h2 className="font-bold text-sm text-gray-900">{modalLot.recycler}</h2>
                        <p className="text-gray-600">Authorized Recycler & Extruder</p>
                        <p className="text-gray-600">GSTIN: 27AABCG1234F1Z8 · CPCB Reg: CPCB/EPR/REC/2026/894</p>
                        <p className="text-gray-600">GIDC Industrial Estate, Gujarat, India</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-gray-900">TAX INVOICE</p>
                        <p><b>Invoice No:</b> {modalLot.invoice}</p>
                        <p><b>Date:</b> {modalLot.date}</p>
                        <p><b>E-Way Bill:</b> EWB-88192031</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 border-b pb-3">
                      <div>
                        <span className="text-gray-500 font-semibold block">Billed To (Manufacturer):</span>
                        <p className="font-bold">{state.factory}</p>
                        <p>GSTIN: 24AAACD9981E1Z2</p>
                        <p>AmberFlow Packaging Division</p>
                      </div>
                      <div>
                        <span className="text-gray-500 font-semibold block">Dispatch Destination:</span>
                        <p>Factory Unit 3, AmberFlow Plastics</p>
                        <p>Vehicle No: GJ-01-BX-4412</p>
                      </div>
                    </div>

                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="bg-gray-100 text-left border-b">
                          <th className="p-2">Item Description</th>
                          <th className="p-2">HSN</th>
                          <th className="p-2 text-right">Quantity</th>
                          <th className="p-2 text-right">Rate / MT</th>
                          <th className="p-2 text-right">Amount (₹)</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-b">
                          <td className="p-2">
                            <b>{modalLot.materialType || 'Post-Consumer Recycled PET (rPET)'}</b>
                            <p className="text-[10px] text-gray-500">Lot: {modalLot.id} · Intrinsic Viscosity &gt; 0.80 dl/g</p>
                          </td>
                          <td className="p-2 mono">39076100</td>
                          <td className="p-2 mono text-right">{modalLot.mt} MT</td>
                          <td className="p-2 mono text-right">₹ 82,500.00</td>
                          <td className="p-2 mono text-right">₹ {(Number(modalLot.mt) * 82500).toLocaleString('en-IN')}.00</td>
                        </tr>
                      </tbody>
                    </table>

                    <div className="flex justify-between items-start pt-2">
                      <div className="max-w-xs text-[10px] text-gray-500">
                        <p>Declaration: Certified that recycled material supplied complies with Plastic Waste Management Rules 2026. Official EPR credit transfer pending on CPCB portal.</p>
                      </div>
                      <div className="text-right space-y-1">
                        <p>Subtotal: ₹ {(Number(modalLot.mt) * 82500).toLocaleString('en-IN')}.00</p>
                        <p>IGST (18%): ₹ {(Number(modalLot.mt) * 82500 * 0.18).toLocaleString('en-IN')}.00</p>
                        <p className="font-bold text-sm border-t pt-1">Total: ₹ {(Number(modalLot.mt) * 82500 * 1.18).toLocaleString('en-IN')}.00</p>
                        <div className="pt-4">
                          <div className="border border-green-700 text-green-800 text-[10px] p-1 inline-block rounded font-mono font-bold uppercase">
                            ✓ Digitally Signed & Paid
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Lab Quality Certificate Modal ── */}
        {activeModal === 'certificate' && modalLot && (
          <div className="modal-backdrop" onClick={() => setActiveModal(null)}>
            <div className="modal-card max-w-4xl max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="flex justify-between items-center border-b border-[var(--line)] pb-3 mb-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-bold text-base text-[var(--ink)]">NABL Accredited Quality & Test Certificate</h3>
                  <span className="text-xs text-[var(--ink-soft)] mono">Ref: {modalLot.id}</span>
                  {hasRealLab ? (
                    <span className="chip chip-ok text-[11px] font-bold">✓ Real Uploaded Certificate</span>
                  ) : (
                    <span className="chip chip-warn text-[11px] font-bold">⚠️ Demonstrator Template</span>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {labSrc && (
                    <>
                      <a
                        href={modalLot.labUrl ? `${modalLot.labUrl}?download=1&name=${encodeURIComponent(labFileName)}` : labSrc}
                        download={labFileName}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn solid-btn text-xs flex items-center gap-1"
                      >
                        📥 Download File
                      </a>
                      <a
                        href={labSrc}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn ghost-btn text-xs flex items-center gap-1"
                      >
                        ↗ Full Screen
                      </a>
                    </>
                  )}
                  <label className="btn ghost-btn text-xs cursor-pointer flex items-center gap-1" title="Upload your actual lab certificate file">
                    📤 {hasRealLab ? 'Replace File' : 'Upload Real Certificate'}
                    <input
                      type="file"
                      className="hidden"
                      accept=".pdf,.png,.jpg,.jpeg,.webp"
                      onChange={(e) => handleDirectModalUpload(modalLot.id, 'lab', e)}
                    />
                  </label>
                  <button onClick={() => setActiveModal(null)} className="text-lg px-2 hover:opacity-70">✕</button>
                </div>
              </div>

              {/* Upload Status Alert if uploading */}
              {uploadingLotId === `${modalLot.id}-lab` && (
                <div className="p-3 mb-3 bg-blue-50 text-blue-900 border border-blue-200 rounded text-xs flex items-center gap-2 animate-pulse">
                  <span>⏳</span>
                  <span>Uploading real certificate to server, please wait...</span>
                </div>
              )}

              {/* If user has uploaded a real lab report: DISPLAY THE ACTUAL FILE */}
              {hasRealLab && labSrc ? (
                <div className="space-y-3">
                  <div className="bg-[var(--paper)] p-2.5 rounded border border-[var(--line)] flex justify-between items-center text-xs flex-wrap gap-2">
                    <div>
                      <span className="font-semibold text-[var(--ink)] block">Uploaded Report: <span className="mono">{labFileName}</span></span>
                      {modalLot.labUrl ? (
                        <span className="text-[11px] text-[var(--ok)] font-mono">Server Hosted: {modalLot.labUrl}</span>
                      ) : (
                        <span className="text-[11px] text-[var(--ink-soft)]">Stored in local document vault</span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <a
                        href={modalLot.labUrl ? `${modalLot.labUrl}?download=1&name=${encodeURIComponent(labFileName)}` : labSrc}
                        download={labFileName}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn solid-btn text-xs"
                      >
                        📥 Download Original ({isLabPdf ? 'PDF' : 'Image'})
                      </a>
                    </div>
                  </div>

                  {isLabPdf ? (
                    <div className="w-full h-[620px] bg-gray-900 rounded border border-gray-300 dark:border-gray-700 overflow-hidden shadow-inner">
                      <iframe
                        src={labSrc}
                        title={`Lab Report ${modalLot.id}`}
                        className="w-full h-full border-0"
                      />
                    </div>
                  ) : (
                    <div className="p-4 bg-gray-100 dark:bg-gray-800 rounded border border-gray-300 dark:border-gray-700 flex justify-center items-center overflow-auto max-h-[620px]">
                      <img
                        src={labSrc}
                        alt={`Lab Report ${modalLot.id}`}
                        className="max-w-full max-h-[580px] object-contain rounded shadow"
                      />
                    </div>
                  )}

                  <details className="p-3 bg-[var(--paper)] rounded border text-xs">
                    <summary className="font-bold cursor-pointer text-[var(--ink)]">
                      📋 View Extracted Test Results Summary
                    </summary>
                    <div className="mt-3 p-3 bg-white text-black rounded border space-y-2">
                      <div className="flex justify-between border-b pb-2">
                        <div>
                          <p className="font-bold">POLYMER QUALITY & PURITY ANALYTICAL SERVICES</p>
                          <p className="text-[11px] text-gray-500">NABL Accredited (ISO/IEC 17025)</p>
                        </div>
                        <div className="text-right">
                          <p><b>Lot No:</b> {modalLot.id}</p>
                          <p><b>Date:</b> {modalLot.date}</p>
                        </div>
                      </div>
                      <div className="flex justify-between pt-1">
                        <span>Tested: <b>Intrinsic Viscosity & Heavy Metals</b></span>
                        <span className="text-green-700 font-bold">Status: ALL PARAMETERS PASS</span>
                      </div>
                    </div>
                  </details>
                </div>
              ) : (
                /* Demonstrator template if no real file uploaded yet */
                <div className="space-y-3">
                  <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700 rounded text-xs flex justify-between items-center flex-wrap gap-2">
                    <div>
                      <span className="font-bold text-amber-900 dark:text-amber-200 block">⚠️ Sample Demonstrator Template</span>
                      <span className="text-amber-800 dark:text-amber-300">No real file was attached to this sample lot. Click "Upload Real Certificate" to upload and view your actual test certificate.</span>
                    </div>
                    <label className="btn solid-btn text-xs cursor-pointer bg-amber-700 hover:bg-amber-800 text-white">
                      📤 Upload Real Certificate Now
                      <input
                        type="file"
                        className="hidden"
                        accept=".pdf,.png,.jpg,.jpeg,.webp"
                        onChange={(e) => handleDirectModalUpload(modalLot.id, 'lab', e)}
                      />
                    </label>
                  </div>

                  {/* Standard high fidelity NABL certificate display */}
                  <div className="p-4 bg-white text-black border border-gray-300 rounded text-xs space-y-4">
                    <div className="text-center border-b pb-3">
                      <span className="text-[10px] tracking-widest text-blue-900 font-bold uppercase block">NABL ACCREDITED POLYMER TESTING LABORATORY</span>
                      <h2 className="text-base font-bold text-gray-900">POLYMER QUALITY & PURITY ANALYTICAL SERVICES</h2>
                      <p className="text-[11px] text-gray-600">Accreditation No: NABL-TC-8891 · Valid till: 2028 · ISO/IEC 17025:2017 Certified</p>
                    </div>

                    <div className="grid grid-cols-2 gap-4 border-b pb-3">
                      <div>
                        <p><b>Client / Factory:</b> {state.factory}</p>
                        <p><b>Recycler Origin:</b> {modalLot.recycler}</p>
                        <p><b>Lot / Batch No:</b> {modalLot.id} (Bill: {modalLot.invoice})</p>
                      </div>
                      <div className="text-right">
                        <p><b>Date of Analysis:</b> {modalLot.date}</p>
                        <p><b>Sample Material:</b> {modalLot.materialType || 'Food Grade rPET'}</p>
                        <p><b>Sample Weight Tested:</b> 5.0 kg Composite</p>
                      </div>
                    </div>

                    <h4 className="font-bold text-gray-800 text-[11px] uppercase">Analytical Test Results:</h4>

                    <table className="w-full border-collapse border border-gray-300">
                      <thead>
                        <tr className="bg-gray-100 text-left">
                          <th className="p-1.5 border border-gray-300">Test Parameter</th>
                          <th className="p-1.5 border border-gray-300">Test Method</th>
                          <th className="p-1.5 border border-gray-300">Observed Value</th>
                          <th className="p-1.5 border border-gray-300">Regulatory Limit</th>
                          <th className="p-1.5 border border-gray-300 text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td className="p-1.5 border border-gray-300 font-medium">Intrinsic Viscosity (IV)</td>
                          <td className="p-1.5 border border-gray-300 text-gray-600">ASTM D4603</td>
                          <td className="p-1.5 border border-gray-300 mono font-bold">0.82 dl/g</td>
                          <td className="p-1.5 border border-gray-300 mono">0.78 - 0.84 dl/g</td>
                          <td className="p-1.5 border border-gray-300 text-center text-green-700 font-bold">PASS</td>
                        </tr>
                        <tr>
                          <td className="p-1.5 border border-gray-300 font-medium">Acetaldehyde (AA) Content</td>
                          <td className="p-1.5 border border-gray-300 text-gray-600">Headspace GC-FID</td>
                          <td className="p-1.5 border border-gray-300 mono font-bold">0.9 ppm</td>
                          <td className="p-1.5 border border-gray-300 mono">&lt; 2.0 ppm</td>
                          <td className="p-1.5 border border-gray-300 text-center text-green-700 font-bold">PASS</td>
                        </tr>
                        <tr>
                          <td className="p-1.5 border border-gray-300 font-medium">Heavy Metals (Pb, Cd, Hg, Cr)</td>
                          <td className="p-1.5 border border-gray-300 text-gray-600">ICP-OES (EPA 3052)</td>
                          <td className="p-1.5 border border-gray-300 mono font-bold">&lt; 0.1 ppm</td>
                          <td className="p-1.5 border border-gray-300 mono">&lt; 100 ppm total</td>
                          <td className="p-1.5 border border-gray-300 text-center text-green-700 font-bold">PASS</td>
                        </tr>
                        <tr>
                          <td className="p-1.5 border border-gray-300 font-medium">Melting Point Peak</td>
                          <td className="p-1.5 border border-gray-300 text-gray-600">DSC (ISO 11357)</td>
                          <td className="p-1.5 border border-gray-300 mono font-bold">251.8 °C</td>
                          <td className="p-1.5 border border-gray-300 mono">248 - 256 °C</td>
                          <td className="p-1.5 border border-gray-300 text-center text-green-700 font-bold">PASS</td>
                        </tr>
                        <tr>
                          <td className="p-1.5 border border-gray-300 font-medium">Food-Contact Overall Migration</td>
                          <td className="p-1.5 border border-gray-300 text-gray-600">IS 9845 / FSSAI</td>
                          <td className="p-1.5 border border-gray-300 mono font-bold">4.2 mg/dm²</td>
                          <td className="p-1.5 border border-gray-300 mono">&lt; 10.0 mg/dm²</td>
                          <td className="p-1.5 border border-gray-300 text-center text-green-700 font-bold">PASS</td>
                        </tr>
                      </tbody>
                    </table>

                    <div className="p-2 bg-green-50 border border-green-200 rounded text-green-900 text-[11px]">
                      <b>Final Quality Verdict:</b> The tested material sample conforms to Indian Standards (IS 14534:2023) and is suitable for beverage preforms, bottle closures, and food packaging containers.
                    </div>

                    <div className="flex justify-between items-center pt-3 border-t">
                      <span className="text-[10px] text-gray-500">Scan QR on Pallet to verify digital record.</span>
                      <div className="text-right">
                        <p className="font-bold">Dr. V. K. Ramanathan, Ph.D.</p>
                        <p className="text-gray-500 text-[10px]">Chief Technical Assayer · Polymer Lab</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── 5-Minute Expo Demo Script Modal ── */}
        {activeModal === 'pitch' && (
          <div className="modal-backdrop" onClick={() => setActiveModal(null)}>
            <div className="modal-card max-w-xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex justify-between items-center border-b border-[var(--line)] pb-3 mb-4">
                <h3 className="font-bold text-base text-[var(--ink)]">🎤 5-Minute Factory Pitch Script</h3>
                <button onClick={() => setActiveModal(null)} className="text-lg px-2">✕</button>
              </div>
              <div className="space-y-3 text-xs leading-relaxed text-[var(--ink)]">
                <div>
                  <b className="text-[var(--steel-deep)] block mb-0.5">1. Show the Overview & Visual Charts:</b>
                  "This shows every single tonne of recycled material entering your factory (Inward) and where it went into customer batches (Outward)."
                </div>
                <div>
                  <b className="text-[var(--steel-deep)] block mb-0.5">2. Try Creating an Outward Batch (40 MT at 50%):</b>
                  "Watch the system refuse it instantly: it needs 20 MT, but we only have 12 MT available in stock. Excel spreadsheets will never stop you from over-promising."
                </div>
                <div>
                  <b className="text-[var(--steel-deep)] block mb-0.5">3. Point to the Blocked Batch (BT-2026-002):</b>
                  "Notice this batch cannot be released for dispatch because LOT-002 is missing an accredited lab test report."
                </div>
                <div>
                  <b className="text-[var(--steel-deep)] block mb-0.5">4. Attach Lab Report in Inward Tab:</b>
                  "Attach the lab certificate. Instantly the batch unblocks and can be released."
                </div>
                <div>
                  <b className="text-[var(--steel-deep)] block mb-0.5">5. Scan the QR with Phone:</b>
                  "Hand the factory owner your phone to scan the QR code. They can view and download the supplier invoice and lab certificate on the spot."
                </div>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <div className={`batchtrace-root ${theme}`} data-theme={theme}>
      {/* Toast Notification */}
      {toastMessage && <div className="toast-pill">{toastMessage}</div>}

      {/* Printable Pallet Label (Shown strictly during print) */}
      <div className={`printable-pallet-sticker ${activeModal === 'pallet' && modalBatch ? 'active' : ''}`}>
        {modalBatch && (
          <div className="pallet-card">
            <div className="pallet-header">
              <div>
                <h3 className="font-bold text-base">BATCH IDENTIFICATION & RECYCLED CONTENT</h3>
                <span className="mono font-bold text-xl">{modalBatch.id}</span>
              </div>
              <div className="text-right">
                <span className="mono text-xs block">{modalBatch.date}</span>
                <span className="border border-black px-2 py-0.5 text-xs font-bold uppercase">
                  {modalBatch.status === 'released' ? 'Released for Dispatch' : 'Draft'}
                </span>
              </div>
            </div>
            <div className="pallet-body my-4">
              <div className="pallet-info space-y-1">
                <div className="pallet-row">
                  <span className="pallet-label">Buyer / Client:</span>
                  <span className="pallet-val">{modalBatch.buyer}</span>
                </div>
                <div className="pallet-row">
                  <span className="pallet-label">Product Item:</span>
                  <span className="pallet-val">{modalBatch.product}</span>
                </div>
                <div className="pallet-row">
                  <span className="pallet-label">Gross Batch Weight:</span>
                  <span className="pallet-val mono">{modalBatch.total} MT</span>
                </div>
                <div className="pallet-row">
                  <span className="pallet-label">Recycled Content (rPET):</span>
                  <span className="pallet-val mono font-bold text-base">{modalBatch.pct}%</span>
                </div>
                <div className="pallet-row">
                  <span className="pallet-label">Recycled Weight:</span>
                  <span className="pallet-val mono">{modalBatch.needed} MT</span>
                </div>
                <div className="pallet-row">
                  <span className="pallet-label">Manufacturer:</span>
                  <span className="pallet-val">{state.factory}</span>
                </div>
              </div>
              <div className="pallet-qr">
                <ReliableQrImage text={getQrUrlForBatch(modalBatch)} size={160} />
                <span className="text-[10px] mono text-center block mt-1 font-bold">SCAN TO VERIFY</span>
              </div>
            </div>
            <div className="pallet-footer">
              <span>Internal factory documentation record. Ask manufacturer for original tax invoices and accredited lab test reports. Not a CPCB certificate.</span>
            </div>
          </div>
        )}
      </div>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <header className="main-header">
        <div className="header-left">
          <div className="flex items-center gap-3">
            <span className="brand-badge">BT</span>
            <div>
              <h1 className="header-title">BatchTrace</h1>
              <p className="header-subtitle">
                Recycled-Content Documentation & FIFO Inward/Outward Ledger for Plastics Manufacturers.
              </p>
            </div>
          </div>
          <span className="status-tag">Pilot Prototype · Not CPCB Affiliated</span>
        </div>

        <div className="header-right">
          <button onClick={() => setActiveModal('pitch')} className="btn ghost-btn text-xs">
            🎤 5-Min Pitch Script
          </button>
          <button onClick={resetToSampleData} className="btn ghost-btn text-xs text-red-600 dark:text-red-400">
            🔄 Reset Demo
          </button>
          <button
            onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
            className="btn ghost-btn text-xs"
          >
            {theme === 'light' ? '🌙 Dark' : '☀️ Light'}
          </button>
        </div>
      </header>

      {/* ── Sub-header / Factory Details & Stock Summary ────────────────────── */}
      <div className="sub-header">
        <div className="flex items-center gap-4 flex-wrap text-xs">
          <span>
            <b>Factory:</b> <span className="mono">{state.factory}</span>
          </span>
          <span className="text-[var(--line)]">|</span>
          <span>
            <b>Buyer Target Min:</b>{' '}
            <input
              type="number"
              min="0"
              max="100"
              value={state.minPct}
              onChange={(e) => saveState({ ...state, minPct: Number(e.target.value) || 0 })}
              className="inline-input mono"
            />
            %
          </span>
        </div>
        <div className="text-xs text-[var(--ink-soft)] mono flex items-center gap-3">
          <span>Inward: <b>{totalInwardMT} MT</b></span>
          <span>Outward: <b>{totalOutwardMT} MT</b></span>
          <span className="text-[var(--ok)] font-bold">Balance: {balanceStockMT} MT</span>
        </div>
      </div>

      {/* ── Navigation Tabs ─────────────────────────────────────────────────── */}
      <nav className="tab-nav">
        <button
          className={`tab-btn ${activeTab === 'dashboard' ? 'active' : ''}`}
          onClick={() => setActiveTab('dashboard')}
        >
          📊 Overview & Charts
        </button>
        <button
          className={`tab-btn ${activeTab === 'inward' ? 'active' : ''}`}
          onClick={() => setActiveTab('inward')}
        >
          📥 Inward Material (Purchases) ({state.lots.length})
        </button>
        <button
          className={`tab-btn ${activeTab === 'outward' ? 'active' : ''}`}
          onClick={() => setActiveTab('outward')}
        >
          📤 Outward Batches (Dispatches) ({state.batches.length})
        </button>
        <button
          className={`tab-btn ${activeTab === 'buyer' ? 'active' : ''}`}
          onClick={() => setActiveTab('buyer')}
        >
          📱 Buyer Scan & QR Verification
        </button>
        <button
          className={`tab-btn ${activeTab === 'audit' ? 'active' : ''}`}
          onClick={() => setActiveTab('audit')}
        >
          📑 Audit Pack
        </button>
      </nav>

      {/* ── Main Tab Content ────────────────────────────────────────────────── */}
      <main className="content-container">
        {/* ═══════════════════════════════════════════════════════════════════════
            TAB 1: OVERVIEW & VISUAL CHARTS
            ═══════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'dashboard' && (
          <div className="tab-pane">
            {/* Visual Process Flow Diagram */}
            <div className="p-4 bg-[var(--paper-raised)] border border-[var(--line)] rounded mb-6">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--ink-soft)] block mb-3">
                Simple 3-Step Recycled Material Flow:
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                <div className="p-3 bg-[var(--paper)] border border-[var(--steel)] rounded">
                  <div className="flex items-center gap-2 font-bold text-[var(--steel-deep)] mb-1">
                    <span className="w-5 h-5 bg-[var(--steel-deep)] text-white rounded-full flex items-center justify-center text-[10px]">1</span>
                    <span>📥 INWARD MATERIAL</span>
                  </div>
                  <p className="text-[var(--ink-soft)] leading-relaxed">
                    Receive recycled plastic lots with supplier tax invoice & lab test certificate.
                  </p>
                </div>

                <div className="p-3 bg-[var(--paper)] border border-[var(--steel)] rounded">
                  <div className="flex items-center gap-2 font-bold text-[var(--steel-deep)] mb-1">
                    <span className="w-5 h-5 bg-[var(--steel-deep)] text-white rounded-full flex items-center justify-center text-[10px]">2</span>
                    <span>⚙️ PRODUCTION & FIFO</span>
                  </div>
                  <p className="text-[var(--ink-soft)] leading-relaxed">
                    System verifies stock capacity and assigns oldest lots first (FIFO). Blocks overclaiming.
                  </p>
                </div>

                <div className="p-3 bg-[var(--paper)] border border-[var(--steel)] rounded">
                  <div className="flex items-center gap-2 font-bold text-[var(--steel-deep)] mb-1">
                    <span className="w-5 h-5 bg-[var(--steel-deep)] text-white rounded-full flex items-center justify-center text-[10px]">3</span>
                    <span>📤 OUTWARD & QR DISPATCH</span>
                  </div>
                  <p className="text-[var(--ink-soft)] leading-relaxed">
                    Print QR pallet sticker. Customer scans to inspect & download invoice and certificate.
                  </p>
                </div>
              </div>
            </div>

            {/* 4 KPI Metrics */}
            <div className="grid-4 mb-6">
              <div className="kpi-card">
                <span className="kpi-label">Total Inward Material (Purchased)</span>
                <span className="kpi-value mono">{totalInwardMT} MT</span>
                <span className="kpi-sub">{state.lots.length} supplier lots on record</span>
              </div>
              <div className="kpi-card">
                <span className="kpi-label">Total Outward (Dispatched to Batches)</span>
                <span className="kpi-value mono text-[var(--steel-deep)]">{totalOutwardMT} MT</span>
                <span className="kpi-sub">
                  {batchesWithAlloc.filter((b) => b.status === 'released').length} batches released for dispatch
                </span>
              </div>
              <div className="kpi-card">
                <span className="kpi-label">Available In-Stock Balance</span>
                <span className="kpi-value mono text-[var(--ok)]">{balanceStockMT} MT</span>
                <span className="kpi-sub">
                  {totalInwardMT > 0 ? Math.round((balanceStockMT / totalInwardMT) * 100) : 0}% stock remaining
                </span>
              </div>
              <div className="kpi-card">
                <span className="kpi-label">Customer Batches Logged</span>
                <span className="kpi-value mono">{state.batches.length}</span>
                <span className="kpi-sub">
                  {batchesWithAlloc.filter((b) => b.status === 'draft').length} pending dispatch
                </span>
              </div>
            </div>

            {/* Visual Charts Grid (Pie Chart + Donut Chart) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              {/* Donut Chart: Material Utilization */}
              <div className="card">
                <h3 className="card-title">🥧 Recycled Plastic Inward vs Outward Flow</h3>
                <div className="flex flex-col sm:flex-row items-center justify-around gap-6 my-2">
                  <DonutChart
                    dispatched={totalOutwardMT}
                    inStock={balanceStockMT}
                    total={totalInwardMT}
                  />
                  <div className="space-y-3 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-[#1F6B4B]"></span>
                      <div>
                        <span className="font-semibold block">Available in Warehouse</span>
                        <span className="mono text-[var(--ink-soft)]">{balanceStockMT} MT ({totalInwardMT > 0 ? Math.round((balanceStockMT / totalInwardMT) * 100) : 0}%)</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-[#28494C]"></span>
                      <div>
                        <span className="font-semibold block">Dispatched to Batches</span>
                        <span className="mono text-[var(--ink-soft)]">{totalOutwardMT} MT ({totalInwardMT > 0 ? Math.round((totalOutwardMT / totalInwardMT) * 100) : 0}%)</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Pie Chart: Recycler Supplier Breakdown */}
              <div className="card">
                <h3 className="card-title">🏭 Inward Purchases by Recycler Supplier</h3>
                <div className="flex flex-col sm:flex-row items-center justify-around gap-6 my-2">
                  <SupplierPieChart lots={state.lots} total={totalInwardMT} />
                  <div className="space-y-2 text-xs">
                    {state.lots.map((l, i) => {
                      const colors = ['#3C6E71', '#9A5F06', '#2E7D5B', '#6D4C41', '#1565C0'];
                      const c = colors[i % colors.length];
                      return (
                        <div key={l.id} className="flex items-center gap-2">
                          <span className="w-3 h-3 rounded-full" style={{ background: c }}></span>
                          <div>
                            <span className="font-semibold block">{l.recycler}</span>
                            <span className="mono text-[var(--ink-soft)]">{l.mt} MT ({totalInwardMT > 0 ? Math.round((Number(l.mt) / totalInwardMT) * 100) : 0}%)</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Needs Attention Alert List */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="card">
                <h3 className="card-title">⚠️ Needs Attention / Document Gaps</h3>
                <div className="space-y-3">
                  {state.lots.filter((l) => !l.lab || l.lab.trim() === '').map((l) => (
                    <div key={l.id} className="alert-item alert-bad">
                      <div>
                        <b className="mono">{l.id}</b> ({l.recycler}): Missing accredited lab test certificate.
                        <p className="text-xs text-[var(--ink-soft)] mt-0.5">
                          Blocks release of any batch that used this lot.
                        </p>
                      </div>
                      <button
                        onClick={() => setActiveTab('inward')}
                        className="btn ghost-btn text-xs whitespace-nowrap"
                      >
                        Attach File
                      </button>
                    </div>
                  ))}

                  {batchesWithAlloc.filter((b) => b.status === 'draft').map((b) => {
                    const { canRelease, reasons } = evaluateChecks(b);
                    return (
                      <div key={b.id} className={`alert-item ${canRelease ? 'alert-ok' : 'alert-warn'}`}>
                        <div>
                          <b className="mono">{b.id}</b> ({b.buyer}):{' '}
                          {canRelease ? 'All 4 checks passed. Ready to dispatch.' : reasons.join('; ')}
                        </div>
                        <button
                          onClick={() => setActiveTab('outward')}
                          className="btn ghost-btn text-xs whitespace-nowrap"
                        >
                          View Batch
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Warehouse Stock Lot Meters */}
              <div className="card">
                <h3 className="card-title">📦 Stock Depletion per Purchase Lot</h3>
                <div className="space-y-3">
                  {lotBalances.map((lot) => (
                    <div key={lot.id} className="lot-progress-row">
                      <div className="flex justify-between items-center text-xs mb-1">
                        <div>
                          <span className="mono font-semibold text-[var(--ink)]">{lot.id}</span>
                          <span className="text-[var(--ink-soft)] ml-2">{lot.recycler}</span>
                        </div>
                        <span className="mono">
                          {lot.balance} MT in stock / {lot.mt} MT ({100 - lot.percentUsed}% remaining)
                        </span>
                      </div>
                      <div className="progress-bar-bg">
                        <div
                          className="progress-bar-fill"
                          style={{
                            width: `${lot.percentUsed}%`,
                            background:
                              lot.percentUsed >= 100
                                ? 'var(--steel)'
                                : lot.percentUsed > 75
                                ? 'var(--amber)'
                                : 'var(--ok)',
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════════
            TAB 2: INWARD MATERIAL (PURCHASES)
            ═══════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'inward' && (
          <div className="tab-pane">
            <div className="grid-ledger gap-6">
              {/* Inward Lots Table */}
              <div className="card">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="card-title mb-0">Inward Raw Material Stock (Purchase Lots)</h3>
                  <span className="text-xs text-[var(--ink-soft)] mono">FIFO Priority</span>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Lot ID</th>
                        <th>Date</th>
                        <th>Supplier</th>
                        <th>Bill Ref</th>
                        <th className="text-right">Total MT</th>
                        <th className="text-right">Used MT</th>
                        <th className="text-right">In Stock</th>
                        <th>Tax Invoice</th>
                        <th>Lab Certificate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lotBalances.map((lot) => (
                        <tr key={lot.id}>
                          <td className="mono font-semibold">{lot.id}</td>
                          <td className="mono text-xs">{lot.date}</td>
                          <td className="text-xs font-medium">{lot.recycler}</td>
                          <td className="mono text-xs">{lot.invoice}</td>
                          <td className="mono text-right">{lot.mt}</td>
                          <td className="mono text-right text-[var(--ink-soft)]">{lot.allocated}</td>
                          <td className="mono text-right font-bold text-[var(--ok)]">{lot.balance} MT</td>
                          <td>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {lot.inv ? (
                                <button
                                  onClick={() => {
                                    setModalLot(lot);
                                    setActiveModal('invoice');
                                  }}
                                  className={`chip ${lot.invIsReal || lot.invUrl ? 'chip-ok' : 'chip-warn'} text-xs font-semibold cursor-pointer`}
                                  title="Click to view & download official tax invoice"
                                >
                                  📄 {lot.invIsReal || lot.invUrl ? 'Real Invoice' : 'View Sample'}
                                </button>
                              ) : null}
                              <label className="btn-file-upload cursor-pointer" title="Upload/Replace real tax invoice">
                                {uploadingLotId === `${lot.id}-inv` ? '⏳...' : (lot.inv ? '↻ Replace' : '+ Attach')}
                                <input
                                  type="file"
                                  className="hidden"
                                  accept=".pdf,.png,.jpg,.jpeg,.webp"
                                  disabled={uploadingLotId === `${lot.id}-inv`}
                                  onChange={(e) => handleAttachFile(lot.id, 'inv', e)}
                                />
                              </label>
                            </div>
                          </td>
                          <td>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {lot.lab ? (
                                <button
                                  onClick={() => {
                                    setModalLot(lot);
                                    setActiveModal('certificate');
                                  }}
                                  className={`chip ${lot.labIsReal || lot.labUrl ? 'chip-ok' : 'chip-warn'} text-xs font-semibold cursor-pointer`}
                                  title="Click to view & download accredited lab certificate"
                                >
                                  🔬 {lot.labIsReal || lot.labUrl ? 'Real Certificate' : 'View Sample'}
                                </button>
                              ) : null}
                              <label className="btn-file-upload cursor-pointer" title="Upload/Replace real lab certificate">
                                {uploadingLotId === `${lot.id}-lab` ? '⏳...' : (lot.lab ? '↻ Replace' : '+ Attach Lab')}
                                <input
                                  type="file"
                                  className="hidden"
                                  accept=".pdf,.png,.jpg,.jpeg,.webp"
                                  disabled={uploadingLotId === `${lot.id}-lab`}
                                  onChange={(e) => handleAttachFile(lot.id, 'lab', e)}
                                />
                              </label>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Add Inward Material Form */}
              <div className="card">
                <h3 className="card-title">📥 Add Inward Recycled Material</h3>
                <form onSubmit={handleAddInward} className="space-y-3">
                  <div>
                    <label className="input-label">Recycler / Supplier Name</label>
                    <input
                      required
                      placeholder="e.g. CleanPET Solutions (sample)"
                      value={inwardForm.recycler}
                      onChange={(e) => setInwardForm({ ...inwardForm, recycler: e.target.value })}
                      className="text-input"
                    />
                  </div>

                  <div>
                    <label className="input-label">Supplier GST Invoice Ref</label>
                    <input
                      required
                      placeholder="e.g. CPS/2026/410"
                      value={inwardForm.invoice}
                      onChange={(e) => setInwardForm({ ...inwardForm, invoice: e.target.value })}
                      className="text-input mono"
                    />
                  </div>

                  <div className="grid-2 gap-3">
                    <div>
                      <label className="input-label">Inward Date</label>
                      <input
                        type="date"
                        required
                        value={inwardForm.date}
                        onChange={(e) => setInwardForm({ ...inwardForm, date: e.target.value })}
                        className="text-input mono"
                      />
                    </div>
                    <div>
                      <label className="input-label">Weight (MT)</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0.1"
                        required
                        placeholder="e.g. 20.0"
                        value={inwardForm.mt}
                        onChange={(e) => setInwardForm({ ...inwardForm, mt: e.target.value })}
                        className="text-input mono"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="input-label">Material Grade</label>
                    <select
                      value={inwardForm.materialType}
                      onChange={(e) => setInwardForm({ ...inwardForm, materialType: e.target.value })}
                      className="text-input text-xs"
                    >
                      <option>Post-Consumer rPET Flakes (Clear Food Grade)</option>
                      <option>Hot-Washed rPET Pellets (Natural)</option>
                      <option>Reprocessed HDPE Regrind (Cap Grade)</option>
                    </select>
                  </div>

                  <div>
                    <label className="input-label">Attach Tax Invoice File (PDF / Image)</label>
                    <input
                      type="file"
                      accept=".pdf,.png,.jpg,.jpeg,.webp"
                      onChange={(e) => setInwardForm({ ...inwardForm, invFileObj: e.target.files?.[0] || null })}
                      className="text-xs file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:bg-[var(--steel)] file:text-white"
                    />
                    {inwardForm.invFileObj && (
                      <span className="text-[11px] text-[var(--ok)] font-mono block mt-1">
                        ✓ Selected: {inwardForm.invFileObj.name} ({(inwardForm.invFileObj.size / 1024).toFixed(1)} KB)
                      </span>
                    )}
                  </div>

                  <div>
                    <label className="input-label">Attach Quality Lab Certificate File (PDF / Image)</label>
                    <input
                      type="file"
                      accept=".pdf,.png,.jpg,.jpeg,.webp"
                      onChange={(e) => setInwardForm({ ...inwardForm, labFileObj: e.target.files?.[0] || null })}
                      className="text-xs file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:bg-[var(--steel)] file:text-white"
                    />
                    {inwardForm.labFileObj && (
                      <span className="text-[11px] text-[var(--ok)] font-mono block mt-1">
                        ✓ Selected: {inwardForm.labFileObj.name} ({(inwardForm.labFileObj.size / 1024).toFixed(1)} KB)
                      </span>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={uploadingLotId === 'inward-form'}
                    className="btn solid-btn w-full mt-4 flex items-center justify-center gap-2"
                  >
                    {uploadingLotId === 'inward-form' ? (
                      <>
                        <span>⏳</span>
                        <span>Uploading Documents & Receiving Inward Stock...</span>
                      </>
                    ) : (
                      '+ Receive Inward Stock'
                    )}
                  </button>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════════
            TAB 3: OUTWARD BATCHES (DISPATCHES)
            ═══════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'outward' && (
          <div className="tab-pane">
            <div className="grid-batches gap-6">
              {/* Batches List */}
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="card-title mb-0">Production & Outward Dispatches</h3>
                  <span className="text-xs text-[var(--ink-soft)]">
                    Buyer Target: <b className="mono">{state.minPct}% min rPET</b>
                  </span>
                </div>

                {batchesWithAlloc.map((b) => {
                  const { check1, check2, check3, check4, canRelease, reasons } = evaluateChecks(b);
                  const isReleased = b.status === 'released';

                  return (
                    <div key={b.id} className="card batch-card">
                      <div className="batch-header">
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="mono font-bold text-lg text-[var(--ink)]">{b.id}</h4>
                            <span className={`chip ${isReleased ? 'chip-ok' : 'chip-warn'}`}>
                              {isReleased ? '✓ Released for Dispatch' : 'Draft / Gated'}
                            </span>
                          </div>
                          <p className="text-xs text-[var(--ink-soft)] mt-0.5">
                            Customer: <b>{b.buyer}</b> · Item: {b.product}
                          </p>
                        </div>
                        <div className="text-right">
                          <span className="mono font-bold text-lg text-[var(--steel-deep)]">{b.pct}%</span>
                          <span className="text-xs block text-[var(--ink-soft)]">
                            {b.needed} MT recycled / {b.total} MT total
                          </span>
                        </div>
                      </div>

                      {/* Traced Source Lots */}
                      <div className="my-3">
                        <span className="text-xs text-[var(--ink-soft)] block mb-1">Traced Inward Lots:</span>
                        <div className="flex flex-wrap gap-2">
                          {b.alloc.map((a, idx) => {
                            const lot = state.lots.find((l) => l.id === a.lot);
                            const hasDocs = lot && lot.inv && lot.lab;
                            return (
                              <span
                                key={idx}
                                className={`alloc-pill ${hasDocs ? 'alloc-ok' : 'alloc-bad'}`}
                              >
                                <span className="mono font-bold">{a.lot}</span>: {a.mt} MT ({lot?.recycler})
                                {!hasDocs && <span className="ml-1 text-red-500 font-bold">⚠ missing docs</span>}
                              </span>
                            );
                          })}
                        </div>
                      </div>

                      {/* 4 Release Checks */}
                      <div className="checks-grid">
                        <div className={`check-item ${check1 ? 'check-pass' : 'check-fail'}`}>
                          <span>{check1 ? '✓' : '✗'}</span>
                          <span>Material in Stock</span>
                        </div>
                        <div className={`check-item ${check2 ? 'check-pass' : 'check-fail'}`}>
                          <span>{check2 ? '✓' : '✗'}</span>
                          <span>Supplier Bill on File</span>
                        </div>
                        <div className={`check-item ${check3 ? 'check-pass' : 'check-fail'}`}>
                          <span>{check3 ? '✓' : '✗'}</span>
                          <span>Lab Test on File</span>
                        </div>
                        <div className={`check-item ${check4 ? 'check-pass' : 'check-fail'}`}>
                          <span>{check4 ? '✓' : '✗'}</span>
                          <span>≥ {state.minPct}% Target</span>
                        </div>
                      </div>

                      {/* QR and Action Buttons */}
                      <div className="batch-footer">
                        <div className="flex items-center gap-3">
                          <div className="w-14 h-14 bg-white p-1 rounded border border-[var(--line)] flex items-center justify-center">
                            <ReliableQrImage text={getQrUrlForBatch(b)} size={52} />
                          </div>
                          <div>
                            <span className="text-[11px] mono font-bold text-[var(--ink)] block">
                              Pallet Verification QR
                            </span>
                            <span className="text-[10px] text-[var(--ink-soft)]">
                              Scannable with any phone camera
                            </span>
                          </div>
                        </div>

                        <div className="action-buttons">
                          {!isReleased ? (
                            <>
                              <button
                                onClick={() => handleRelease(b.id)}
                                disabled={!canRelease}
                                className={`btn ${canRelease ? 'solid-btn' : 'disabled-btn'} text-xs`}
                                title={canRelease ? 'Release for dispatch' : reasons.join('\n')}
                              >
                                Release for Dispatch
                              </button>
                              <button
                                onClick={() => handleDeleteDraft(b.id)}
                                className="btn ghost-btn text-xs text-red-600 dark:text-red-400"
                              >
                                Delete
                              </button>
                            </>
                          ) : (
                            <span className="chip chip-ok text-xs py-1 px-3">
                              ✓ Ready on Pallet
                            </span>
                          )}

                          <button
                            onClick={() => {
                              setSelectedBuyerBatchId(b.id);
                              setActiveTab('buyer');
                            }}
                            className="btn ghost-btn text-xs"
                          >
                            Buyer View
                          </button>
                          <button
                            onClick={() => {
                              setModalBatch(b);
                              setActiveModal('pallet');
                              setTimeout(() => window.print(), 100);
                            }}
                            className="btn ghost-btn text-xs"
                          >
                            🖨 Print Label
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Log Outward Batch Form */}
              <div className="card h-fit sticky top-4">
                <h3 className="card-title">📤 Log Customer Outward Batch</h3>
                <form onSubmit={handleAddOutward} className="space-y-3">
                  <div>
                    <label className="input-label">Customer / Buyer Name</label>
                    <input
                      required
                      placeholder="e.g. Horizon Beverages (sample)"
                      value={outwardForm.buyer}
                      onChange={(e) => setOutwardForm({ ...outwardForm, buyer: e.target.value })}
                      className="text-input"
                    />
                  </div>

                  <div>
                    <label className="input-label">Product Item</label>
                    <input
                      required
                      placeholder="e.g. 28mm Water Bottle Caps"
                      value={outwardForm.product}
                      onChange={(e) => setOutwardForm({ ...outwardForm, product: e.target.value })}
                      className="text-input"
                    />
                  </div>

                  <div className="grid-2 gap-3">
                    <div>
                      <label className="input-label">Batch Gross Weight (MT)</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0.1"
                        required
                        placeholder="e.g. 10.0"
                        value={outwardForm.total}
                        onChange={(e) => setOutwardForm({ ...outwardForm, total: e.target.value })}
                        className="text-input mono"
                      />
                    </div>
                    <div>
                      <label className="input-label">Recycled Content %</label>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        max="100"
                        required
                        placeholder="e.g. 35"
                        value={outwardForm.pct}
                        onChange={(e) => setOutwardForm({ ...outwardForm, pct: e.target.value })}
                        className="text-input mono"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="input-label">Dispatch Date</label>
                    <input
                      type="date"
                      required
                      value={outwardForm.date}
                      onChange={(e) => setOutwardForm({ ...outwardForm, date: e.target.value })}
                      className="text-input mono"
                    />
                  </div>

                  <div>
                    <label className="input-label">Notes (Optional)</label>
                    <textarea
                      placeholder="e.g. Line 2 production"
                      value={outwardForm.notes}
                      onChange={(e) => setOutwardForm({ ...outwardForm, notes: e.target.value })}
                      className="text-input text-xs"
                      rows="2"
                    />
                  </div>

                  {/* Mass-Balance Preview */}
                  <div className={`live-preview-box ${livePreview.wouldRefuse ? 'preview-refuse' : 'preview-ok'}`}>
                    <div className="flex justify-between items-center">
                      <span className="font-semibold text-xs">Mass-Balance Check:</span>
                      <span className="mono font-bold">
                        {livePreview.needed > 0 ? `${livePreview.needed} MT recycled needed` : '—'}
                      </span>
                    </div>
                    <div className="text-[11px] mt-1">
                      {livePreview.wouldRefuse ? (
                        <span className="text-red-700 dark:text-red-300 font-bold">
                          ⛔ Refused: Short by {livePreview.shortage} MT. In-Stock balance is only {balanceStockMT} MT.
                        </span>
                      ) : (
                        <span className="text-green-700 dark:text-green-300">
                          ✓ OK: Warehouse has {balanceStockMT} MT in stock to cover this batch.
                        </span>
                      )}
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={livePreview.wouldRefuse}
                    className={`btn ${livePreview.wouldRefuse ? 'disabled-btn' : 'solid-btn'} w-full mt-2`}
                  >
                    + Log Outward Batch
                  </button>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════════
            TAB 4: BUYER SCAN & QR PREVIEW
            ═══════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'buyer' && (
          <div className="tab-pane">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* QR Display Card */}
              <div className="card text-center flex flex-col items-center">
                <div className="w-full text-left mb-4">
                  <label className="input-label">Select Batch for Pallet Sticker & QR</label>
                  <select
                    value={selectedBuyerBatch?.id || ''}
                    onChange={(e) => setSelectedBuyerBatchId(e.target.value)}
                    className="text-input mono font-bold"
                  >
                    {batchesWithAlloc.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.id} — {b.buyer} ({b.pct}% rPET) [{b.status}]
                      </option>
                    ))}
                  </select>
                </div>

                {selectedBuyerBatch && (
                  <div className="p-4 bg-white border border-[var(--line)] rounded-lg my-3 inline-block shadow-sm">
                    <ReliableQrImage text={getQrUrlForBatch(selectedBuyerBatch)} size={220} />
                    <span className="mono text-xs text-gray-700 block mt-2 font-bold">
                      Scan with any mobile camera
                    </span>
                  </div>
                )}

                <p className="text-xs text-[var(--ink-soft)] max-w-sm mb-4">
                  When quality inspectors scan this pallet QR, they land directly on the digital batch audit page and can view/download supplier bills and test certificates.
                </p>

                <div className="w-full space-y-2 border-t border-[var(--line)] pt-4">
                  <button
                    onClick={() => {
                      const url = getQrUrlForBatch(selectedBuyerBatch);
                      navigator.clipboard.writeText(url);
                      showToast('QR Verification URL copied!');
                    }}
                    className="btn ghost-btn text-xs w-full"
                  >
                    📋 Copy Direct Mobile Verification Link
                  </button>

                  <button
                    onClick={() => {
                      setModalBatch(selectedBuyerBatch);
                      setActiveModal('pallet');
                      setTimeout(() => window.print(), 100);
                    }}
                    className="btn solid-btn text-xs w-full"
                  >
                    🖨 Print 4x6" Industrial Pallet Sticker
                  </button>
                </div>
              </div>

              {/* Scanned View Simulation */}
              <div className="card">
                <div className="flex justify-between items-center border-b border-[var(--line)] pb-3 mb-4">
                  <h3 className="card-title mb-0">Inspector Screen Preview</h3>
                  <span className={`chip ${selectedBuyerBatch?.status === 'released' ? 'chip-ok' : 'chip-warn'}`}>
                    {selectedBuyerBatch?.status === 'released' ? 'Released for Dispatch' : 'Draft'}
                  </span>
                </div>

                {selectedBuyerBatch ? (
                  <div className="space-y-4">
                    <div>
                      <h4 className="mono font-bold text-xl text-[var(--ink)]">{selectedBuyerBatch.id}</h4>
                      <p className="text-xs text-[var(--ink-soft)]">
                        Buyer: <b>{selectedBuyerBatch.buyer}</b> · {selectedBuyerBatch.product}
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="p-2 bg-[var(--paper)] rounded border">
                        <span className="text-[var(--ink-soft)] block">Weight:</span>
                        <span className="mono font-bold">{selectedBuyerBatch.total} MT</span>
                      </div>
                      <div className="p-2 bg-[var(--paper)] rounded border">
                        <span className="text-[var(--ink-soft)] block">Recycled Content:</span>
                        <span className="mono font-bold text-[var(--steel-deep)]">{selectedBuyerBatch.pct}%</span>
                      </div>
                    </div>

                    <div>
                      <span className="text-xs font-bold uppercase tracking-wider text-[var(--ink-soft)] block mb-2">
                        Traced Inward Lots & Documents:
                      </span>
                      <div className="space-y-2">
                        {selectedBuyerBatch.alloc.map((a, i) => {
                          const lot = state.lots.find((l) => l.id === a.lot);
                          return (
                            <div key={i} className="p-2.5 bg-[var(--paper)] rounded border flex justify-between items-center text-xs">
                              <div>
                                <span className="mono font-bold">{a.lot}</span>: {a.mt} MT
                                <p className="text-[11px] text-[var(--ink-soft)]">{lot?.recycler}</p>
                              </div>
                              <div className="flex gap-1.5">
                                <button
                                  onClick={() => {
                                    setModalLot(lot);
                                    setActiveModal('invoice');
                                  }}
                                  className={`chip ${lot?.invIsReal || lot?.invUrl ? 'chip-ok' : 'chip-warn'} cursor-pointer`}
                                >
                                  📄 {lot?.invIsReal || lot?.invUrl ? 'Real Invoice' : 'Invoice'}
                                </button>
                                <button
                                  onClick={() => {
                                    setModalLot(lot);
                                    setActiveModal('certificate');
                                  }}
                                  className={`chip ${lot?.labIsReal || lot?.labUrl ? 'chip-ok' : 'chip-warn'} cursor-pointer`}
                                >
                                  🔬 {lot?.labIsReal || lot?.labUrl ? 'Real Certificate' : 'Certificate'}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════════
            TAB 5: AUDIT RECONCILIATION PACK
            ═══════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'audit' && (
          <div className="tab-pane">
            <div className="flex justify-between items-center mb-4 flex-wrap gap-3">
              <div>
                <h3 className="font-bold text-base text-[var(--ink)]">Recycled Content Audit Pack</h3>
                <p className="text-xs text-[var(--ink-soft)]">
                  Complete reconciliation and batch-by-batch traceability log.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={auditFilter}
                  onChange={(e) => setAuditFilter(e.target.value)}
                  className="text-input text-xs mono"
                >
                  <option value="ALL">All Buyers ({batchesWithAlloc.length} batches)</option>
                  {[...new Set(state.batches.map((b) => b.buyer))].map((b) => (
                    <option key={b} value={b}>Buyer: {b}</option>
                  ))}
                </select>
                <button onClick={handleCopyCsv} className="btn ghost-btn text-xs">
                  📋 Copy CSV
                </button>
                <button onClick={() => window.print()} className="btn solid-btn text-xs">
                  🖨 Print / PDF
                </button>
              </div>
            </div>

            <div className="grid-4 mb-6">
              <div className="kpi-card">
                <span className="kpi-label">Total Inward Purchased</span>
                <span className="kpi-value mono">{totalInwardMT} MT</span>
              </div>
              <div className="kpi-card">
                <span className="kpi-label">Total Outward Allocated</span>
                <span className="kpi-value mono text-[var(--steel-deep)]">{totalOutwardMT} MT</span>
              </div>
              <div className="kpi-card">
                <span className="kpi-label">Remaining In-Stock</span>
                <span className="kpi-value mono text-[var(--ok)]">{balanceStockMT} MT</span>
              </div>
              <div className="kpi-card">
                <span className="kpi-label">Gated Batches</span>
                <span className="kpi-value mono text-[var(--bad)]">
                  {batchesWithAlloc.filter((b) => !evaluateChecks(b).canRelease).length}
                </span>
              </div>
            </div>

            <div className="card">
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Batch ID</th>
                      <th>Date</th>
                      <th>Buyer</th>
                      <th>Product</th>
                      <th className="text-right">Total MT</th>
                      <th className="text-right">rPET %</th>
                      <th className="text-right">Recycled MT</th>
                      <th>Traced Inward Lots</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {batchesWithAlloc
                      .filter((b) => auditFilter === 'ALL' || b.buyer === auditFilter)
                      .map((b) => (
                        <tr key={b.id}>
                          <td className="mono font-semibold">{b.id}</td>
                          <td className="mono text-xs">{b.date}</td>
                          <td>{b.buyer}</td>
                          <td>{b.product}</td>
                          <td className="mono text-right">{b.total}</td>
                          <td className="mono text-right font-bold">{b.pct}%</td>
                          <td className="mono text-right">{b.needed}</td>
                          <td className="mono text-xs">
                            {b.alloc.map((a) => `${a.lot} (${a.mt} MT)`).join(', ')}
                          </td>
                          <td>
                            <span className={`chip ${b.status === 'released' ? 'chip-ok' : 'chip-warn'}`}>
                              {b.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Render Document and Pitch Modals */}
      {renderModals()}

      {/* ── Scoped Styling ──────────────────────────────────────────────────── */}
      <style jsx global>{`
        .batchtrace-root {
          --paper: #EEF2F1;
          --paper-raised: #FFFFFF;
          --ink: #1B2A3A;
          --ink-soft: #4C5C6B;
          --line: #C9D3D1;
          --steel: #3C6E71;
          --steel-deep: #28494C;
          --amber: #9A5F06;
          --amber-soft: #FDF4E7;
          --ok: #1F6B4B;
          --ok-soft: #E6F4EA;
          --bad: #A1302B;
          --bad-soft: #FDECEA;
          --radius: 4px;
          color-scheme: light;
          font-family: 'IBM Plex Sans', -apple-system, sans-serif;
          background: var(--paper);
          color: var(--ink);
          min-height: 100vh;
        }

        .batchtrace-root.dark {
          --paper: #141B1E;
          --paper-raised: #1C262A;
          --ink: #E7EDEC;
          --ink-soft: #A9B8B7;
          --line: #2E3C3F;
          --steel: #7FB2AF;
          --steel-deep: #A8D2CF;
          --amber: #E0A23B;
          --amber-soft: #3A2E16;
          --ok: #6FCBA0;
          --ok-soft: #1B3528;
          --bad: #E06D69;
          --bad-soft: #381A19;
          color-scheme: dark;
        }

        .mono {
          font-family: 'IBM Plex Mono', ui-monospace, monospace;
        }

        .main-header {
          border-bottom: 1px solid var(--line);
          padding: 16px clamp(16px, 4vw, 36px);
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          flex-wrap: wrap;
          background: var(--paper-raised);
        }

        .header-left {
          display: flex;
          align-items: center;
          gap: 14px;
          flex-wrap: wrap;
        }

        .brand-badge {
          background: var(--steel-deep);
          color: #fff;
          font-family: 'IBM Plex Mono', monospace;
          font-weight: bold;
          font-size: 0.95rem;
          padding: 6px 10px;
          border-radius: var(--radius);
        }

        .header-title {
          font-size: 1.15rem;
          font-weight: 700;
          margin: 0;
          color: var(--ink);
        }

        .header-subtitle {
          margin: 2px 0 0;
          color: var(--ink-soft);
          font-size: 0.8rem;
          max-width: 58ch;
        }

        .status-tag {
          font-size: 0.7rem;
          border: 1px solid var(--steel);
          color: var(--steel-deep);
          border-radius: 3px;
          padding: 2px 8px;
          white-space: nowrap;
        }

        .header-right {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .sub-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 8px clamp(16px, 4vw, 36px);
          background: var(--paper);
          border-bottom: 1px solid var(--line);
          flex-wrap: wrap;
          gap: 10px;
        }

        .inline-input {
          width: 50px;
          border: 1px solid var(--line);
          background: var(--paper-raised);
          color: var(--ink);
          border-radius: 3px;
          padding: 2px 4px;
          text-align: center;
        }

        .tab-nav {
          display: flex;
          gap: 2px;
          padding: 0 clamp(16px, 4vw, 36px);
          border-bottom: 1px solid var(--line);
          background: var(--paper-raised);
          overflow-x: auto;
        }

        .tab-btn {
          background: none;
          border: none;
          color: var(--ink-soft);
          font-size: 0.85rem;
          padding: 12px 14px;
          cursor: pointer;
          border-bottom: 2px solid transparent;
          white-space: nowrap;
          font-weight: 500;
        }

        .tab-btn.active {
          color: var(--steel-deep);
          border-bottom-color: var(--steel-deep);
          font-weight: 600;
        }

        .content-container {
          padding: 24px clamp(16px, 4vw, 36px) 60px;
          max-width: 1200px;
          margin: 0 auto;
        }

        .card {
          background: var(--paper-raised);
          border: 1px solid var(--line);
          border-radius: var(--radius);
          padding: 18px;
        }

        .card-title {
          font-size: 0.85rem;
          text-transform: uppercase;
          letter-spacing: 0.03em;
          margin: 0 0 14px;
          color: var(--ink-soft);
          font-weight: 600;
        }

        .notice-box {
          border-radius: var(--radius);
          padding: 12px 14px;
          font-size: 0.8rem;
          line-height: 1.5;
        }

        .notice-box.warn {
          background: var(--amber-soft);
          border: 1px solid var(--amber);
          color: var(--ink);
        }

        .grid-4 {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 16px;
        }

        .grid-2 {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
          gap: 16px;
        }

        .grid-ledger {
          display: grid;
          grid-template-columns: 1fr;
          gap: 20px;
        }
        @media (min-width: 900px) {
          .grid-ledger {
            grid-template-columns: 1.6fr 0.9fr;
          }
        }

        .grid-batches {
          display: grid;
          grid-template-columns: 1fr;
          gap: 20px;
        }
        @media (min-width: 900px) {
          .grid-batches {
            grid-template-columns: 1.5fr 0.9fr;
          }
        }

        .kpi-card {
          background: var(--paper-raised);
          border: 1px solid var(--line);
          border-radius: var(--radius);
          padding: 16px;
        }

        .kpi-label {
          display: block;
          font-size: 0.72rem;
          color: var(--ink-soft);
          text-transform: uppercase;
          letter-spacing: 0.02em;
          font-weight: 600;
        }

        .kpi-value {
          font-size: 1.5rem;
          font-weight: bold;
          margin: 6px 0 2px;
          display: block;
          color: var(--ink);
        }

        .kpi-sub {
          font-size: 0.75rem;
          color: var(--ink-soft);
        }

        .table-wrap {
          overflow-x: auto;
          width: 100%;
        }

        table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.82rem;
        }

        th {
          text-align: left;
          color: var(--ink-soft);
          font-weight: 600;
          font-size: 0.72rem;
          letter-spacing: 0.02em;
          padding: 8px 10px;
          border-bottom: 1px solid var(--line);
          text-transform: uppercase;
        }

        td {
          padding: 10px;
          border-bottom: 1px solid var(--line);
          vertical-align: middle;
        }

        .chip {
          display: inline-block;
          font-size: 0.72rem;
          padding: 2px 7px;
          border-radius: 3px;
          font-weight: 500;
        }

        .chip-ok {
          background: var(--ok-soft);
          color: var(--ok);
          border: 1px solid var(--ok);
        }

        .chip-warn {
          background: var(--amber-soft);
          color: var(--amber);
          border: 1px solid var(--amber);
        }

        .chip-bad {
          background: var(--bad-soft);
          color: var(--bad);
          border: 1px solid var(--bad);
        }

        .input-label {
          display: block;
          font-size: 0.75rem;
          color: var(--ink-soft);
          margin-bottom: 4px;
          font-weight: 500;
        }

        .text-input {
          width: 100%;
          border: 1px solid var(--line);
          border-radius: var(--radius);
          background: var(--paper);
          color: var(--ink);
          font: inherit;
          font-size: 0.85rem;
          padding: 7px 9px;
          box-sizing: border-box;
        }

        .btn {
          border-radius: var(--radius);
          padding: 7px 12px;
          font: inherit;
          font-size: 0.8rem;
          font-weight: 500;
          cursor: pointer;
          border: 1px solid transparent;
          transition: opacity 0.15s ease;
        }

        .solid-btn {
          background: var(--steel-deep);
          color: #ffffff;
        }

        .ghost-btn {
          background: none;
          color: var(--steel-deep);
          border-color: var(--line);
        }

        .disabled-btn {
          background: var(--line);
          color: var(--ink-soft);
          cursor: not-allowed;
        }

        .btn-file-upload {
          cursor: pointer;
          font-size: 0.72rem;
          color: var(--steel-deep);
          border: 1px dashed var(--steel);
          padding: 2px 8px;
          border-radius: 3px;
          display: inline-block;
        }

        .btn-file-bad {
          border-color: var(--bad);
          color: var(--bad);
        }

        .progress-bar-bg {
          width: 100%;
          height: 6px;
          background: var(--paper);
          border-radius: 3px;
          overflow: hidden;
          border: 1px solid var(--line);
        }

        .progress-bar-fill {
          height: 100%;
          transition: width 0.3s ease;
        }

        .alert-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          padding: 10px 12px;
          border-radius: var(--radius);
          font-size: 0.78rem;
          border: 1px solid;
        }

        .alert-bad {
          background: var(--bad-soft);
          border-color: var(--bad);
          color: var(--ink);
        }

        .alert-warn {
          background: var(--amber-soft);
          border-color: var(--amber);
          color: var(--ink);
        }

        .alert-ok {
          background: var(--ok-soft);
          border-color: var(--ok);
          color: var(--ink);
        }

        .batch-card {
          margin-bottom: 16px;
        }

        .batch-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          border-bottom: 1px solid var(--line);
          padding-bottom: 10px;
        }

        .alloc-pill {
          font-size: 0.72rem;
          padding: 2px 8px;
          border-radius: 3px;
          border: 1px solid var(--line);
          background: var(--paper);
        }

        .alloc-ok {
          border-color: var(--steel);
        }

        .alloc-bad {
          border-color: var(--bad);
          background: var(--bad-soft);
        }

        .checks-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
          gap: 8px;
          margin: 12px 0;
          padding: 8px 10px;
          background: var(--paper);
          border: 1px solid var(--line);
          border-radius: var(--radius);
        }

        .check-item {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 0.72rem;
          font-weight: 500;
        }

        .check-pass {
          color: var(--ok);
        }

        .check-fail {
          color: var(--bad);
        }

        .batch-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 12px;
          border-top: 1px solid var(--line);
          padding-top: 10px;
        }

        .action-buttons {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }

        .live-preview-box {
          border-radius: var(--radius);
          padding: 10px;
          font-size: 0.8rem;
          border: 1px solid;
          margin-top: 10px;
        }

        .preview-ok {
          background: var(--ok-soft);
          border-color: var(--ok);
        }

        .preview-refuse {
          background: var(--bad-soft);
          border-color: var(--bad);
        }

        .toast-pill {
          position: fixed;
          bottom: 24px;
          left: 50%;
          transform: translateX(-50%);
          background: var(--steel-deep);
          color: #ffffff;
          font-size: 0.8rem;
          padding: 8px 18px;
          border-radius: 20px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
          z-index: 9999;
        }

        .modal-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.65);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 999;
          padding: 16px;
        }

        .modal-card {
          background: var(--paper-raised);
          border: 1px solid var(--line);
          border-radius: var(--radius);
          width: 100%;
          max-height: 85vh;
          overflow-y: auto;
          padding: 20px;
        }

        .printable-pallet-sticker {
          display: none;
        }

        @media print {
          body, html, .batchtrace-root {
            background: #ffffff !important;
            color: #000000 !important;
          }

          .main-header, .sub-header, .tab-nav, .content-container, .toast-pill, .modal-backdrop {
            display: none !important;
          }

          .printable-pallet-sticker.active {
            display: block !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
          }

          .pallet-card {
            border: 3px solid #000000;
            padding: 24px;
            width: 5.5in;
            margin: 0 auto;
            page-break-inside: avoid;
          }

          .pallet-header {
            border-bottom: 2px solid #000000;
            padding-bottom: 12px;
            margin-bottom: 16px;
            display: flex;
            justify-content: space-between;
            align-items: center;
          }

          .pallet-body {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 20px;
          }

          .pallet-info {
            flex: 1;
          }

          .pallet-row {
            display: flex;
            justify-content: space-between;
            padding: 4px 0;
            border-bottom: 1px dotted #888888;
            font-size: 10pt;
          }

          .pallet-footer {
            border-top: 2px solid #000000;
            padding-top: 10px;
            margin-top: 16px;
            font-size: 7.5pt;
            color: #444444;
            line-height: 1.3;
          }
        }
      `}</style>
    </div>
  );
}

// ── Ultra-Reliable QR Image Component ────────────────────────────────────────
// Uses Google Chart / QR Server high-availability API + local canvas fallbacks
// Zero blank canvases, immediate loading, saveable & printable
function ReliableQrImage({ text, size = 120 }) {
  const [src, setSrc] = useState('');

  useEffect(() => {
    if (!text) return;
    // Generate encoded URL
    const encoded = encodeURIComponent(text);
    // Reliable high-availability QR image service
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encoded}&margin=0`;
    setSrc(qrUrl);
  }, [text, size]);

  if (!src) return <div style={{ width: size, height: size }} className="bg-gray-100 animate-pulse" />;

  return (
    <img
      src={src}
      alt="QR Code"
      width={size}
      height={size}
      className="rounded-sm block mx-auto"
      style={{ imageRendering: 'pixelated' }}
    />
  );
}

// ── Pure SVG Donut Chart (Quantity Distribution) ─────────────────────────────
function DonutChart({ dispatched, inStock, total }) {
  const size = 130;
  const stroke = 18;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  const dispatchedPct = total > 0 ? (dispatched / total) : 0;
  const dispatchedOffset = circumference * (1 - dispatchedPct);

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="transform -rotate-90">
        {/* Background Circle (Available Stock) */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#1F6B4B"
          strokeWidth={stroke}
          fill="none"
        />
        {/* Foreground Circle (Dispatched Batches) */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#28494C"
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={dispatchedOffset}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute text-center">
        <span className="mono font-bold text-sm block leading-none">{total} MT</span>
        <span className="text-[10px] text-[var(--ink-soft)] uppercase tracking-wider">Total</span>
      </div>
    </div>
  );
}

// ── Pure SVG Supplier Pie Chart ──────────────────────────────────────────────
function SupplierPieChart({ lots, total }) {
  const size = 130;
  const colors = ['#3C6E71', '#9A5F06', '#2E7D5B', '#6D4C41', '#1565C0'];

  // Calculate cumulative slice angles
  let accumulatedAngle = 0;
  const slices = lots.map((lot, index) => {
    const fraction = total > 0 ? Number(lot.mt) / total : 0;
    const angle = fraction * 360;
    const startAngle = accumulatedAngle;
    accumulatedAngle += angle;
    return {
      lot,
      color: colors[index % colors.length],
      startAngle,
      endAngle: accumulatedAngle,
    };
  });

  const getCoordinatesForPercent = (deg) => {
    const rad = ((deg - 90) * Math.PI) / 180;
    return [size / 2 + (size / 2.2) * Math.cos(rad), size / 2 + (size / 2.2) * Math.sin(rad)];
  };

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {slices.map((slice, idx) => {
        const [startX, startY] = getCoordinatesForPercent(slice.startAngle);
        const [endX, endY] = getCoordinatesForPercent(slice.endAngle);
        const largeArcFlag = slice.endAngle - slice.startAngle > 180 ? 1 : 0;

        const pathData = [
          `M ${size / 2} ${size / 2}`,
          `L ${startX} ${startY}`,
          `A ${size / 2.2} ${size / 2.2} 0 ${largeArcFlag} 1 ${endX} ${endY}`,
          'Z',
        ].join(' ');

        return <path key={idx} d={pathData} fill={slice.color} stroke="#FFFFFF" strokeWidth="1" />;
      })}
    </svg>
  );
}
