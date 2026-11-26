import { useState } from 'react';
import { createPortal } from 'react-dom';
import * as XLSX from 'xlsx';
import { FileSpreadsheet, Loader2, X } from 'lucide-react';
import { importHgCameras } from '../../service/hgvisionService';

// Import camera từ file Excel bản vẽ Final (CameraAI.xlsx): cột Tên kí hiệu, Model, Tủ, Số bản vẽ,
// Seri Number, IP, User, Password. Xem trước (dryRun) → Nhập. Khu vực BE gán theo tiền tố mã.

const norm = (s) =>
    String(s ?? '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/đ/gi, 'd')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');

const COLS = {
    code: ['tenkihieu', 'tenkyhieu', 'kyhieu', 'kihieu', 'ma', 'macamera', 'ten'],
    model: ['model'],
    cabinet: ['tu'],
    drawingNo: ['sobanve', 'banve'],
    serial: ['serinumber', 'serialnumber', 'serial', 'seri'],
    ip: ['ip', 'diachiip'],
    username: ['user', 'username', 'taikhoan'],
    password: ['password', 'matkhau'],
};

/** Đọc sheet đầu: tìm dòng tiêu đề có cột "Tên kí hiệu" + "IP", trả các dòng có mã. */
export const parseCameraSheet = (rows) => {
    const headerIdx = rows.findIndex((r) => {
        const keys = r.map(norm);
        return COLS.code.some((k) => keys.includes(k)) && keys.includes('ip');
    });
    if (headerIdx < 0) throw new Error('Không thấy dòng tiêu đề (cần cột "Tên kí hiệu" và "IP").');
    const header = rows[headerIdx].map(norm);
    const idx = Object.fromEntries(
        Object.entries(COLS).map(([f, keys]) => [f, header.findIndex((h) => keys.includes(h))]),
    );
    return rows
        .slice(headerIdx + 1)
        .map((r) =>
            Object.fromEntries(
                Object.entries(idx)
                    .filter(([, i]) => i >= 0)
                    .map(([f, i]) => [f, r[i] == null ? '' : String(r[i]).trim()]),
            ),
        )
        .filter((r) => r.code);
};

const ACTION = {
    create: { label: 'Tạo mới', cls: 'bg-emerald-50 text-emerald-700' },
    update: { label: 'Cập nhật', cls: 'bg-blue-50 text-blue-700' },
    error: { label: 'Lỗi', cls: 'bg-red-50 text-red-600' },
};
const HG = {
    created: 'Đã thêm',
    exists: 'Đã có',
    skipped: 'Bỏ qua',
    failed: 'Lỗi',
};

const ImportCamerasModal = ({ open, onClose, onDone }) => {
    const [fileName, setFileName] = useState('');
    const [rows, setRows] = useState([]);
    const [preview, setPreview] = useState(null);
    const [result, setResult] = useState(null);
    const [pushToHg, setPushToHg] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    if (!open) return null;

    const reset = () => {
        setFileName('');
        setRows([]);
        setPreview(null);
        setResult(null);
        setError('');
    };
    const close = () => {
        reset();
        onClose();
    };

    const onFile = async (e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        reset();
        setFileName(file.name);
        setBusy(true);
        try {
            const wb = XLSX.read(await file.arrayBuffer());
            const sheet = wb.Sheets[wb.SheetNames[0]];
            const parsed = parseCameraSheet(XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null }));
            if (!parsed.length) throw new Error('File không có dòng camera nào.');
            setRows(parsed);
            const res = await importHgCameras({ rows: parsed, dryRun: true });
            setPreview(res?.data ?? res);
        } catch (err) {
            setError(err?.response?.data?.message || err?.message || 'Không đọc được file.');
        } finally {
            setBusy(false);
        }
    };

    const submit = async () => {
        setBusy(true);
        setError('');
        try {
            const res = await importHgCameras({ rows, dryRun: false, pushToHg });
            setResult(res?.data ?? res);
            onDone?.();
        } catch (err) {
            setError(err?.response?.data?.message || err?.message || 'Import thất bại.');
        } finally {
            setBusy(false);
        }
    };

    const shown = result || preview;
    const s = shown?.summary;

    return createPortal(
        <div className="fixed inset-0 z-[1000] bg-black/40 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-5xl max-h-[92vh] flex flex-col">
                <div className="flex items-center justify-between px-5 py-4 border-b border-platinum-tint">
                    <h3 className="font-bold text-midnight-indigo flex items-center gap-2">
                        <FileSpreadsheet className="w-5 h-5 text-emerald-600" /> Import camera từ Excel
                    </h3>
                    <button onClick={close} className="p-1 rounded hover:bg-slate-100" aria-label="Đóng">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-5 space-y-4 overflow-y-auto">
                    <p className="text-sm text-slate-blue">
                        File theo mẫu <b>CameraAI.xlsx</b>: cột Tên kí hiệu, Model, Tủ, Số bản vẽ, Seri Number, IP, User,
                        Password. Khu vực gán theo mã: <b>G-</b> A1 tầng trệt, <b>T1-/T2-</b> A1 lầu 1/2, <b>HT-</b> Hội
                        trường, <b>B1-</b> B1 tầng trệt, <b>Gate1/2/2A/3-</b> các cổng. Trùng mã hoặc IP thì cập nhật
                        thiết bị cũ. Mật khẩu camera chỉ chuyển sang HGVision, không lưu ở SAVP.
                    </p>

                    <div className="flex flex-wrap items-center gap-3">
                        <label className="inline-flex items-center px-4 py-2 rounded-xl border border-platinum-tint text-sm font-semibold cursor-pointer hover:bg-slate-50">
                            Chọn file .xlsx
                            <input type="file" accept=".xlsx,.xls" className="hidden" onChange={onFile} disabled={busy} />
                        </label>
                        {fileName && <span className="text-sm text-slate-blue">{fileName}</span>}
                        {busy && <Loader2 className="w-4 h-4 animate-spin text-action-blue" />}
                    </div>

                    {error && <div className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</div>}

                    {s && (
                        <div className="text-sm flex flex-wrap gap-3">
                            <span className="font-semibold">{result ? 'Kết quả:' : 'Xem trước:'}</span>
                            <span>{s.total} dòng</span>
                            <span className="text-emerald-700">{s.create} tạo mới</span>
                            <span className="text-blue-700">{s.update} cập nhật</span>
                            <span className="text-red-600">{s.error} lỗi</span>
                            {result && (
                                <span>
                                    HGVision: {s.hgCreated} đã thêm, {s.hgFailed} lỗi
                                </span>
                            )}
                        </div>
                    )}

                    {shown?.rows?.length > 0 && (
                        <div className="border border-platinum-tint rounded-xl overflow-auto max-h-[50vh]">
                            <table className="w-full text-sm">
                                <thead className="bg-slate-50 sticky top-0">
                                    <tr className="text-left text-slate-blue">
                                        <th className="px-3 py-2">#</th>
                                        <th className="px-3 py-2">Mã</th>
                                        <th className="px-3 py-2">IP</th>
                                        <th className="px-3 py-2">Khu vực</th>
                                        <th className="px-3 py-2">Hành động</th>
                                        {result && <th className="px-3 py-2">HGVision</th>}
                                        <th className="px-3 py-2">Ghi chú</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {shown.rows.map((r) => (
                                        <tr key={r.row} className="border-t border-platinum-tint">
                                            <td className="px-3 py-1.5 text-slate-400">{r.row}</td>
                                            <td className="px-3 py-1.5 font-semibold">{r.code}</td>
                                            <td className="px-3 py-1.5 font-mono text-xs">{r.ip}</td>
                                            <td className="px-3 py-1.5">{r.zone || '—'}</td>
                                            <td className="px-3 py-1.5">
                                                <span className={`px-2 py-0.5 rounded text-xs font-semibold ${ACTION[r.action]?.cls}`}>
                                                    {ACTION[r.action]?.label}
                                                </span>
                                            </td>
                                            {result && <td className="px-3 py-1.5">{HG[r.hg] || '—'}</td>}
                                            <td className="px-3 py-1.5 text-xs text-red-600">{r.message}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-platinum-tint">
                    <label className="flex items-center gap-2 text-sm">
                        <input
                            type="checkbox"
                            checked={pushToHg}
                            onChange={(e) => setPushToHg(e.target.checked)}
                            disabled={busy || !!result}
                        />
                        Thêm camera sang HGVision (ONVIF, ép H.264)
                    </label>
                    <div className="flex gap-2">
                        <button onClick={close} className="px-4 py-2 rounded-xl border border-platinum-tint text-sm font-semibold">
                            {result ? 'Đóng' : 'Huỷ'}
                        </button>
                        {!result && (
                            <button
                                onClick={submit}
                                disabled={busy || !preview || preview.summary.create + preview.summary.update === 0}
                                className="px-4 py-2 rounded-xl bg-action-blue text-white text-sm font-semibold disabled:opacity-50 inline-flex items-center gap-2"
                            >
                                {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                                Nhập {preview ? preview.summary.create + preview.summary.update : ''} camera
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>,
        document.body,
    );
};

export default ImportCamerasModal;
