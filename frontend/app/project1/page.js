'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import Script from 'next/script';

// ── Default Sample Data (Section 5 & 6) ──────────────────────────────────────
const DEFAULT_STATE = {
  factory: 'Demo Polymers Pvt Ltd (sample data)',
  minPct: 30, // Buyer minimum recycled share %
  baseUrl: '', // Optional override for QR link
  lots: [
    {
      id: 'LOT-001',
      recycler: 'GreenLoop Recyclers (sample)',
      invoice: 'GL/26-27/1042',
      date: '2026-09-18',
      mt: 25.0,
      inv: 'invoice-GL-1042.pdf',
      lab: 'lab-report-GL-8821.pdf',
    },
    {
      id: 'LOT-002',
      recycler: 'EcoPellet Reclaim (sample)',
      invoice: 'EPR/26/089',
      date: '2026-10-02',
      mt: 15.0,
      inv: 'invoice-EPR-089.pdf',
      lab: '', // Missing lab report! Blocks release of dependent batches
    },
  ],
  batches: [
    {
      id: 'BT-2026-001',
      buyer: 'Horizon Beverages (sample)',
      product: '28mm water-bottle cap',
      total: 40.0,
      pct: 50.0, // 20.0 MT recycled
      date: '2026-10-12',
      status: 'released',
      notes: 'Pilot production run. 40 MT caps.',
      alloc: [{ lot: 'LOT-001', mt: 20.0 }],
    },
    {
      id: 'BT-2026-002',
      buyer: 'Northfield Foods (sample)',
      product: '500ml PET preform',
      total: 20.0,
      pct: 40.0, // 8.0 MT recycled: 5.0 MT from LOT-001, 3.0 MT from LOT-002
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

const STORAGE_KEY = 'batchtrace.state.v1';

// ── QR Encoding Helpers (Section 7) ──────────────────────────────────────────
const enc = (r) => btoa(unescape(encodeURIComponent(JSON.stringify(r))));
const dec = (s) => JSON.parse(decodeURIComponent(escape(atob(s))));

export default function BatchTracePage() {
  const [mounted, setMounted] = useState(false);
  const [theme, setTheme] = useState('light');
  const [activeTab, setActiveTab] = useState('dashboard'); // 'dashboard' | 'ledger' | 'batches' | 'buyer' | 'audit'
  const [qrLoaded, setQrLoaded] = useState(false);
  const [state, setState] = useState(DEFAULT_STATE);
  const [buyerModeRecord, setBuyerModeRecord] = useState(null); // When loaded via #r=<base64>
  const [selectedBuyerBatchId, setSelectedBuyerBatchId] = useState('');
  const [printingLabelBatch, setPrintingLabelBatch] = useState(null);
  const [showPitchModal, setShowPitchModal] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  // Forms
  const [newLot, setNewLot] = useState({
    recycler: '',
    invoice: '',
    date: new Date().toISOString().slice(0, 10),
    mt: '',
    invFile: '',
    labFile: '',
  });

  const [newBatch, setNewBatch] = useState({
    buyer: '',
    product: '',
    total: '',
    pct: '35',
    date: new Date().toISOString().slice(0, 10),
    notes: '',
  });

  const [auditBuyerFilter, setAuditBuyerFilter] = useState('ALL');

  // Trigger brief toast
  const triggerToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3000);
  };

  // ── Load & Persist State ───────────────────────────────────────────────────
  useEffect(() => {
    setMounted(true);
    // Dark mode preference
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
        console.warn('Could not read localStorage:', e);
      }

      // Check URL Hash for Buyer Mode (#r=...)
      checkHashForBuyerMode();
      window.addEventListener('hashchange', checkHashForBuyerMode);
      return () => window.removeEventListener('hashchange', checkHashForBuyerMode);
    }
  }, []);

  const checkHashForBuyerMode = () => {
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
        console.error('Invalid QR record in hash:', err);
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
      console.warn('Could not save to localStorage:', e);
    }
  };

  const resetToSampleData = () => {
    if (window.confirm('Reset all lots and batches back to default sample demo data?')) {
      saveState(DEFAULT_STATE);
      setSelectedBuyerBatchId(DEFAULT_STATE.batches[0]?.id || '');
      triggerToast('Reset to sample demo data.');
    }
  };

  // ── FIFO Calculations & Ledger Derived State (Section 6) ───────────────────
  const { lotBalances, totalPurchased, totalAllocated, remainingLedgerBalance, batchesWithAlloc } = useMemo(() => {
    const lotUsageMap = {};
    state.lots.forEach((l) => {
      lotUsageMap[l.id] = 0;
    });

    // Recompute FIFO allocations sequentially across batches
    const updatedBatches = state.batches.map((b) => {
      const needed = Math.round((Number(b.total) * Number(b.pct)) / 100 * 1000) / 1000;
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

    const totalPurchased = lotBalances.reduce((acc, l) => acc + Number(l.mt), 0);
    const totalAllocated = lotBalances.reduce((acc, l) => acc + l.allocated, 0);
    const remainingLedgerBalance = Math.round(Math.max(0, totalPurchased - totalAllocated) * 1000) / 1000;

    return {
      lotBalances,
      totalPurchased: Math.round(totalPurchased * 100) / 100,
      totalAllocated: Math.round(totalAllocated * 100) / 100,
      remainingLedgerBalance,
      batchesWithAlloc: updatedBatches,
    };
  }, [state]);

  // Set default selected batch for buyer tab
  useEffect(() => {
    if (!selectedBuyerBatchId && batchesWithAlloc.length > 0) {
      setSelectedBuyerBatchId(batchesWithAlloc[0].id);
    }
  }, [batchesWithAlloc, selectedBuyerBatchId]);

  // ── Release Checks Helper (Section 6) ──────────────────────────────────────
  const evaluateReleaseChecks = (batch) => {
    // 1. Material fully traced to purchase lot(s)
    const check1 = batch.isFullyTraced;

    // 2. Recycler invoice attached for every lot used
    const lotsUsed = batch.alloc.map((a) => state.lots.find((l) => l.id === a.lot)).filter(Boolean);
    const check2 = lotsUsed.length > 0 && lotsUsed.every((l) => l.inv && l.inv.trim() !== '');

    // 3. Lab report attached for every lot used
    const check3 = lotsUsed.length > 0 && lotsUsed.every((l) => l.lab && l.lab.trim() !== '');

    // 4. Recycled share >= buyer minimum
    const check4 = Number(batch.pct) >= Number(state.minPct);

    const canRelease = check1 && check2 && check3 && check4;

    const blockingReasons = [];
    if (!check1) blockingReasons.push('Material exceeds available ledger lots');
    if (!check2) {
      const missingInvLots = lotsUsed.filter((l) => !l.inv || l.inv.trim() === '').map((l) => l.id);
      blockingReasons.push(`Missing invoice on file for ${missingInvLots.join(', ')}`);
    }
    if (!check3) {
      const missingLabLots = lotsUsed.filter((l) => !l.lab || l.lab.trim() === '').map((l) => l.id);
      blockingReasons.push(`Missing lab test report on file for ${missingLabLots.join(', ')}`);
    }
    if (!check4) blockingReasons.push(`Recycled content (${batch.pct}%) below buyer minimum (${state.minPct}%)`);

    return { check1, check2, check3, check4, canRelease, blockingReasons };
  };

  // ── QR Generation & Record Packaging (Section 7) ───────────────────────────
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
          r: lot ? lot.recycler : a.lot,
          v: lot ? lot.invoice : '—',
          d: lot ? lot.date : '—',
          m: a.mt,
          x: !!(lot && lot.inv),
          y: !!(lot && lot.lab),
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

  // Draw QR code on a canvas element
  const renderQrOnCanvas = (canvas, text, size = 160) => {
    if (!canvas || !window.QRCode) return;
    const darkColor = theme === 'dark' ? '#E7EDEC' : '#1B2A3A';
    window.QRCode.toCanvas(
      canvas,
      text,
      {
        width: size,
        margin: 1,
        color: {
          dark: darkColor,
          light: '#00000000', // Transparent background
        },
      },
      (err) => {
        if (err) console.error('QR draw error:', err);
      }
    );
  };

  // ── Actions ────────────────────────────────────────────────────────────────

  // Attach Document (Filename only as per Section 4 & 5)
  const handleAttachFile = (lotId, field, e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fileName = file.name;
    const updatedLots = state.lots.map((l) => {
      if (l.id === lotId) {
        return { ...l, [field]: fileName };
      }
      return l;
    });

    saveState({ ...state, lots: updatedLots });
    triggerToast(`Attached "${fileName}" to ${lotId}.`);
    e.target.value = ''; // Reset input
  };

  // Add Purchase Lot
  const handleAddLot = (e) => {
    e.preventDefault();
    if (!newLot.recycler || !newLot.invoice || !newLot.mt) {
      alert('Please fill in Recycler, Invoice number, and Tonnage.');
      return;
    }

    const nextLotNum = state.lots.length + 1;
    const lotId = `LOT-${String(nextLotNum).padStart(3, '0')}`;

    const createdLot = {
      id: lotId,
      recycler: newLot.recycler.trim(),
      invoice: newLot.invoice.trim(),
      date: newLot.date,
      mt: parseFloat(newLot.mt),
      inv: newLot.invFile || '',
      lab: newLot.labFile || '',
    };

    saveState({
      ...state,
      lots: [...state.lots, createdLot],
    });

    setNewLot({
      recycler: '',
      invoice: '',
      date: new Date().toISOString().slice(0, 10),
      mt: '',
      invFile: '',
      labFile: '',
    });

    triggerToast(`Created purchase ${lotId} (+${createdLot.mt} MT).`);
  };

  // Add Batch with Mass-Balance Refusal Check (Section 6)
  const handleAddBatch = (e) => {
    e.preventDefault();
    const totalWeight = parseFloat(newBatch.total);
    const pct = parseFloat(newBatch.pct);

    if (isNaN(totalWeight) || totalWeight <= 0 || isNaN(pct) || pct <= 0) {
      alert('Please provide valid positive numbers for batch weight and recycled %.');
      return;
    }

    const neededRecycledMT = Math.round((totalWeight * pct) / 100 * 1000) / 1000;

    // Mass-Balance Refusal Check
    if (neededRecycledMT > remainingLedgerBalance) {
      const shortage = (neededRecycledMT - remainingLedgerBalance).toFixed(2);
      alert(
        `Mass-Balance Check Refused:\n\nNot enough verified material. This batch needs ${neededRecycledMT.toFixed(
          2
        )} MT but only ${remainingLedgerBalance.toFixed(2)} MT is left in the ledger (short by ${shortage} MT).\n\nPlease add more recycled material purchases to your ledger first.`
      );
      return;
    }

    const nextBatchNum = state.batches.length + 1;
    const batchId = `BT-2026-${String(nextBatchNum).padStart(3, '0')}`;

    const createdBatch = {
      id: batchId,
      buyer: newBatch.buyer.trim() || 'Horizon Beverages (sample)',
      product: newBatch.product.trim() || '28mm closure cap',
      total: totalWeight,
      pct: pct,
      date: newBatch.date,
      status: 'draft',
      notes: newBatch.notes.trim(),
      alloc: [],
    };

    const nextBatches = [...state.batches, createdBatch];
    saveState({ ...state, batches: nextBatches });

    setNewBatch({
      buyer: '',
      product: '',
      total: '',
      pct: '35',
      date: new Date().toISOString().slice(0, 10),
      notes: '',
    });

    triggerToast(`Logged batch ${batchId} (${totalWeight} MT).`);
    setActiveTab('batches');
  };

  // Release Batch
  const handleReleaseBatch = (batchId) => {
    const batch = batchesWithAlloc.find((b) => b.id === batchId);
    if (!batch) return;

    const { canRelease, blockingReasons } = evaluateReleaseChecks(batch);
    if (!canRelease) {
      alert(`Cannot release this batch for dispatch:\n\n• ${blockingReasons.join('\n• ')}`);
      return;
    }

    const updated = state.batches.map((b) => {
      if (b.id === batchId) {
        return { ...b, status: 'released' };
      }
      return b;
    });

    saveState({ ...state, batches: updated });
    triggerToast(`Batch ${batchId} released for dispatch.`);
  };

  // Delete Draft Batch (Section 6: releases allocation back)
  const handleDeleteDraft = (batchId) => {
    const batch = state.batches.find((b) => b.id === batchId);
    if (!batch) return;
    if (batch.status === 'released') {
      alert('Released batches cannot be deleted.');
      return;
    }

    if (window.confirm(`Delete draft batch ${batchId}? Its allocated material will return to the ledger balance.`)) {
      const updated = state.batches.filter((b) => b.id !== batchId);
      saveState({ ...state, batches: updated });
      triggerToast(`Deleted draft ${batchId}. Allocated tonnes returned to ledger.`);
    }
  };

  // Copy CSV of Audit Pack (Section 7)
  const handleCopyCsv = () => {
    const filteredBatches = batchesWithAlloc.filter(
      (b) => auditBuyerFilter === 'ALL' || b.buyer === auditBuyerFilter
    );

    let csv = 'Batch ID,Date,Buyer,Product,Total MT,Recycled Pct,Recycled MT,Status,Lots Traced,Invoices on File,Lab Reports on File\n';
    filteredBatches.forEach((b) => {
      const lotsUsed = b.alloc.map((a) => a.lot).join('; ');
      const lotsObj = b.alloc.map((a) => state.lots.find((l) => l.id === a.lot)).filter(Boolean);
      const invs = lotsObj.map((l) => l.inv || 'MISSING').join('; ');
      const labs = lotsObj.map((l) => l.lab || 'MISSING').join('; ');

      csv += `"${b.id}","${b.date}","${b.buyer}","${b.product}",${b.total},${b.pct}%,${b.needed},"${b.status}","${lotsUsed}","${invs}","${labs}"\n`;
    });

    navigator.clipboard
      .writeText(csv)
      .then(() => triggerToast('Audit trace CSV copied to clipboard!'))
      .catch(() => alert('Could not copy to clipboard.'));
  };

  // Print Pallet Label
  const triggerPrintPalletLabel = (batch) => {
    setPrintingLabelBatch(batch);
    setTimeout(() => {
      window.print();
    }, 200);
  };

  // Live preview for batch creation
  const livePreview = useMemo(() => {
    const total = parseFloat(newBatch.total) || 0;
    const pct = parseFloat(newBatch.pct) || 0;
    const needed = Math.round((total * pct) / 100 * 1000) / 1000;
    const wouldRefuse = needed > remainingLedgerBalance;
    const shortage = wouldRefuse ? (needed - remainingLedgerBalance).toFixed(2) : 0;
    return { needed, wouldRefuse, shortage };
  }, [newBatch.total, newBatch.pct, remainingLedgerBalance]);

  if (!mounted) return null;

  // ═══════════════════════════════════════════════════════════════════════════
  // BUYER-ONLY VIEW (When loaded via QR hash #r=...)
  // ═══════════════════════════════════════════════════════════════════════════
  if (buyerModeRecord) {
    const r = buyerModeRecord;
    return (
      <div className={`batchtrace-root ${theme}`} data-theme={theme}>
        <Script
          src="https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js"
          onLoad={() => setQrLoaded(true)}
        />
        <div className="buyer-container">
          {/* Top Bar */}
          <div className="buyer-bar">
            <div>
              <span className="buyer-title">BATCH DOCUMENTATION INSPECTION</span>
              <span className="buyer-sub">Public verification record scanned from pallet QR label</span>
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
          <div className="notice-box warn">
            <b>Disclaimer:</b> Internal documentation record — reflects what was entered by the manufacturer. Not a
            certificate, not a government compliance status, not an audit. Ask for original recycler invoices, lab test
            reports, and verify EPR certificates directly on the CPCB portal (eprplastic.cpcb.gov.in).
          </div>

          {/* Batch Details Card */}
          <div className="card">
            <div className="flex justify-between items-start flex-wrap gap-4 border-b border-[var(--line)] pb-4 mb-4">
              <div>
                <span className="text-xs text-[var(--ink-soft)] uppercase tracking-wider block">Batch Identification</span>
                <h1 className="text-2xl font-bold mono mt-1 text-[var(--ink)]">{r.i}</h1>
                <p className="text-xs text-[var(--ink-soft)] mt-0.5">Logged: {r.d || '—'}</p>
              </div>
              <div className="text-right">
                <span
                  className={`chip ${
                    r.s === 'released' ? 'chip-ok' : 'chip-warn'
                  }`}
                >
                  {r.s === 'released' ? 'Released for dispatch' : 'Draft / Unreleased'}
                </span>
                <span className="text-xs mono block mt-1 text-[var(--ink-soft)]">
                  Manufacturer: {r.f || 'Demo Polymers'}
                </span>
              </div>
            </div>

            <div className="grid-2 gap-4 text-sm mb-6">
              <div className="field-row">
                <span className="text-[var(--ink-soft)]">Client / Buyer</span>
                <span className="font-medium text-[var(--ink)]">{r.b}</span>
              </div>
              <div className="field-row">
                <span className="text-[var(--ink-soft)]">Product Description</span>
                <span className="font-medium text-[var(--ink)]">{r.p}</span>
              </div>
              <div className="field-row">
                <span className="text-[var(--ink-soft)]">Total Batch Weight</span>
                <span className="mono font-semibold text-[var(--ink)]">{r.t} MT</span>
              </div>
              <div className="field-row">
                <span className="text-[var(--ink-soft)]">Recycled Content Share</span>
                <span className="mono font-bold text-[var(--steel-deep)] text-base">{r.c}% rPET</span>
              </div>
              <div className="field-row">
                <span className="text-[var(--ink-soft)]">Recycled Content Weight</span>
                <span className="mono font-semibold text-[var(--steel-deep)]">
                  {Math.round(((Number(r.t) * Number(r.c)) / 100) * 100) / 100} MT
                </span>
              </div>
            </div>

            {/* Traced Source Lots */}
            <h2 className="text-xs uppercase tracking-wider font-semibold text-[var(--ink-soft)] mb-2">
              Traced Recycled Material Purchases (FIFO)
            </h2>
            <div className="table-wrap mb-6">
              <table>
                <thead>
                  <tr>
                    <th>Recycler</th>
                    <th>Invoice Ref</th>
                    <th>Date</th>
                    <th className="text-right">Allocated MT</th>
                    <th>Invoice on File</th>
                    <th>Lab Report on File</th>
                  </tr>
                </thead>
                <tbody>
                  {r.l && r.l.length > 0 ? (
                    r.l.map((lot, idx) => (
                      <tr key={idx}>
                        <td className="font-medium">{lot.r}</td>
                        <td className="mono text-xs">{lot.v}</td>
                        <td className="mono text-xs">{lot.d}</td>
                        <td className="mono text-right font-semibold">{lot.m} MT</td>
                        <td>
                          {lot.x ? (
                            <span className="chip chip-ok text-xs">✓ On file</span>
                          ) : (
                            <span className="chip chip-bad text-xs">✗ Missing</span>
                          )}
                        </td>
                        <td>
                          {lot.y ? (
                            <span className="chip chip-ok text-xs">✓ On file</span>
                          ) : (
                            <span className="chip chip-bad text-xs">✗ Missing</span>
                          )}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="6" className="text-center text-[var(--ink-soft)] py-4">
                        No purchase lots recorded for this batch.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="text-xs text-[var(--ink-soft)] border-t border-[var(--line)] pt-3 flex justify-between items-center flex-wrap gap-2">
              <span>This record is self-contained and encoded directly in the URL hash.</span>
              <button
                onClick={() => window.print()}
                className="btn ghost-btn text-xs"
              >
                🖨 Print Inspection Record
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MAIN FACTORY APPLICATION VIEW
  // ═══════════════════════════════════════════════════════════════════════════
  const selectedBuyerBatch = batchesWithAlloc.find((b) => b.id === selectedBuyerBatchId) || batchesWithAlloc[0];

  return (
    <div className={`batchtrace-root ${theme}`} data-theme={theme}>
      {/* Pinned Script for QR drawing */}
      <Script
        src="https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js"
        onLoad={() => setQrLoaded(true)}
      />

      {/* Floating Toast Notification */}
      {toastMessage && <div className="toast-pill">{toastMessage}</div>}

      {/* Printable Pallet Label (Shown strictly during print when selected) */}
      <div className={`printable-pallet-sticker ${printingLabelBatch ? 'active' : ''}`}>
        {printingLabelBatch && (
          <div className="pallet-card">
            <div className="pallet-header">
              <h3>BATCH IDENTIFICATION & RECYCLED CONTENT</h3>
              <span className="mono">{printingLabelBatch.id}</span>
            </div>
            <div className="pallet-body">
              <div className="pallet-info">
                <div className="pallet-row">
                  <span className="pallet-label">Buyer / Client:</span>
                  <span className="pallet-val">{printingLabelBatch.buyer}</span>
                </div>
                <div className="pallet-row">
                  <span className="pallet-label">Product:</span>
                  <span className="pallet-val">{printingLabelBatch.product}</span>
                </div>
                <div className="pallet-row">
                  <span className="pallet-label">Total Weight:</span>
                  <span className="pallet-val mono">{printingLabelBatch.total} MT</span>
                </div>
                <div className="pallet-row">
                  <span className="pallet-label">Recycled Share:</span>
                  <span className="pallet-val mono font-bold text-lg">{printingLabelBatch.pct}% rPET</span>
                </div>
                <div className="pallet-row">
                  <span className="pallet-label">Recycled Weight:</span>
                  <span className="pallet-val mono">{printingLabelBatch.needed} MT</span>
                </div>
                <div className="pallet-row">
                  <span className="pallet-label">Date:</span>
                  <span className="pallet-val mono">{printingLabelBatch.date}</span>
                </div>
                <div className="pallet-row">
                  <span className="pallet-label">Status:</span>
                  <span className="pallet-val font-semibold uppercase">{printingLabelBatch.status}</span>
                </div>
              </div>
              <div className="pallet-qr">
                <PalletQrCanvas batch={printingLabelBatch} getQrUrl={getQrUrlForBatch} />
                <span className="text-[10px] mono text-center block mt-1">Scan for verification</span>
              </div>
            </div>
            <div className="pallet-footer">
              <span>Internal factory documentation record. Ask manufacturer for original invoices & lab reports. Not a CPCB certificate.</span>
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
                Recycled-content documentation & mass-balance ledger for plastics manufacturers.
              </p>
            </div>
          </div>
          <span className="status-tag">Pilot Prototype · Not CPCB Affiliated</span>
        </div>

        <div className="header-right">
          <button
            onClick={() => setShowPitchModal(true)}
            className="btn ghost-btn text-xs"
            title="View 5-minute Expo Demo Pitch Script"
          >
            🎤 5-Min Demo Script
          </button>
          <button
            onClick={resetToSampleData}
            className="btn ghost-btn text-xs text-red-600 dark:text-red-400"
            title="Reset to default sample dataset"
          >
            🔄 Reset Demo
          </button>
          <button
            onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
            className="btn ghost-btn text-xs"
            title="Toggle Light/Dark Theme"
          >
            {theme === 'light' ? '🌙 Dark' : '☀️ Light'}
          </button>
        </div>
      </header>

      {/* ── Sub-header / Factory Details ────────────────────────────────────── */}
      <div className="sub-header">
        <div className="flex items-center gap-4 flex-wrap text-xs">
          <span>
            <b>Factory:</b> <span className="mono">{state.factory}</span>
          </span>
          <span className="text-[var(--line)]">|</span>
          <span>
            <b>Buyer Min Recycled Share:</b>{' '}
            <input
              type="number"
              min="0"
              max="100"
              value={state.minPct}
              onChange={(e) => saveState({ ...state, minPct: Number(e.target.value) || 0 })}
              className="inline-input mono"
              title="Global minimum recycled percentage required by buyers"
            />
            %
          </span>
        </div>
        <div className="text-xs text-[var(--ink-soft)] mono">
          Ledger Balance: <b className="text-[var(--steel-deep)]">{remainingLedgerBalance} MT</b> / {totalPurchased} MT
        </div>
      </div>

      {/* ── Navigation Tabs ─────────────────────────────────────────────────── */}
      <nav className="tab-nav">
        <button
          className={`tab-btn ${activeTab === 'dashboard' ? 'active' : ''}`}
          onClick={() => setActiveTab('dashboard')}
        >
          📊 Dashboard
        </button>
        <button
          className={`tab-btn ${activeTab === 'ledger' ? 'active' : ''}`}
          onClick={() => setActiveTab('ledger')}
        >
          📋 Material Ledger ({state.lots.length})
        </button>
        <button
          className={`tab-btn ${activeTab === 'batches' ? 'active' : ''}`}
          onClick={() => setActiveTab('batches')}
        >
          📦 Batches ({state.batches.length})
        </button>
        <button
          className={`tab-btn ${activeTab === 'buyer' ? 'active' : ''}`}
          onClick={() => setActiveTab('buyer')}
        >
          📱 Buyer Scan View & QR
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
            TAB 1: DASHBOARD
            ═══════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'dashboard' && (
          <div className="tab-pane">
            <div className="notice-box info">
              <b>Prototype Purpose:</b> Enforces what spreadsheets fail to catch: mass-balance refusal, missing lab report
              gating, and self-service QR pallet verification. All records reflect factory inputs — not a CPCB certificate.
            </div>

            {/* 4 KPIs */}
            <div className="grid-4 mb-6">
              <div className="kpi-card">
                <span className="kpi-label">Purchased Recycled MT</span>
                <span className="kpi-value mono">{totalPurchased} MT</span>
                <span className="kpi-sub">{state.lots.length} purchase lots on file</span>
              </div>
              <div className="kpi-card">
                <span className="kpi-label">Allocated to Batches</span>
                <span className="kpi-value mono text-[var(--steel-deep)]">{totalAllocated} MT</span>
                <span className="kpi-sub">
                  {batchesWithAlloc.filter((b) => b.status === 'released').length} released ·{' '}
                  {batchesWithAlloc.filter((b) => b.status === 'draft').length} draft
                </span>
              </div>
              <div className="kpi-card">
                <span className="kpi-label">Available Ledger Balance</span>
                <span className="kpi-value mono text-[var(--ok)]">{remainingLedgerBalance} MT</span>
                <span className="kpi-sub">
                  {totalPurchased > 0 ? Math.round((remainingLedgerBalance / totalPurchased) * 100) : 0}% unallocated
                </span>
              </div>
              <div className="kpi-card">
                <span className="kpi-label">Production Batches</span>
                <span className="kpi-value mono">{state.batches.length}</span>
                <span className="kpi-sub">
                  {batchesWithAlloc.filter((b) => !evaluateReleaseChecks(b).canRelease && b.status === 'draft').length} blocked
                </span>
              </div>
            </div>

            {/* Needs Attention & Progress Bars */}
            <div className="grid-2 gap-6">
              {/* Needs Attention Card */}
              <div className="card">
                <h2 className="card-title">⚠️ Needs Attention / Gaps</h2>
                <div className="space-y-3">
                  {/* Missing Lab Report Alert */}
                  {state.lots.filter((l) => !l.lab || l.lab.trim() === '').map((l) => (
                    <div key={l.id} className="alert-item alert-bad">
                      <div>
                        <b className="mono">{l.id}</b> ({l.recycler}): Missing accredited lab report.
                        <p className="text-xs text-[var(--ink-soft)] mt-0.5">
                          Batches drawing material from this lot are blocked from release.
                        </p>
                      </div>
                      <button
                        onClick={() => setActiveTab('ledger')}
                        className="btn ghost-btn text-xs whitespace-nowrap"
                      >
                        Attach Lab File
                      </button>
                    </div>
                  ))}

                  {/* Missing Invoice Alert */}
                  {state.lots.filter((l) => !l.inv || l.inv.trim() === '').map((l) => (
                    <div key={l.id} className="alert-item alert-bad">
                      <div>
                        <b className="mono">{l.id}</b> ({l.recycler}): Missing recycler GST invoice.
                      </div>
                      <button
                        onClick={() => setActiveTab('ledger')}
                        className="btn ghost-btn text-xs whitespace-nowrap"
                      >
                        Attach Invoice
                      </button>
                    </div>
                  ))}

                  {/* Blocked Batches Alert */}
                  {batchesWithAlloc.filter((b) => b.status === 'draft').map((b) => {
                    const { canRelease, blockingReasons } = evaluateReleaseChecks(b);
                    return (
                      <div key={b.id} className={`alert-item ${canRelease ? 'alert-ok' : 'alert-warn'}`}>
                        <div>
                          <b className="mono">{b.id}</b> ({b.buyer}):{' '}
                          {canRelease ? 'All 4 release checks passed. Ready to dispatch.' : blockingReasons.join('; ')}
                        </div>
                        <button
                          onClick={() => setActiveTab('batches')}
                          className="btn ghost-btn text-xs whitespace-nowrap"
                        >
                          View Batch
                        </button>
                      </div>
                    );
                  })}

                  {state.lots.every((l) => l.lab && l.inv) &&
                    batchesWithAlloc.every((b) => b.status === 'released') && (
                      <div className="text-xs text-[var(--ok)] py-4 text-center">
                        ✓ All lots have documents attached and all batches are released.
                      </div>
                    )}
                </div>
              </div>

              {/* Purchase Lot Balances */}
              <div className="card">
                <h2 className="card-title">📦 Recycled Purchase Lots (FIFO Balances)</h2>
                <div className="space-y-4">
                  {lotBalances.map((lot) => (
                    <div key={lot.id} className="lot-progress-row">
                      <div className="flex justify-between items-center text-xs mb-1">
                        <div>
                          <span className="mono font-semibold text-[var(--ink)]">{lot.id}</span>
                          <span className="text-[var(--ink-soft)] ml-2">{lot.recycler}</span>
                        </div>
                        <span className="mono">
                          {lot.balance} MT left / {lot.mt} MT ({100 - lot.percentUsed}% remaining)
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
                                : lot.percentUsed > 80
                                ? 'var(--amber)'
                                : 'var(--ok)',
                          }}
                        />
                      </div>
                      <div className="flex justify-between text-[11px] text-[var(--ink-soft)] mt-1">
                        <span>Inv: {lot.invoice} ({lot.date})</span>
                        <span className="flex gap-2">
                          <span>{lot.inv ? '✓ Invoice' : '✗ No Invoice'}</span>
                          <span>{lot.lab ? '✓ Lab' : '✗ No Lab'}</span>
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════════
            TAB 2: MATERIAL LEDGER
            ═══════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'ledger' && (
          <div className="tab-pane">
            <div className="notice-box info">
              <b>Material Ledger:</b> Every purchase lot logged here is allocated strictly by FIFO (oldest date first) to
              subsequent production runs. Attaching files clears document gaps in batches.
            </div>

            <div className="grid-ledger gap-6">
              {/* Ledger Table */}
              <div className="card">
                <h2 className="card-title">Recycled Material Purchase Ledger</h2>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Lot ID</th>
                        <th>Purchase Date</th>
                        <th>Recycler</th>
                        <th>Invoice Ref</th>
                        <th className="text-right">Total MT</th>
                        <th className="text-right">Allocated</th>
                        <th className="text-right">Remaining</th>
                        <th>Invoice Doc</th>
                        <th>Lab Report Doc</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lotBalances.map((lot) => (
                        <tr key={lot.id}>
                          <td className="mono font-semibold">{lot.id}</td>
                          <td className="mono text-xs">{lot.date}</td>
                          <td className="font-medium text-xs">{lot.recycler}</td>
                          <td className="mono text-xs">{lot.invoice}</td>
                          <td className="mono text-right">{lot.mt}</td>
                          <td className="mono text-right text-[var(--ink-soft)]">{lot.allocated}</td>
                          <td className="mono text-right font-bold text-[var(--ok)]">{lot.balance}</td>
                          <td>
                            {lot.inv ? (
                              <div className="chip chip-ok text-[11px] mono flex items-center justify-between gap-1">
                                <span title={lot.inv}>✓ {lot.inv.slice(0, 14)}</span>
                              </div>
                            ) : (
                              <label className="btn-file-upload">
                                + Attach
                                <input
                                  type="file"
                                  className="hidden"
                                  onChange={(e) => handleAttachFile(lot.id, 'inv', e)}
                                />
                              </label>
                            )}
                          </td>
                          <td>
                            {lot.lab ? (
                              <div className="chip chip-ok text-[11px] mono flex items-center justify-between gap-1">
                                <span title={lot.lab}>✓ {lot.lab.slice(0, 14)}</span>
                              </div>
                            ) : (
                              <label className="btn-file-upload btn-file-bad">
                                + Attach
                                <input
                                  type="file"
                                  className="hidden"
                                  onChange={(e) => handleAttachFile(lot.id, 'lab', e)}
                                />
                              </label>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Add Purchase Lot Form */}
              <div className="card">
                <h2 className="card-title">Log Recycled Material Purchase</h2>
                <form onSubmit={handleAddLot} className="space-y-3">
                  <div>
                    <label className="input-label">Recycler Name</label>
                    <input
                      required
                      placeholder="e.g. GreenLoop Recyclers (sample)"
                      value={newLot.recycler}
                      onChange={(e) => setNewLot({ ...newLot, recycler: e.target.value })}
                      className="text-input"
                    />
                  </div>
                  <div>
                    <label className="input-label">Invoice Reference</label>
                    <input
                      required
                      placeholder="e.g. INV-2026-904"
                      value={newLot.invoice}
                      onChange={(e) => setNewLot({ ...newLot, invoice: e.target.value })}
                      className="text-input mono"
                    />
                  </div>
                  <div className="grid-2 gap-3">
                    <div>
                      <label className="input-label">Purchase Date</label>
                      <input
                        type="date"
                        required
                        value={newLot.date}
                        onChange={(e) => setNewLot({ ...newLot, date: e.target.value })}
                        className="text-input mono"
                      />
                    </div>
                    <div>
                      <label className="input-label">Tonnage (MT)</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0.1"
                        required
                        placeholder="e.g. 20.0"
                        value={newLot.mt}
                        onChange={(e) => setNewLot({ ...newLot, mt: e.target.value })}
                        className="text-input mono"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="input-label">Recycler Invoice File (simulated)</label>
                    <input
                      type="file"
                      onChange={(e) => setNewLot({ ...newLot, invFile: e.target.files?.[0]?.name || '' })}
                      className="text-xs file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:bg-[var(--steel)] file:text-white"
                    />
                    {newLot.invFile && <span className="text-[11px] mono block text-[var(--ok)] mt-1">✓ {newLot.invFile}</span>}
                  </div>

                  <div>
                    <label className="input-label">Lab Test Report File (simulated)</label>
                    <input
                      type="file"
                      onChange={(e) => setNewLot({ ...newLot, labFile: e.target.files?.[0]?.name || '' })}
                      className="text-xs file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:bg-[var(--steel)] file:text-white"
                    />
                    {newLot.labFile && <span className="text-[11px] mono block text-[var(--ok)] mt-1">✓ {newLot.labFile}</span>}
                  </div>

                  <button type="submit" className="btn solid-btn w-full mt-4">
                    + Add Purchase to Ledger
                  </button>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════════
            TAB 3: BATCHES
            ═══════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'batches' && (
          <div className="tab-pane">
            <div className="grid-batches gap-6">
              {/* Batches List */}
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--ink-soft)]">
                    Logged Production Batches ({batchesWithAlloc.length})
                  </h2>
                  <span className="text-xs text-[var(--ink-soft)]">
                    Buyer Requirement: <b className="mono">{state.minPct}% min rPET</b>
                  </span>
                </div>

                {batchesWithAlloc.map((b) => {
                  const { check1, check2, check3, check4, canRelease, blockingReasons } = evaluateReleaseChecks(b);
                  const isReleased = b.status === 'released';

                  return (
                    <div key={b.id} className="card batch-card">
                      <div className="batch-header">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="mono font-bold text-lg text-[var(--ink)]">{b.id}</h3>
                            <span className={`chip ${isReleased ? 'chip-ok' : 'chip-warn'}`}>
                              {isReleased ? '✓ Released for dispatch' : 'Draft'}
                            </span>
                          </div>
                          <p className="text-xs text-[var(--ink-soft)] mt-0.5">
                            {b.buyer} · {b.product}
                          </p>
                        </div>
                        <div className="text-right">
                          <span className="mono font-bold text-lg text-[var(--steel-deep)]">{b.pct}%</span>
                          <span className="text-xs block text-[var(--ink-soft)]">
                            {b.needed} MT recycled / {b.total} MT gross
                          </span>
                        </div>
                      </div>

                      {/* Traced FIFO Allocations */}
                      <div className="my-3">
                        <span className="text-xs text-[var(--ink-soft)] block mb-1">FIFO Traced Source Lots:</span>
                        <div className="flex flex-wrap gap-2">
                          {b.alloc.map((a, idx) => {
                            const lot = state.lots.find((l) => l.id === a.lot);
                            const hasDocs = lot && lot.inv && lot.lab;
                            return (
                              <span
                                key={idx}
                                className={`alloc-pill ${hasDocs ? 'alloc-ok' : 'alloc-bad'}`}
                                title={
                                  lot
                                    ? `${lot.recycler} (Inv: ${lot.inv || 'MISSING'}, Lab: ${lot.lab || 'MISSING'})`
                                    : ''
                                }
                              >
                                <span className="mono">{a.lot}</span>: <b>{a.mt} MT</b>
                                {!hasDocs && <span className="ml-1 text-red-500">⚠ missing docs</span>}
                              </span>
                            );
                          })}
                        </div>
                      </div>

                      {/* 4 Release Checks (Section 6) */}
                      <div className="checks-grid">
                        <div className={`check-item ${check1 ? 'check-pass' : 'check-fail'}`}>
                          <span>{check1 ? '✓' : '✗'}</span>
                          <span>Material Traced ({b.needed} MT)</span>
                        </div>
                        <div className={`check-item ${check2 ? 'check-pass' : 'check-fail'}`}>
                          <span>{check2 ? '✓' : '✗'}</span>
                          <span>Invoice on File</span>
                        </div>
                        <div className={`check-item ${check3 ? 'check-pass' : 'check-fail'}`}>
                          <span>{check3 ? '✓' : '✗'}</span>
                          <span>Lab Test on File</span>
                        </div>
                        <div className={`check-item ${check4 ? 'check-pass' : 'check-fail'}`}>
                          <span>{check4 ? '✓' : '✗'}</span>
                          <span>≥ {state.minPct}% Minimum</span>
                        </div>
                      </div>

                      {/* Inline QR Canvas & Actions */}
                      <div className="batch-footer">
                        <div className="flex items-center gap-3">
                          <div className="inline-qr-box">
                            <BatchInlineQrCanvas batch={b} getQrUrl={getQrUrlForBatch} />
                          </div>
                          <div>
                            <span className="text-[11px] mono text-[var(--ink-soft)] block">
                              Pallet Sticker QR
                            </span>
                            <span className="text-[10px] text-[var(--ink-soft)]">
                              Encodes batch + verified lot breakdown
                            </span>
                          </div>
                        </div>

                        <div className="action-buttons">
                          {!isReleased ? (
                            <>
                              <button
                                onClick={() => handleReleaseBatch(b.id)}
                                disabled={!canRelease}
                                className={`btn ${canRelease ? 'solid-btn' : 'disabled-btn'} text-xs`}
                                title={canRelease ? 'Release batch for dispatch' : blockingReasons.join('\n')}
                              >
                                Release for Dispatch
                              </button>
                              <button
                                onClick={() => handleDeleteDraft(b.id)}
                                className="btn ghost-btn text-xs text-red-600 dark:text-red-400"
                                title="Delete draft and return allocated tonnes to ledger"
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
                            onClick={() => triggerPrintPalletLabel(b)}
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

              {/* Log Batch Form (with live preview & Mass-Balance Refusal) */}
              <div className="card h-fit sticky top-4">
                <h2 className="card-title">Log Production Batch</h2>
                <form onSubmit={handleAddBatch} className="space-y-3">
                  <div>
                    <label className="input-label">Buyer / Client</label>
                    <input
                      required
                      placeholder="e.g. Horizon Beverages (sample)"
                      value={newBatch.buyer}
                      onChange={(e) => setNewBatch({ ...newBatch, buyer: e.target.value })}
                      className="text-input"
                    />
                  </div>

                  <div>
                    <label className="input-label">Product Description</label>
                    <input
                      required
                      placeholder="e.g. 28mm water-bottle cap"
                      value={newBatch.product}
                      onChange={(e) => setNewBatch({ ...newBatch, product: e.target.value })}
                      className="text-input"
                    />
                  </div>

                  <div className="grid-2 gap-3">
                    <div>
                      <label className="input-label">Total Batch (MT)</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0.1"
                        required
                        placeholder="e.g. 10.0"
                        value={newBatch.total}
                        onChange={(e) => setNewBatch({ ...newBatch, total: e.target.value })}
                        className="text-input mono"
                      />
                    </div>
                    <div>
                      <label className="input-label">Recycled Share %</label>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        max="100"
                        required
                        placeholder="e.g. 35"
                        value={newBatch.pct}
                        onChange={(e) => setNewBatch({ ...newBatch, pct: e.target.value })}
                        className="text-input mono"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="input-label">Production Date</label>
                    <input
                      type="date"
                      required
                      value={newBatch.date}
                      onChange={(e) => setNewBatch({ ...newBatch, date: e.target.value })}
                      className="text-input mono"
                    />
                  </div>

                  <div>
                    <label className="input-label">Notes (Optional)</label>
                    <textarea
                      placeholder="e.g. Pilot line 2 run"
                      value={newBatch.notes}
                      onChange={(e) => setNewBatch({ ...newBatch, notes: e.target.value })}
                      className="text-input text-xs"
                      rows="2"
                    />
                  </div>

                  {/* Mass-Balance Live Preview Box (Section 6) */}
                  <div
                    className={`live-preview-box ${
                      livePreview.wouldRefuse ? 'preview-refuse' : 'preview-ok'
                    }`}
                  >
                    <div className="flex justify-between items-center">
                      <span className="font-semibold text-xs">Mass-Balance Preview:</span>
                      <span className="mono font-bold">
                        {livePreview.needed > 0 ? `${livePreview.needed} MT needed` : '—'}
                      </span>
                    </div>
                    <div className="text-[11px] mt-1">
                      {livePreview.wouldRefuse ? (
                        <span className="text-red-700 dark:text-red-300 font-semibold">
                          ⛔ Would be refused: Short by {livePreview.shortage} MT. Ledger balance is only{' '}
                          {remainingLedgerBalance} MT.
                        </span>
                      ) : (
                        <span className="text-green-700 dark:text-green-300">
                          ✓ OK: Ledger has {remainingLedgerBalance} MT available for allocation.
                        </span>
                      )}
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={livePreview.wouldRefuse}
                    className={`btn ${
                      livePreview.wouldRefuse ? 'disabled-btn' : 'solid-btn'
                    } w-full mt-2`}
                  >
                    + Add Production Batch
                  </button>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════════
            TAB 4: BUYER SCAN VIEW & QR
            ═══════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'buyer' && (
          <div className="tab-pane">
            <div className="notice-box info">
              <b>Buyer Self-Service View:</b> When a quality auditor or brand procurement team scans the pallet QR code,
              their phone opens this self-contained verification record directly without needing a login.
            </div>

            <div className="grid-2 gap-6 items-start">
              {/* Batch Selector & Big QR */}
              <div className="card text-center flex flex-col items-center">
                <div className="w-full text-left mb-4">
                  <label className="input-label">Select Batch to View / Scan</label>
                  <select
                    value={selectedBuyerBatch?.id || ''}
                    onChange={(e) => setSelectedBuyerBatchId(e.target.value)}
                    className="text-input mono font-semibold"
                  >
                    {batchesWithAlloc.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.id} — {b.buyer} ({b.pct}% rPET) [{b.status}]
                      </option>
                    ))}
                  </select>
                </div>

                {selectedBuyerBatch && (
                  <div className="qr-big-box my-4">
                    <BuyerBigQrCanvas
                      batch={selectedBuyerBatch}
                      getQrUrl={getQrUrlForBatch}
                    />
                    <span className="mono text-xs text-[var(--ink-soft)] block mt-2">
                      Scan with phone camera to test
                    </span>
                  </div>
                )}

                {/* Base URL Override (Section 7) */}
                <div className="w-full text-left border-t border-[var(--line)] pt-3 mt-2">
                  <label className="input-label">Link the QR points to (Optional override):</label>
                  <input
                    type="text"
                    placeholder="Defaults to current page URL"
                    value={state.baseUrl}
                    onChange={(e) => saveState({ ...state, baseUrl: e.target.value })}
                    className="text-input text-xs mono"
                  />
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => {
                        const url = getQrUrlForBatch(selectedBuyerBatch);
                        navigator.clipboard.writeText(url);
                        triggerToast('Encoded batch QR link copied!');
                      }}
                      className="btn ghost-btn text-xs w-full"
                    >
                      📋 Copy Full QR Link
                    </button>
                    <button
                      onClick={() => triggerPrintPalletLabel(selectedBuyerBatch)}
                      className="btn solid-btn text-xs w-full"
                    >
                      🖨 Print Pallet Label
                    </button>
                  </div>
                </div>
              </div>

              {/* Exact Buyer Screen Preview */}
              <div className="card">
                <div className="border-b border-[var(--line)] pb-3 mb-4 flex justify-between items-center">
                  <span className="text-xs font-semibold text-[var(--ink-soft)] uppercase tracking-wider">
                    Buyer Inspection Screen Preview
                  </span>
                  <span className={`chip ${selectedBuyerBatch?.status === 'released' ? 'chip-ok' : 'chip-warn'}`}>
                    {selectedBuyerBatch?.status === 'released' ? 'Released for dispatch' : 'Draft'}
                  </span>
                </div>

                {selectedBuyerBatch ? (
                  <div className="space-y-4">
                    <div>
                      <h3 className="mono font-bold text-xl text-[var(--ink)]">{selectedBuyerBatch.id}</h3>
                      <p className="text-xs text-[var(--ink-soft)]">{state.factory}</p>
                    </div>

                    <div className="grid-2 gap-3 text-xs">
                      <div className="field-row">
                        <span className="text-[var(--ink-soft)]">Buyer:</span>
                        <span className="font-semibold">{selectedBuyerBatch.buyer}</span>
                      </div>
                      <div className="field-row">
                        <span className="text-[var(--ink-soft)]">Product:</span>
                        <span className="font-semibold">{selectedBuyerBatch.product}</span>
                      </div>
                      <div className="field-row">
                        <span className="text-[var(--ink-soft)]">Batch Weight:</span>
                        <span className="mono">{selectedBuyerBatch.total} MT</span>
                      </div>
                      <div className="field-row">
                        <span className="text-[var(--ink-soft)]">Recycled Share:</span>
                        <span className="mono font-bold text-[var(--steel-deep)]">{selectedBuyerBatch.pct}%</span>
                      </div>
                      <div className="field-row">
                        <span className="text-[var(--ink-soft)]">Recycled Weight:</span>
                        <span className="mono font-semibold">{selectedBuyerBatch.needed} MT</span>
                      </div>
                      <div className="field-row">
                        <span className="text-[var(--ink-soft)]">Date:</span>
                        <span className="mono">{selectedBuyerBatch.date}</span>
                      </div>
                    </div>

                    {/* Source Lots Table */}
                    <div>
                      <span className="text-xs font-semibold uppercase tracking-wider text-[var(--ink-soft)] block mb-2">
                        Allocated Recycled Material Lots:
                      </span>
                      <div className="table-wrap">
                        <table>
                          <thead>
                            <tr>
                              <th>Lot</th>
                              <th>Recycler</th>
                              <th>Invoice</th>
                              <th className="text-right">MT</th>
                              <th>Lab</th>
                            </tr>
                          </thead>
                          <tbody>
                            {selectedBuyerBatch.alloc.map((a, i) => {
                              const lot = state.lots.find((l) => l.id === a.lot);
                              return (
                                <tr key={i}>
                                  <td className="mono font-semibold">{a.lot}</td>
                                  <td>{lot ? lot.recycler : '—'}</td>
                                  <td className="mono text-xs">{lot ? lot.invoice : '—'}</td>
                                  <td className="mono text-right">{a.mt}</td>
                                  <td>
                                    {lot && lot.lab ? (
                                      <span className="chip chip-ok text-[11px]">✓ On file</span>
                                    ) : (
                                      <span className="chip chip-bad text-[11px]">✗ Missing</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Mandatory Disclaimer Box */}
                    <div className="notice-box warn text-xs">
                      <b>Notice to Buyer:</b> Not a certificate. Repeats what the manufacturer recorded. Ask for original
                      recycler invoice and lab report, and verify EPR certificates on the CPCB portal.
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-[var(--ink-soft)]">No batch selected.</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════════
            TAB 5: AUDIT PACK
            ═══════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'audit' && (
          <div className="tab-pane">
            <div className="flex justify-between items-center mb-4 flex-wrap gap-3">
              <div>
                <h2 className="text-base font-bold text-[var(--ink)]">Recycled Content Audit Pack</h2>
                <p className="text-xs text-[var(--ink-soft)]">
                  Complete reconciliation and batch-by-batch traceability log.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={auditBuyerFilter}
                  onChange={(e) => setAuditBuyerFilter(e.target.value)}
                  className="text-input text-xs mono"
                >
                  <option value="ALL">All Buyers ({batchesWithAlloc.length} batches)</option>
                  {[...new Set(state.batches.map((b) => b.buyer))].map((buyer) => (
                    <option key={buyer} value={buyer}>
                      Buyer: {buyer}
                    </option>
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

            {/* Reconciliation Totals */}
            <div className="grid-4 mb-6">
              <div className="kpi-card">
                <span className="kpi-label">Total Purchased (MT)</span>
                <span className="kpi-value mono">{totalPurchased} MT</span>
              </div>
              <div className="kpi-card">
                <span className="kpi-label">Total Allocated (MT)</span>
                <span className="kpi-value mono text-[var(--steel-deep)]">{totalAllocated} MT</span>
              </div>
              <div className="kpi-card">
                <span className="kpi-label">Ledger Balance (MT)</span>
                <span className="kpi-value mono text-[var(--ok)]">{remainingLedgerBalance} MT</span>
              </div>
              <div className="kpi-card">
                <span className="kpi-label">Batches with Open Gaps</span>
                <span className="kpi-value mono text-[var(--bad)]">
                  {
                    batchesWithAlloc.filter(
                      (b) =>
                        (auditBuyerFilter === 'ALL' || b.buyer === auditBuyerFilter) &&
                        !evaluateReleaseChecks(b).canRelease
                    ).length
                  }
                </span>
              </div>
            </div>

            {/* Traceability Table */}
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
                      <th>Traced Lots</th>
                      <th>Invoices on File</th>
                      <th>Lab Reports on File</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {batchesWithAlloc
                      .filter((b) => auditBuyerFilter === 'ALL' || b.buyer === auditBuyerFilter)
                      .map((b) => {
                        const lotsObj = b.alloc.map((a) => state.lots.find((l) => l.id === a.lot)).filter(Boolean);
                        const allInvs = lotsObj.length > 0 && lotsObj.every((l) => l.inv);
                        const allLabs = lotsObj.length > 0 && lotsObj.every((l) => l.lab);

                        return (
                          <tr key={b.id}>
                            <td className="mono font-semibold">{b.id}</td>
                            <td className="mono text-xs">{b.date}</td>
                            <td>{b.buyer}</td>
                            <td>{b.product}</td>
                            <td className="mono text-right">{b.total}</td>
                            <td className="mono text-right font-semibold">{b.pct}%</td>
                            <td className="mono text-right">{b.needed}</td>
                            <td className="mono text-xs">
                              {b.alloc.map((a) => `${a.lot} (${a.mt})`).join(', ')}
                            </td>
                            <td>
                              {allInvs ? (
                                <span className="chip chip-ok text-xs">✓ Complete</span>
                              ) : (
                                <span className="chip chip-bad text-xs">✗ Missing</span>
                              )}
                            </td>
                            <td>
                              {allLabs ? (
                                <span className="chip chip-ok text-xs">✓ Complete</span>
                              ) : (
                                <span className="chip chip-bad text-xs">✗ Missing</span>
                              )}
                            </td>
                            <td>
                              <span className={`chip ${b.status === 'released' ? 'chip-ok' : 'chip-warn'}`}>
                                {b.status}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>

              {/* Disclaimer */}
              <div className="notice-box warn text-xs mt-4">
                <b>Documentation Note:</b> Replaces days of manual spreadsheet matching for audits. Stores and displays
                what the manufacturer recorded. Ask manufacturer for original tax invoices and accredited laboratory test
                reports. Official EPR credit trading must be validated on the CPCB portal.
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ── 5-Minute Expo Demo Script Modal ─────────────────────────────────── */}
      {showPitchModal && (
        <div className="modal-backdrop" onClick={() => setShowPitchModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center border-b border-[var(--line)] pb-3 mb-4">
              <h2 className="text-base font-bold text-[var(--ink)]">🎤 5-Minute Factory Owner Pitch Guide</h2>
              <button onClick={() => setShowPitchModal(false)} className="text-[var(--ink-soft)] text-lg">
                ✕
              </button>
            </div>
            <div className="space-y-4 text-xs leading-relaxed text-[var(--ink)]">
              <div>
                <b className="text-[var(--steel-deep)] block mb-1">1. Open Dashboard:</b>
                "This is every tonne of recycled material you bought and where it went across your production runs."
              </div>
              <div>
                <b className="text-[var(--steel-deep)] block mb-1">2. Try Logging 40 MT at 50% in Batches:</b>
                "It is instantly refused by the mass-balance check because your balance is short. Your spreadsheet would let that through."
              </div>
              <div>
                <b className="text-[var(--steel-deep)] block mb-1">3. Point to Blocked Batch (BT-2026-002):</b>
                "Notice this batch cannot be released for dispatch because LOT-002 is missing an accredited lab test report."
              </div>
              <div>
                <b className="text-[var(--steel-deep)] block mb-1">4. Go to Material Ledger & Attach Lab File:</b>
                "Attach the lab report. Return to Batches, and the batch immediately unblocks and can be released."
              </div>
              <div>
                <b className="text-[var(--steel-deep)] block mb-1">5. Tap 'Print Pallet Label' & Scan QR:</b>
                "Hand the factory owner your phone to scan the QR code. The clean buyer self-service verification screen opens instantly."
              </div>
              <div>
                <b className="text-[var(--steel-deep)] block mb-1">6. Common Owner Q&A:</b>
                <p className="mt-1">
                  <b>• Does this make us CPCB compliant?</b> No. Your EPR filings remain on the CPCB portal. This tool
                  stores and retrieves your supporting proof.
                </p>
                <p className="mt-1">
                  <b>• Why not Excel?</b> Excel won't block overclaimed mass-balance, won't stop unverified shipments, and
                  can't provide QR pallet self-service for buyers.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Inline Scoped Styles ────────────────────────────────────────────── */}
      <style jsx global>{`
        /* Design System Variables (Section 8) */
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
          font-family: 'IBM Plex Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
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
          font-family: 'IBM Plex Mono', ui-monospace, Menlo, Monaco, Consolas, monospace;
        }

        /* Header */
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
          letter-spacing: 0.01em;
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

        /* Sub-Header */
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

        /* Tabs */
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

        .tab-btn:hover {
          color: var(--ink);
        }

        .tab-btn.active {
          color: var(--steel-deep);
          border-bottom-color: var(--steel-deep);
          font-weight: 600;
        }

        /* Content Container */
        .content-container {
          padding: 24px clamp(16px, 4vw, 36px) 60px;
          max-width: 1200px;
          margin: 0 auto;
        }

        /* Cards */
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

        /* Notices */
        .notice-box {
          border-radius: var(--radius);
          padding: 12px 14px;
          font-size: 0.8rem;
          line-height: 1.5;
          margin-bottom: 20px;
        }

        .notice-box.info {
          background: var(--paper-raised);
          border: 1px solid var(--steel);
          color: var(--ink);
        }

        .notice-box.warn {
          background: var(--amber-soft);
          border: 1px solid var(--amber);
          color: var(--ink);
        }

        /* KPI Cards */
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

        /* Tables */
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

        tr:last-child td {
          border-bottom: none;
        }

        /* Chips */
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

        /* Inputs & Buttons */
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

        .solid-btn:hover {
          opacity: 0.9;
        }

        .ghost-btn {
          background: none;
          color: var(--steel-deep);
          border-color: var(--line);
        }

        .ghost-btn:hover {
          background: var(--paper);
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

        /* Progress Bars */
        .lot-progress-row {
          border-bottom: 1px solid var(--line);
          padding-bottom: 10px;
        }
        .lot-progress-row:last-child {
          border-bottom: none;
          padding-bottom: 0;
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

        /* Alert items */
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

        /* Batch Card */
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

        /* Release Checks */
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

        .inline-qr-box {
          width: 52px;
          height: 52px;
          background: var(--paper);
          border: 1px solid var(--line);
          border-radius: 2px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .action-buttons {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }

        /* Live Preview */
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

        /* Buyer Scan View & QR */
        .qr-big-box {
          padding: 16px;
          background: var(--paper);
          border: 1px dashed var(--line);
          border-radius: var(--radius);
          display: inline-block;
        }

        .field-row {
          display: flex;
          justify-content: space-between;
          border-bottom: 1px solid var(--line);
          padding: 5px 0;
        }

        /* Buyer Mode Page */
        .buyer-container {
          max-width: 720px;
          margin: 30px auto;
          padding: 0 16px;
        }

        .buyer-bar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
          border-bottom: 1px solid var(--line);
          padding-bottom: 12px;
        }

        .buyer-title {
          font-size: 0.95rem;
          font-weight: 700;
          display: block;
          color: var(--ink);
        }

        .buyer-sub {
          font-size: 0.75rem;
          color: var(--ink-soft);
        }

        /* Toast */
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

        /* Modal */
        .modal-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.55);
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
          max-width: 620px;
          width: 100%;
          max-height: 85vh;
          overflow-y: auto;
          padding: 22px;
        }

        /* Printable Pallet Label (Section 7) */
        .printable-pallet-sticker {
          display: none;
        }

        @media print {
          body,
          html,
          .batchtrace-root {
            background: #ffffff !important;
            color: #000000 !important;
          }

          .main-header,
          .sub-header,
          .tab-nav,
          .content-container,
          .toast-pill,
          .modal-backdrop,
          .buyer-bar button {
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
            font-family: 'IBM Plex Sans', sans-serif;
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

          .pallet-header h3 {
            font-size: 14pt;
            font-weight: bold;
            margin: 0;
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

          .pallet-label {
            color: #444444;
          }

          .pallet-val {
            font-weight: 600;
          }

          .pallet-qr canvas {
            width: 160px !important;
            height: 160px !important;
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

// ── Inline Batch QR Canvas Component ─────────────────────────────────────────
function BatchInlineQrCanvas({ batch, getQrUrl }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current || !window.QRCode) return;
    const url = getQrUrl(batch);
    window.QRCode.toCanvas(
      canvasRef.current,
      url,
      {
        width: 48,
        margin: 0,
        color: { dark: '#1B2A3A', light: '#00000000' },
      },
      (err) => {
        if (err) console.error(err);
      }
    );
  }, [batch, getQrUrl]);

  return <canvas ref={canvasRef} width="48" height="48" />;
}

// ── Buyer Big QR Canvas Component ────────────────────────────────────────────
function BuyerBigQrCanvas({ batch, getQrUrl }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current || !window.QRCode) return;
    const url = getQrUrl(batch);
    window.QRCode.toCanvas(
      canvasRef.current,
      url,
      {
        width: 180,
        margin: 1,
        color: { dark: '#1B2A3A', light: '#00000000' },
      },
      (err) => {
        if (err) console.error(err);
      }
    );
  }, [batch, getQrUrl]);

  return <canvas ref={canvasRef} width="180" height="180" />;
}

// ── Pallet Printable QR Canvas Component ─────────────────────────────────────
function PalletQrCanvas({ batch, getQrUrl }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current || !window.QRCode) return;
    const url = getQrUrl(batch);
    window.QRCode.toCanvas(
      canvasRef.current,
      url,
      {
        width: 160,
        margin: 1,
        color: { dark: '#000000', light: '#ffffff' },
      },
      (err) => {
        if (err) console.error(err);
      }
    );
  }, [batch, getQrUrl]);

  return <canvas ref={canvasRef} width="160" height="160" />;
}
