import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import * as XLSX from 'xlsx';
import {
    importUsers,
    importPartnerUsers,
    getImportTemplate,
    getPartnerImportTemplate,
} from '../../service/businessAdminServices';

// ─── Constants ────────────────────────────────────────────────────────────────

const EMPLOYEE_ROW_ERRORS = {
    MISSING_REQUIRED_FIELD: 'Thiếu trường bắt buộc',
    INVALID_EMAIL: 'Email không đúng định dạng',
    DUPLICATE_IN_FILE: 'Trùng lặp trong tệp',
    EMAIL_ALREADY_EXISTS: 'Email đã tồn tại trong hệ thống',
    EMPLOYEE_CODE_ALREADY_EXISTS: 'Mã nhân viên đã tồn tại',
    DEPARTMENT_NOT_FOUND: 'Không tìm thấy phòng ban',
    ROLE_NOT_FOUND: 'Không tìm thấy vai trò',
    MANAGER_NOT_FOUND: 'Không tìm thấy quản lý trực tiếp',
};

const PARTNER_ROW_ERRORS = {
    ...EMPLOYEE_ROW_ERRORS,
    MISSING_PHOTO: 'Thiếu ảnh sinh trắc học (bắt buộc)',
    ACCOUNT_EXPIRES_AT_MUST_BE_FUTURE: 'Ngày hết hạn phải ở tương lai',
    INVALID_DATE: 'Ngày hết hạn không đúng định dạng',
};

const BIOMETRIC_STATUS = {
    not_provided:  { label: 'Chưa có ảnh', color: 'bg-slate-100 text-slate-500' },
    pending_commit:{ label: 'Chờ xác nhận', color: 'bg-amber-50 text-amber-700' },
    attached:      { label: 'Đã đính kèm', color: 'bg-emerald-50 text-emerald-700' },
    role_exempt:   { label: 'Không cần sinh trắc', color: 'bg-slate-100 text-slate-500' },
    invalid_image: { label: 'Ảnh không hợp lệ', color: 'bg-red-50 text-red-600' },
    file_too_large:{ label: 'Ảnh quá 5 MB', color: 'bg-red-50 text-red-600' },
    upload_failed: { label: 'Lỗi upload (tài khoản vẫn tạo)', color: 'bg-red-50 text-red-600' },
};

const VEHICLE_PLATE_STATUS = {
    pending_commit: { label: 'Hợp lệ, chờ xác nhận', color: 'bg-amber-50 text-amber-700' },
    attached:       { label: 'Đã đăng ký biển số', color: 'bg-blue-50 text-action-blue' },
    invalid_plate:  { label: 'Sai định dạng biển số', color: 'bg-red-50 text-red-600' },
    duplicate_plate:{ label: 'Biển số đã tồn tại', color: 'bg-orange-50 text-orange-600' },
    attach_failed:  { label: 'Lỗi đăng ký biển số', color: 'bg-red-50 text-red-600' },
};

// ─── Sub-components ───────────────────────────────────────────────────────────

/** File drop zone */
const DropZone = ({ file, onFile, accept, disabled, id }) => {
    const [dragging, setDragging] = useState(false);
    const handleDrop = (e) => {
        e.preventDefault();
        setDragging(false);
        if (disabled) return;
        const f = e.dataTransfer.files?.[0];
        if (f) onFile(f);
    };
    return (
        <div
            onDragOver={(e) => { e.preventDefault(); if (!disabled) setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-2xl px-5 py-6 text-center transition-all
                ${disabled ? 'opacity-60 pointer-events-none bg-cloud-mist/20' : 'cursor-pointer'}
                ${dragging ? 'border-action-blue bg-blue-50/50' : file ? 'border-emerald-400 bg-emerald-50/30' : 'border-platinum-tint hover:border-action-blue'}`}
        >
            <input type="file" accept={accept} disabled={disabled} id={id} className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
            <label htmlFor={id} className={disabled ? 'cursor-not-allowed' : 'cursor-pointer'}>
                {file ? (
                    <div className="flex items-center justify-center gap-3">
                        <svg className="w-6 h-6 text-emerald-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <div className="text-left">
                            <p className="text-sm font-bold text-midnight-indigo leading-tight">{file.name}</p>
                            <p className="text-[11px] text-slate-blue mt-0.5">{(file.size / 1024).toFixed(1)} KB</p>
                        </div>
                    </div>
                ) : (
                    <div>
                        <svg className="w-8 h-8 mx-auto mb-2 text-steel-gray" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        <p className="text-sm font-semibold text-midnight-indigo">Nhấp hoặc kéo thả tệp vào đây</p>
                        <p className="text-[11px] text-slate-blue mt-1">{accept}</p>
                    </div>
                )}
            </label>
        </div>
    );
};

/** Compact validation errors table */
const ValidationTable = ({ rows, errorMap }) => {
    if (!rows.length) return null;
    return (
        <div className="rounded-xl border border-red-200 overflow-hidden">
            <div className="bg-red-50 px-3 py-2 flex items-center gap-2 border-b border-red-200">
                <svg className="w-3.5 h-3.5 text-red-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
                <span className="text-xs font-bold text-red-700">{rows.length} dòng có lỗi</span>
            </div>
            <div className="max-h-44 overflow-y-auto divide-y divide-red-100">
                {rows.map((err, i) => (
                    <div key={i} className="flex items-center gap-2 px-3 py-2 text-xs bg-white">
                        <span className="shrink-0 font-bold text-red-600 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded text-[10px] font-mono">
                            Dòng {err.row}
                        </span>
                        <span className="flex-1 text-slate-blue font-mono truncate text-[10px]">{err.email || '—'}</span>
                        <span className="text-red-700 font-medium text-right">
                            {errorMap[err.reason] || err.reason || 'Lỗi không xác định'}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
};

/** Photo matching summary card — used by both tabs */
const PhotoMatchCard = ({ matched, unmatched, missing, isRequired, keyLabel }) => {
    const [expanded, setExpanded] = useState(false);
    const hasIssues = unmatched.length > 0 || missing.length > 0;
    if (!hasIssues && matched === 0) return null;

    return (
        <div className={`rounded-xl border overflow-hidden text-xs ${hasIssues ? (isRequired && missing.length > 0 ? 'border-red-200' : 'border-amber-200') : 'border-emerald-200'}`}>
            {/* Summary bar */}
            <button
                type="button"
                onClick={() => hasIssues && setExpanded(v => !v)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-left
                    ${hasIssues ? (isRequired && missing.length > 0 ? 'bg-red-50' : 'bg-amber-50') : 'bg-emerald-50'}
                    ${hasIssues ? 'cursor-pointer' : 'cursor-default'}`}
            >
                <span className="font-bold text-midnight-indigo shrink-0">Ghép ảnh</span>
                <div className="flex items-center gap-2 flex-wrap flex-1">
                    {matched > 0 && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-semibold text-[10px]">
                            ✓ {matched} khớp
                        </span>
                    )}
                    {unmatched.length > 0 && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-semibold text-[10px]">
                            ✗ {unmatched.length} ảnh không tìm thấy trong Excel
                        </span>
                    )}
                    {missing.length > 0 && (
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-semibold text-[10px]
                            ${isRequired ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'}`}>
                            {isRequired ? '⛔' : '⚠'} {missing.length} người chưa có ảnh{isRequired ? ' — sẽ bị từ chối' : ''}
                        </span>
                    )}
                </div>
                {hasIssues && (
                    <svg className={`w-3.5 h-3.5 text-slate-blue shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`}
                        fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                    </svg>
                )}
            </button>

            {/* Expandable detail */}
            {expanded && hasIssues && (
                <div className="px-3 py-2.5 bg-white space-y-2.5 border-t border-inherit">
                    {unmatched.length > 0 && (
                        <div>
                            <p className="text-[10px] font-bold text-amber-700 mb-1.5">
                                Ảnh không khớp {keyLabel} nào trong Excel — sẽ bị bỏ qua khi nộp:
                            </p>
                            <div className="flex flex-wrap gap-1">
                                {unmatched.map((n, i) => (
                                    <span key={i} className="font-mono text-[10px] bg-amber-50 text-amber-800 border border-amber-200 px-1.5 py-0.5 rounded line-through">
                                        {n}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}
                    {missing.length > 0 && (
                        <div>
                            <p className={`text-[10px] font-bold mb-1.5 ${isRequired ? 'text-red-700' : 'text-slate-600'}`}>
                                {isRequired
                                    ? `Bắt buộc có ảnh — ${missing.length} dòng này sẽ bị từ chối:`
                                    : `Chưa có ảnh ghép — vẫn tạo tài khoản, chưa kích hoạt FaceGate:`}
                            </p>
                            <div className="flex flex-wrap gap-1">
                                {missing.map((c, i) => (
                                    <span key={i} className={`font-mono text-[10px] border px-1.5 py-0.5 rounded
                                        ${isRequired ? 'bg-red-50 text-red-700 border-red-200' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                                        {c}
                                    </span>
                                ))}
                            </div>
                            {isRequired && (
                                <p className="text-[10px] text-red-500 mt-1.5">
                                    Đặt tên ảnh = địa chỉ email (ví dụ: <code className="bg-red-50 px-0.5 rounded">{missing[0]}.jpg</code>)
                                </p>
                            )}
                            {!isRequired && (
                                <p className="text-[10px] text-slate-500 mt-1.5">
                                    Đặt tên ảnh = {keyLabel} (ví dụ: <code className="bg-slate-50 px-0.5 rounded">{missing[0]}.jpg</code>)
                                </p>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

/** BE biometric/plate result rows */
const ResultRows = ({ results, statusMap, title }) => {
    const statusKey = title.includes('sinh trắc') ? 'biometricStatus' : 'vehiclePlateStatus';
    const relevant = results.filter(r => r[statusKey]);
    if (!relevant.length) return null;
    return (
        <div className="rounded-xl border border-platinum-tint overflow-hidden">
            <div className="bg-cloud-mist/50 px-3 py-2 border-b border-platinum-tint">
                <span className="text-[10px] font-bold text-slate-blue uppercase tracking-wide">{title}</span>
            </div>
            <div className="max-h-40 overflow-y-auto divide-y divide-platinum-tint/60">
                {relevant.map((r, i) => {
                    const meta = statusMap[r[statusKey]] || { label: r[statusKey], color: 'bg-slate-100 text-slate-500' };
                    return (
                        <div key={i} className="flex items-center gap-2 px-3 py-2 text-[11px] bg-white">
                            <span className="shrink-0 font-mono font-bold text-[10px] text-midnight-indigo bg-white border border-platinum-tint px-1.5 py-0.5 rounded">
                                Dòng {r.row}
                            </span>
                            <span className="flex-1 font-mono text-slate-blue truncate">{r.email}</span>
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold ${meta.color}`}>
                                {meta.label}
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

// ─── Shared step indicator ────────────────────────────────────────────────────

const StepBar = ({ step }) => (
    <div className="flex items-center gap-1.5 text-[10px] font-bold">
        {['Xác thực', 'Xác nhận', 'Hoàn tất'].map((label, i) => {
            const s = i + 1;
            const active = step === s;
            const done = step > s;
            return (
                <div key={s} className="flex items-center gap-1.5">
                    {i > 0 && <div className={`h-px w-6 ${done || active ? 'bg-action-blue' : 'bg-platinum-tint'}`} />}
                    <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full border
                        ${active ? 'bg-action-blue text-white border-action-blue'
                            : done ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                            : 'bg-white text-steel-gray border-platinum-tint'}`}>
                        {done ? '✓ ' : `${s}. `}{label}
                    </div>
                </div>
            );
        })}
    </div>
);

// ─── Employee Tab ─────────────────────────────────────────────────────────────

const EmployeeTab = ({ onSuccess }) => {
    const [file, setFile] = useState(null);
    const [photos, setPhotos] = useState([]);
    const [zip, setZip] = useState(null);
    const [consent, setConsent] = useState(false);
    const [step, setStep] = useState(1);
    const [submitting, setSubmitting] = useState(false);
    const [validationErrors, setValidationErrors] = useState([]);
    const [results, setResults] = useState([]);
    const [banner, setBanner] = useState(null); // { type: 'success'|'error', text }
    const [excelCodes, setExcelCodes] = useState([]);
    const [unmatched, setUnmatched] = useState([]);
    const [missing, setMissing] = useState([]);

    const reset = () => {
        setFile(null); setPhotos([]); setZip(null); setConsent(false);
        setStep(1); setValidationErrors([]); setResults([]);
        setBanner(null); setExcelCodes([]); setUnmatched([]); setMissing([]);
    };

    const parseExcel = useCallback((f) => {
        if (!f) { setExcelCodes([]); return; }
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const wb = XLSX.read(e.target.result, { type: 'array' });
                const ws = wb.Sheets[wb.SheetNames[0]];
                const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
                if (rows.length < 2) { setExcelCodes([]); return; }
                const hdrs = rows[0].map(h => String(h).trim().toLowerCase());
                const idx = hdrs.indexOf('employee_code');
                if (idx === -1) { setExcelCodes([]); return; }
                setExcelCodes(rows.slice(1).map(r => String(r[idx] || '').trim()).filter(Boolean));
            } catch { setExcelCodes([]); }
        };
        reader.readAsArrayBuffer(f);
    }, []);

    useEffect(() => {
        if (!photos.length && !excelCodes.length) { setUnmatched([]); setMissing([]); return; }
        if (!photos.length) { setUnmatched([]); setMissing([]); return; }
        const bases = photos.map(f => f.name.replace(/\.[^.]+$/, '').toLowerCase());
        const codeSet = new Set(excelCodes.map(c => c.toLowerCase()));
        const photoSet = new Set(bases);
        setUnmatched(bases.filter(n => !codeSet.has(n)));
        setMissing(excelCodes.filter(c => !photoSet.has(c.toLowerCase())));
    }, [photos, excelCodes]);

    const matchedCount = photos.length - unmatched.length;

    const handleDownload = async () => {
        try {
            const res = await getImportTemplate();
            if (!res?.isBlob) throw new Error();
            const url = URL.createObjectURL(res.data);
            const a = document.createElement('a');
            a.href = url; a.download = 'NhanVien_Import_Template.xlsx';
            document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
        } catch {
            const csv = 'full_name,email,department_code,role_codes,employee_code,phone_number,position_title,direct_manager_email,license_plate\n';
            const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = 'NhanVien_Import_Template.csv';
            document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!file) return;
        setSubmitting(true);
        setBanner(null);
        if (step === 1) { setValidationErrors([]); setResults([]); }
        try {
            const fd = new FormData();
            fd.append('file', file);
            fd.append('commit', step === 2 ? 'true' : 'false');
            const codeSet = new Set(excelCodes.map(c => c.toLowerCase()));
            const photosToSend = excelCodes.length > 0
                ? photos.filter(f => codeSet.has(f.name.replace(/\.[^.]+$/, '').toLowerCase()))
                : photos;
            photosToSend.forEach(p => fd.append('photos', p, p.name));
            if (zip) fd.append('photosZip', zip, zip.name);
            if (photos.length > 0 || zip) fd.append('biometricConsentConfirmed', 'true');

            const res = await importUsers(fd);
            if (res?.success && res.data) {
                const report = res.data;
                const allRows = report.results || [];
                const failed = allRows.filter(r => r.status === 'failed' || r.status === 'invalid');
                setValidationErrors(failed);
                setResults(allRows);
                if (step === 1) {
                    setBanner(failed.length
                        ? { type: 'warn', text: `Xác thực xong — ${failed.length} dòng có lỗi, ${report.validCount ?? 0} dòng hợp lệ.` }
                        : { type: 'success', text: `Xác thực thành công — ${report.validCount ?? 0} tài khoản hợp lệ, sẵn sàng nhập.` });
                    setStep(2);
                } else {
                    const created = report.successCount ?? 0;
                    setBanner(
                        created === 0 && failed.length > 0
                            ? { type: 'error', text: `Không tạo được tài khoản nào — cả ${failed.length} dòng đều lỗi. Xem chi tiết bên dưới.` }
                            : failed.length > 0
                                ? { type: 'warn', text: `Đã tạo ${created}/${report.totalRows ?? 0} tài khoản. Bỏ qua ${failed.length} dòng lỗi.` }
                                : { type: 'success', text: `Đã tạo ${created}/${report.totalRows ?? 0} tài khoản.` },
                    );
                    setStep(3);
                    onSuccess();
                }
            } else {
                setBanner({ type: 'error', text: res?.message || 'Tệp không hợp lệ. Kiểm tra lại định dạng.' });
                setStep(1);
            }
        } catch (err) {
            setBanner({ type: 'error', text: err?.message || 'Lỗi kết nối. Vui lòng thử lại.' });
            setStep(1);
        } finally {
            setSubmitting(false);
        }
    };

    const hasPhotos = photos.length > 0 || !!zip;

    return (
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
            {/* Template download */}
            <div className="flex items-center justify-between bg-blue-50/60 border border-action-blue/20 px-4 py-2.5 rounded-xl">
                <span className="text-xs font-medium text-midnight-indigo">Cần file mẫu đúng chuẩn?</span>
                <button type="button" onClick={handleDownload}
                    className="text-xs font-bold text-action-blue hover:underline flex items-center gap-1">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Tải file mẫu
                </button>
            </div>

            {/* Step indicator */}
            <StepBar step={step} />

            {/* Banner */}
            {banner && (
                <div className={`flex items-start gap-2 px-3 py-2.5 rounded-xl text-xs font-medium border
                    ${banner.type === 'success' ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : banner.type === 'warn' ? 'bg-amber-50 text-amber-800 border-amber-200'
                    : 'bg-red-50 text-red-700 border-red-200'}`}>
                    <span className="text-base leading-none">
                        {banner.type === 'success' ? '✓' : banner.type === 'warn' ? '⚠' : '✗'}
                    </span>
                    {banner.text}
                </div>
            )}

            {/* Excel file */}
            <div>
                <label className="block text-xs font-bold text-midnight-indigo mb-1.5">
                    File Excel nhân viên <span className="text-red-500">*</span>
                    <span className="ml-1.5 font-normal text-steel-gray">.xlsx · .xls · .csv</span>
                </label>
                <DropZone
                    file={file} id="emp-excel"
                    accept=".xlsx,.xls,.csv"
                    disabled={step > 1}
                    onFile={(f) => { setFile(f); parseExcel(f); setValidationErrors([]); setResults([]); setStep(1); setBanner(null); }}
                />
                {step > 1 && file && (
                    <button type="button" onClick={reset}
                        className="mt-1.5 text-[10px] text-action-blue hover:underline font-semibold">
                        ← Chọn file khác (làm mới)
                    </button>
                )}
            </div>

            {/* Photos — optional */}
            <div className="border border-platinum-tint rounded-2xl p-4 space-y-3 bg-cloud-mist/10">
                <div className="flex items-start justify-between gap-2">
                    <div>
                        <p className="text-xs font-bold text-midnight-indigo">
                            Ảnh sinh trắc học
                            <span className="ml-1.5 text-[10px] font-semibold text-steel-gray bg-slate-100 px-1.5 py-0.5 rounded-full">Tùy chọn</span>
                        </p>
                        <p className="text-[10px] text-slate-blue mt-1 leading-relaxed">
                            Tên file = <strong>employee_code</strong> — ví dụ <code className="bg-slate-100 px-1 rounded">EMP001.jpg</code>
                        </p>
                    </div>
                    {hasPhotos && (
                        <button type="button" onClick={() => { setPhotos([]); setZip(null); setResults([]); }}
                            className="text-[10px] text-red-400 hover:text-red-600 font-semibold shrink-0">
                            Xóa ảnh
                        </button>
                    )}
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                    <input type="file" multiple accept="image/jpeg,image/png,image/webp"
                        id="emp-photos" className="hidden"
                        onChange={(e) => { setPhotos(Array.from(e.target.files || [])); setResults([]); }} />
                    <label htmlFor="emp-photos"
                        className="inline-flex items-center px-3 py-1.5 border border-platinum-tint bg-white text-xs font-semibold text-slate-blue hover:border-action-blue hover:text-action-blue rounded-lg cursor-pointer transition-colors">
                        Chọn ảnh rời
                        {photos.length > 0 && <span className="ml-1.5 bg-action-blue text-white rounded-full px-1.5 text-[10px]">{photos.length}</span>}
                    </label>
                    <span className="text-[10px] text-steel-gray">hoặc</span>
                    <input type="file" accept=".zip" id="emp-zip" className="hidden"
                        onChange={(e) => { setZip(e.target.files[0] || null); setResults([]); }} />
                    <label htmlFor="emp-zip"
                        className={`inline-flex items-center gap-1 px-3 py-1.5 border bg-white text-xs font-semibold rounded-lg cursor-pointer transition-colors
                            ${zip ? 'border-action-blue text-action-blue' : 'border-platinum-tint text-slate-blue hover:border-action-blue hover:text-action-blue'}`}>
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8l1 12a2 2 0 002 2h8a2 2 0 002-2L19 8" />
                        </svg>
                        {zip ? zip.name : 'Nộp file .zip'}
                        {zip && <span className="ml-1 text-[10px] text-slate-blue">({(zip.size/1024/1024).toFixed(1)} MB)</span>}
                    </label>
                </div>

                {/* Photo match summary */}
                {(photos.length > 0) && excelCodes.length > 0 && (
                    <PhotoMatchCard
                        matched={matchedCount}
                        unmatched={unmatched}
                        missing={missing}
                        isRequired={false}
                        keyLabel="employee_code"
                    />
                )}

                {/* Consent */}
                {hasPhotos && (
                    <label className="flex items-start gap-2 text-xs text-midnight-indigo font-medium cursor-pointer pt-2 border-t border-platinum-tint/60">
                        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)}
                            className="mt-0.5 rounded text-action-blue focus:ring-action-blue" />
                        <span>Tôi xác nhận đã có sự đồng ý của nhân viên cho việc dùng ảnh vào mục đích sinh trắc học (FaceGate).</span>
                    </label>
                )}
            </div>

            {/* Validation errors from BE */}
            {validationErrors.length > 0 && (
                <ValidationTable rows={validationErrors} errorMap={EMPLOYEE_ROW_ERRORS} />
            )}

            {/* Biometric results */}
            {results.some(r => r.biometricStatus) && (
                <ResultRows results={results} statusMap={BIOMETRIC_STATUS} title="Kết quả đính kèm ảnh sinh trắc học" />
            )}
            {results.some(r => r.vehiclePlateStatus) && (
                <ResultRows results={results} statusMap={VEHICLE_PLATE_STATUS} title="Kết quả đăng ký biển số xe" />
            )}

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-3 border-t border-platinum-tint">
                {step < 3 && (
                    <button type="submit"
                        disabled={!file || submitting || (hasPhotos && !consent)}
                        className={`px-5 py-2 text-white rounded-xl text-sm font-bold shadow-sm transition-all disabled:opacity-50 active:scale-95
                            ${step === 2 && validationErrors.length > 0 ? 'bg-amber-500 hover:bg-amber-600' : 'bg-action-blue hover:bg-glacier-blue'}`}>
                        {submitting
                            ? (step === 1 ? 'Đang xác thực...' : 'Đang nhập...')
                            : step === 1 ? 'Xác thực file'
                            : validationErrors.length > 0 ? `Bỏ qua ${validationErrors.length} lỗi & Nhập`
                            : 'Xác nhận nhập'}
                    </button>
                )}
                {step === 3 && (
                    <button type="button" onClick={reset}
                        className="px-5 py-2 bg-cloud-mist hover:bg-platinum-tint text-midnight-indigo rounded-xl text-sm font-bold transition-all">
                        Nhập thêm
                    </button>
                )}
            </div>
        </form>
    );
};

// ─── Partner Tab ──────────────────────────────────────────────────────────────

const PartnerTab = ({ onSuccess }) => {
    const [file, setFile] = useState(null);
    const [photos, setPhotos] = useState([]);
    const [zip, setZip] = useState(null);
    const [consent, setConsent] = useState(false);
    const [step, setStep] = useState(1);
    const [submitting, setSubmitting] = useState(false);
    const [validationErrors, setValidationErrors] = useState([]);
    const [results, setResults] = useState([]);
    const [banner, setBanner] = useState(null);
    const [excelEmails, setExcelEmails] = useState([]);
    const [unmatched, setUnmatched] = useState([]);
    const [missing, setMissing] = useState([]);
    const [defaultExpiry, setDefaultExpiry] = useState('');

    const today = new Date().toISOString().slice(0, 10);

    const reset = () => {
        setFile(null); setPhotos([]); setZip(null); setConsent(false);
        setStep(1); setValidationErrors([]); setResults([]);
        setBanner(null); setExcelEmails([]); setUnmatched([]); setMissing([]);
    };

    const parseExcel = useCallback((f) => {
        if (!f) { setExcelEmails([]); return; }
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const wb = XLSX.read(e.target.result, { type: 'array' });
                const ws = wb.Sheets[wb.SheetNames[0]];
                const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
                if (rows.length < 2) { setExcelEmails([]); return; }
                const hdrs = rows[0].map(h => String(h).trim().toLowerCase());
                const idx = hdrs.indexOf('email');
                if (idx === -1) { setExcelEmails([]); return; }
                setExcelEmails(rows.slice(1).map(r => String(r[idx] || '').trim().toLowerCase()).filter(Boolean));
            } catch { setExcelEmails([]); }
        };
        reader.readAsArrayBuffer(f);
    }, []);

    useEffect(() => {
        if (!photos.length) { setUnmatched([]); setMissing([]); return; }
        const bases = photos.map(f => f.name.replace(/\.[^.]+$/, '').toLowerCase());
        const emailSet = new Set(excelEmails);
        const photoSet = new Set(bases);
        setUnmatched(bases.filter(n => !emailSet.has(n)));
        setMissing(excelEmails.filter(em => !photoSet.has(em)));
    }, [photos, excelEmails]);

    const matchedCount = photos.length - unmatched.length;
    const hasPhotos = photos.length > 0 || !!zip;

    // Partner: photos are required → block if there are missing emails and photos are provided but incomplete
    const photoBlocksSubmit = !zip && excelEmails.length > 0 && missing.length > 0 && photos.length > 0;

    const handleDownload = async () => {
        try {
            const res = await getPartnerImportTemplate();
            if (!res?.isBlob) throw new Error();
            const url = URL.createObjectURL(res.data);
            const a = document.createElement('a');
            a.href = url; a.download = 'DoiTac_Import_Template.xlsx';
            document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
        } catch {
            const csv = 'full_name,email,account_expires_at,note\n';
            const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = 'DoiTac_Import_Template.csv';
            document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!file) return;
        setSubmitting(true);
        setBanner(null);
        if (step === 1) { setValidationErrors([]); setResults([]); }
        try {
            const fd = new FormData();
            fd.append('file', file);
            fd.append('commit', step === 2 ? 'true' : 'false');
            if (defaultExpiry) fd.append('defaultExpiresAt', defaultExpiry);
            photos.forEach(p => fd.append('photos', p, p.name));
            if (zip) fd.append('photosZip', zip, zip.name);
            if (hasPhotos) fd.append('biometricConsentConfirmed', 'true');

            const res = await importPartnerUsers(fd);
            if (res?.success && res.data) {
                const report = res.data;
                const allRows = report.results || [];
                const failed = allRows.filter(r => r.status === 'failed' || r.status === 'invalid');
                setValidationErrors(failed);
                setResults(allRows);
                if (step === 1) {
                    setBanner(failed.length
                        ? { type: 'warn', text: `Xác thực xong — ${failed.length} dòng có lỗi, ${report.validCount ?? 0} dòng hợp lệ.` }
                        : { type: 'success', text: `Xác thực thành công — ${report.validCount ?? 0} tài khoản đối tác hợp lệ.` });
                    setStep(2);
                } else {
                    const created = report.successCount ?? 0;
                    setBanner(
                        created === 0 && failed.length > 0
                            ? { type: 'error', text: `Không tạo được tài khoản đối tác nào — cả ${failed.length} dòng đều lỗi. Xem chi tiết bên dưới.` }
                            : failed.length > 0
                                ? { type: 'warn', text: `Đã tạo ${created}/${report.totalRows ?? 0} tài khoản đối tác. Bỏ qua ${failed.length} dòng lỗi.` }
                                : { type: 'success', text: `Đã tạo ${created}/${report.totalRows ?? 0} tài khoản đối tác.` },
                    );
                    setStep(3);
                    onSuccess();
                }
            } else {
                const msg = res?.message || '';
                const isNotReady = msg.includes('404') || msg.includes('not found') || res?.statusCode === 404;
                setBanner({
                    type: 'error',
                    text: isNotReady
                        ? 'Tính năng import đối tác đang được chuẩn bị — endpoint BE chưa sẵn sàng.'
                        : msg || 'Tệp không hợp lệ. Kiểm tra lại định dạng.',
                });
                setStep(1);
            }
        } catch (err) {
            const isNotReady = err?.status === 404 || err?.message?.includes('404');
            setBanner({
                type: 'error',
                text: isNotReady
                    ? 'Tính năng import đối tác đang được chuẩn bị — endpoint BE chưa sẵn sàng.'
                    : err?.message || 'Lỗi kết nối. Vui lòng thử lại.',
            });
            setStep(1);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
            {/* Info banner */}
            <div className="flex items-start gap-2 bg-purple-50/70 border border-purple-200 px-4 py-3 rounded-xl">
                <svg className="w-4 h-4 text-purple-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 100 20A10 10 0 0012 2z" />
                </svg>
                <div className="text-xs text-purple-800 space-y-0.5">
                    <p className="font-bold">Tài khoản đối tác / khách hàng tạm thời</p>
                    <p className="font-normal text-purple-700">Mỗi tài khoản có thời hạn rõ ràng. <strong>Ảnh sinh trắc học là bắt buộc</strong> — dòng thiếu ảnh sẽ bị từ chối.</p>
                </div>
            </div>

            {/* Template + step */}
            <div className="flex items-center justify-between">
                <StepBar step={step} />
                <button type="button" onClick={handleDownload}
                    className="text-xs font-bold text-action-blue hover:underline flex items-center gap-1">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    File mẫu
                </button>
            </div>

            {/* Banner */}
            {banner && (
                <div className={`flex items-start gap-2 px-3 py-2.5 rounded-xl text-xs font-medium border
                    ${banner.type === 'success' ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : banner.type === 'warn' ? 'bg-amber-50 text-amber-800 border-amber-200'
                    : 'bg-red-50 text-red-700 border-red-200'}`}>
                    <span className="text-base leading-none">
                        {banner.type === 'success' ? '✓' : banner.type === 'warn' ? '⚠' : '✗'}
                    </span>
                    {banner.text}
                </div>
            )}

            {/* Default expiry */}
            <div>
                <label className="block text-xs font-bold text-midnight-indigo mb-1.5">
                    Ngày hết hạn mặc định cho cả batch
                    <span className="ml-1.5 font-normal text-steel-gray text-[10px]">(áp dụng cho dòng không ghi cột account_expires_at)</span>
                </label>
                <input type="date" value={defaultExpiry} min={today}
                    onChange={(e) => setDefaultExpiry(e.target.value)}
                    className="px-3 py-2 border border-platinum-tint rounded-xl text-sm focus:outline-none focus:border-action-blue w-52"
                />
            </div>

            {/* Excel file */}
            <div>
                <label className="block text-xs font-bold text-midnight-indigo mb-1.5">
                    File Excel đối tác <span className="text-red-500">*</span>
                    <span className="ml-1.5 font-normal text-steel-gray">.xlsx · .xls · .csv — cột: full_name, email, account_expires_at</span>
                </label>
                <DropZone
                    file={file} id="partner-excel"
                    accept=".xlsx,.xls,.csv"
                    disabled={step > 1}
                    onFile={(f) => { setFile(f); parseExcel(f); setValidationErrors([]); setResults([]); setStep(1); setBanner(null); }}
                />
                {step > 1 && (
                    <button type="button" onClick={reset}
                        className="mt-1.5 text-[10px] text-action-blue hover:underline font-semibold">
                        ← Chọn file khác (làm mới)
                    </button>
                )}
            </div>

            {/* Photos — REQUIRED */}
            <div className="border border-red-200/60 rounded-2xl p-4 space-y-3 bg-red-50/20">
                <div className="flex items-start justify-between gap-2">
                    <div>
                        <p className="text-xs font-bold text-midnight-indigo flex items-center gap-1.5">
                            Ảnh sinh trắc học
                            <span className="text-[10px] font-bold text-red-600 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-full">Bắt buộc</span>
                        </p>
                        <p className="text-[10px] text-slate-blue mt-1 leading-relaxed">
                            Tên file = <strong>địa chỉ email</strong> của đối tác — ví dụ <code className="bg-slate-100 px-1 rounded">khach@doitac.com.jpg</code>
                        </p>
                    </div>
                    {hasPhotos && (
                        <button type="button" onClick={() => { setPhotos([]); setZip(null); setResults([]); }}
                            className="text-[10px] text-red-400 hover:text-red-600 font-semibold shrink-0">
                            Xóa ảnh
                        </button>
                    )}
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                    <input type="file" multiple accept="image/jpeg,image/png,image/webp"
                        id="partner-photos" className="hidden"
                        onChange={(e) => { setPhotos(Array.from(e.target.files || [])); setResults([]); }} />
                    <label htmlFor="partner-photos"
                        className="inline-flex items-center px-3 py-1.5 border border-platinum-tint bg-white text-xs font-semibold text-slate-blue hover:border-action-blue hover:text-action-blue rounded-lg cursor-pointer transition-colors">
                        Chọn ảnh rời
                        {photos.length > 0 && <span className="ml-1.5 bg-action-blue text-white rounded-full px-1.5 text-[10px]">{photos.length}</span>}
                    </label>
                    <span className="text-[10px] text-steel-gray">hoặc</span>
                    <input type="file" accept=".zip" id="partner-zip" className="hidden"
                        onChange={(e) => { setZip(e.target.files[0] || null); setResults([]); }} />
                    <label htmlFor="partner-zip"
                        className={`inline-flex items-center gap-1 px-3 py-1.5 border bg-white text-xs font-semibold rounded-lg cursor-pointer transition-colors
                            ${zip ? 'border-action-blue text-action-blue' : 'border-platinum-tint text-slate-blue hover:border-action-blue hover:text-action-blue'}`}>
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8l1 12a2 2 0 002 2h8a2 2 0 002-2L19 8" />
                        </svg>
                        {zip ? zip.name : 'Nộp file .zip'}
                        {zip && <span className="ml-1 text-[10px] text-slate-blue">({(zip.size/1024/1024).toFixed(1)} MB)</span>}
                    </label>
                </div>

                {/* Photo match — partner: missing is blocking */}
                {photos.length > 0 && excelEmails.length > 0 && (
                    <PhotoMatchCard
                        matched={matchedCount}
                        unmatched={unmatched}
                        missing={missing}
                        isRequired={true}
                        keyLabel="email"
                    />
                )}

                {/* No photos at all — warn */}
                {!hasPhotos && file && excelEmails.length > 0 && (
                    <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700 font-medium">
                        <span>⛔</span> Chưa nộp ảnh — tất cả {excelEmails.length} dòng sẽ bị từ chối khi xác thực.
                    </div>
                )}

                {/* Consent */}
                {hasPhotos && (
                    <label className="flex items-start gap-2 text-xs text-midnight-indigo font-medium cursor-pointer pt-2 border-t border-red-100">
                        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)}
                            className="mt-0.5 rounded text-action-blue focus:ring-action-blue" />
                        <span>Tôi xác nhận đã có sự đồng ý của đối tác / khách hàng cho việc dùng ảnh vào mục đích sinh trắc học.</span>
                    </label>
                )}
            </div>

            {/* Validation errors from BE */}
            {validationErrors.length > 0 && (
                <ValidationTable rows={validationErrors} errorMap={PARTNER_ROW_ERRORS} />
            )}

            {/* Biometric results */}
            {results.some(r => r.biometricStatus) && (
                <ResultRows results={results} statusMap={BIOMETRIC_STATUS} title="Kết quả đính kèm ảnh sinh trắc học" />
            )}

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-3 border-t border-platinum-tint">
                {step < 3 && (
                    <button type="submit"
                        disabled={!file || submitting || (hasPhotos && !consent) || photoBlocksSubmit}
                        className={`px-5 py-2 text-white rounded-xl text-sm font-bold shadow-sm transition-all disabled:opacity-50 active:scale-95
                            ${step === 2 && validationErrors.length > 0 ? 'bg-amber-500 hover:bg-amber-600' : 'bg-action-blue hover:bg-glacier-blue'}`}>
                        {submitting
                            ? (step === 1 ? 'Đang xác thực...' : 'Đang nhập...')
                            : step === 1 ? 'Xác thực file'
                            : validationErrors.length > 0 ? `Bỏ qua ${validationErrors.length} lỗi & Nhập`
                            : 'Xác nhận nhập'}
                    </button>
                )}
                {step === 3 && (
                    <button type="button" onClick={reset}
                        className="px-5 py-2 bg-cloud-mist hover:bg-platinum-tint text-midnight-indigo rounded-xl text-sm font-bold transition-all">
                        Nhập thêm
                    </button>
                )}
            </div>
        </form>
    );
};

// ─── Main Modal ───────────────────────────────────────────────────────────────

const ImportAccountsModal = ({ isOpen, onClose, onSuccess }) => {
    const [tab, setTab] = useState('employee');

    useEffect(() => {
        if (!isOpen) return;
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = ''; };
    }, [isOpen]);

    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onClose]);

    if (!isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl border border-platinum-tint shadow-xl w-full max-w-xl flex flex-col max-h-[90vh] animate-fade-in-up">

                {/* Header */}
                <div className="px-6 py-4 border-b border-platinum-tint flex items-center justify-between bg-cloud-mist/40 rounded-t-2xl shrink-0">
                    <div>
                        <h3 className="font-bold text-midnight-indigo">Nhập tài khoản từ Excel</h3>
                        <p className="text-[10px] text-slate-blue mt-0.5">Thêm nhanh nhiều người dùng cùng lúc</p>
                    </div>
                    <button onClick={onClose} className="text-slate-blue hover:text-midnight-indigo p-1 rounded-lg hover:bg-cloud-mist transition-colors">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Tab bar */}
                <div className="flex border-b border-platinum-tint shrink-0 px-1 bg-white">
                    {[
                        { key: 'employee', label: 'Nhân viên', icon: '👤' },
                        { key: 'partner',  label: 'Đối tác / Khách hàng', icon: '🤝' },
                    ].map(({ key, label, icon }) => (
                        <button
                            key={key}
                            type="button"
                            onClick={() => setTab(key)}
                            className={`flex items-center gap-1.5 px-4 py-3 text-xs font-bold border-b-2 transition-colors
                                ${tab === key
                                    ? 'border-action-blue text-action-blue'
                                    : 'border-transparent text-slate-blue hover:text-midnight-indigo hover:border-platinum-tint'}`}
                        >
                            <span>{icon}</span>{label}
                        </button>
                    ))}
                </div>

                {/* Tab content — scrollable */}
                <div className="overflow-y-auto flex-1">
                    {tab === 'employee'
                        ? <EmployeeTab key="emp" onSuccess={onSuccess} />
                        : <PartnerTab  key="prt" onSuccess={onSuccess} />
                    }
                </div>

                {/* Footer close */}
                <div className="px-5 py-3 border-t border-platinum-tint bg-cloud-mist/20 rounded-b-2xl shrink-0 flex justify-start">
                    <button type="button" onClick={onClose}
                        className="px-4 py-2 border border-platinum-tint text-slate-blue hover:bg-cloud-mist rounded-xl text-sm font-semibold transition-colors">
                        Đóng
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default ImportAccountsModal;
