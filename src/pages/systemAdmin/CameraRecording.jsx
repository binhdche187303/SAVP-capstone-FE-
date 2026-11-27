import { Archive, Clock, Film, HardDrive, Info, Loader2, Search, Video } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import PaginatedCollection from '../../components/common/PaginatedCollection';
import ResponsiveTable from '../../components/common/ResponsiveTable';
import StatisticGrid from '../../components/common/StatisticGrid';
import StatisticCard, { statisticTone } from '../../components/common/StatisticCard';
import RefreshButton from '../../components/common/RefreshButton';
import { getHgCameras, getHgRecordingRetention, getHgResources } from '../../service/hgvisionService';

// 2.2.7 Ghi hình & lưu trữ — CHỈ XEM, toàn bộ là dữ liệu thật từ HGVision:
//  - GET /hgvision/cameras             → bật ghi, kết nối, bitrate (→ ước tính GB/ngày)
//  - GET /hgvision/resources           → dung lượng ổ
//  - GET /hgvision/recording/retention → video cũ nhất / mới nhất từng camera (→ số ngày đang lưu)
// Số ngày lưu, ngưỡng xoá, độ dài đoạn: HGVision không có API → chỉnh trên HGVision (Hệ thống → Lưu trữ).

const DAY_MS = 86400_000;
/** Đang bật ghi mà đoạn ghi mới nhất cũ hơn mức này → coi là gián đoạn. */
const STALE_MS = 15 * 60_000;

const formatBytes = (n) => {
  if (n == null || Number.isNaN(Number(n))) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = Number(n);
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i += 1; }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
};

/** Ước tính dung lượng/ngày từ bitrate thật của luồng (kbps). */
const gbPerDay = (kbps) => (kbps ? (kbps * 86400) / 8 / 1024 / 1024 : null);
const formatGB = (gb) => (gb == null ? '—' : gb >= 1024 ? `${(gb / 1024).toFixed(2)} TB` : `${gb.toFixed(gb < 10 ? 1 : 0)} GB`);

const pad = (n) => String(n).padStart(2, '0');
const formatTime = (ms) => {
  if (!ms) return '—';
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
};
const daysSince = (ms) => (ms ? Math.max(0, (Date.now() - ms) / DAY_MS) : null);
const formatDays = (d) => (d == null ? '—' : d < 1 ? `${Math.round(d * 24)} giờ` : `${d.toFixed(d < 10 ? 1 : 0)} ngày`);
const ago = (ms) => {
  if (!ms) return '—';
  const m = Math.round((Date.now() - ms) / 60_000);
  if (m < 2) return 'vừa xong';
  if (m < 60) return `${m} phút trước`;
  if (m < 1440) return `${Math.round(m / 60)} giờ trước`;
  return `${Math.round(m / 1440)} ngày trước`;
};

const CameraRecording = () => {
  const [cameras, setCameras] = useState([]);
  const [disk, setDisk] = useState(null);
  const [retention, setRetention] = useState({});
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [camRes, resRes, retRes] = await Promise.allSettled([
      getHgCameras(), getHgResources(), getHgRecordingRetention(),
    ]);
    if (camRes.status === 'fulfilled') {
      setCameras(Array.isArray(camRes.value?.data) ? camRes.value.data : []);
    } else {
      setCameras([]);
      setError(camRes.reason?.error?.message || camRes.reason?.message || 'Không kết nối được HGVision.');
    }
    setDisk(resRes.status === 'fulfilled' ? resRes.value?.data?.disk || null : null);
    const ret = retRes.status === 'fulfilled' && Array.isArray(retRes.value?.data) ? retRes.value.data : [];
    setRetention(Object.fromEntries(ret.map((r) => [r.name, r])));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const rows = useMemo(() => cameras.map((c) => {
    const ret = retention[c.name] || {};
    const stale = Boolean(c.usingRecord && ret.latestMs && Date.now() - ret.latestMs > STALE_MS);
    return {
      cam: c,
      recording: c.usingRecord && c.status === 'online' && !stale,
      perDay: gbPerDay(c.health?.bitrateKbps),
      oldestMs: ret.oldestMs || null,
      latestMs: ret.latestMs || null,
      stale,
    };
  }), [cameras, retention]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => [r.cam.name, r.cam.zoneName, r.cam.group].filter(Boolean).join(' ').toLowerCase().includes(q));
  }, [rows, query]);

  const recordingCount = rows.filter((r) => r.recording).length;
  const enabledCount = rows.filter((r) => r.cam.usingRecord).length;
  const brokenCount = enabledCount - recordingCount;
  const totalPerDay = rows.reduce((s, r) => s + (r.cam.usingRecord && r.perDay ? r.perDay : 0), 0);
  const diskPct = disk?.percent != null ? Number(disk.percent) : null;
  const hasDisk = disk?.used != null && disk?.total != null;
  const freeGB = hasDisk ? (disk.total - disk.used) / 1024 ** 3 : null;
  const olds = rows.map((r) => r.oldestMs).filter(Boolean);
  const oldestAll = olds.length ? Math.min(...olds) : null;
  const kept = rows.map((r) => daysSince(r.oldestMs)).filter((d) => d != null);
  const avgKept = kept.length ? kept.reduce((a, b) => a + b, 0) / kept.length : null;

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <span data-ui-text="badge" className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-blue-50 text-action-blue mb-2">
            <Film className="w-3.5 h-3.5" /> Camera AI
          </span>
          <h1 className="text-2xl font-bold text-midnight-indigo tracking-tight">Ghi hình & lưu trữ</h1>
          <p className="text-slate-blue text-sm mt-1">Tình trạng ghi hình và video đang lưu, đồng bộ từ HGVision.</p>
        </div>
        <div className="flex items-center gap-2">
          <RefreshButton onClick={load} busy={loading} />
        </div>
      </div>

      <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-100 text-xs text-midnight-indigo flex items-start gap-2">
        <Info className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
        <span>
          HGVision ghi <b>liên tục</b> mọi camera đang bật ghi; ổ đầy tới ngưỡng thì tự xoá video cũ nhất.
          Số ngày lưu, ngưỡng xoá và độ dài đoạn chỉnh tại <b>HGVision → Hệ thống → Lưu trữ</b> — trang này hiện số liệu thực tế.
        </span>
      </div>

      {error && <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">{error}</div>}

      <StatisticGrid columns={4} className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatisticCard extraPosition="footer" icon={HardDrive} label="Dung lượng ghi hình"
          value={diskPct != null ? `${diskPct.toFixed(0)}%` : '—'}
          helper={hasDisk ? `${formatBytes(disk.used)} / ${formatBytes(disk.total)} · trống ${formatBytes(disk.total - disk.used)}` : 'Chưa có dữ liệu'}>
          <div className="h-2 rounded-full bg-cloud-mist mt-2 overflow-hidden">
            <div className={`h-full ${diskPct > 85 ? 'bg-red-500' : diskPct > 70 ? 'bg-amber-500' : 'bg-green-500'}`}
              style={{ width: `${Math.min(100, diskPct || 0)}%` }} />
          </div>
        </StatisticCard>
        <StatisticCard icon={Archive} label="Video đang lưu"
          value={oldestAll ? formatDays(daysSince(oldestAll)) : '—'}
          helper={oldestAll ? `từ ${formatTime(oldestAll)} · TB mỗi camera ${formatDays(avgKept)}` : 'Chưa đọc được dải ghi'} />
        <StatisticCard icon={Video} label="Camera đang ghi" value={`${recordingCount} / ${rows.length}`}
          helper={brokenCount > 0 ? `${brokenCount} camera bật ghi nhưng gián đoạn` : 'Không camera nào gián đoạn'}
          tone={statisticTone(brokenCount > 0 ? 'text-red-600' : 'text-green-600')} />
        <StatisticCard icon={Clock} label="Ước tính ghi mỗi ngày" value={formatGB(totalPerDay)}
          helper={freeGB != null && totalPerDay > 0 ? `Ổ trống đủ thêm khoảng ${formatDays(freeGB / totalPerDay)}` : 'Tính từ bitrate thực tế của luồng'} />
      </StatisticGrid>

      <div className="bg-white rounded-2xl border border-platinum-tint shadow-sm-1 overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 py-3 border-b border-platinum-tint">
          <h2 className="text-[12px] font-bold text-midnight-indigo uppercase tracking-wide">Lưu trữ theo camera</h2>
          <label className="relative">
            <Search className="w-4 h-4 text-steel-gray absolute left-3 top-1/2 -translate-y-1/2" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Tìm camera, khu vực"
              className="pl-9 pr-3 py-2 text-sm rounded-xl border border-platinum-tint bg-white w-full sm:w-64 focus:outline-none focus:border-action-blue" />
          </label>
        </div>
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 text-action-blue animate-spin" /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-slate-blue text-sm">
            {rows.length ? 'Không có camera khớp.' : 'Không có camera nào từ HGVision.'}
          </div>
        ) : (
          <PaginatedCollection items={filtered} itemLabel="camera">
            {(pageItems) => (
              <ResponsiveTable className="w-full text-sm">
                <thead className="bg-cloud-mist/60 text-[11px] uppercase text-slate-blue">
                  <tr>
                    <th className="text-left px-4 py-3 font-bold">Camera</th>
                    <th className="text-left px-4 py-3 font-bold">Ghi hình</th>
                    <th className="text-left px-4 py-3 font-bold">Kết nối</th>
                    <th className="text-right px-4 py-3 font-bold">Bitrate</th>
                    <th className="text-right px-4 py-3 font-bold">Ước tính/ngày</th>
                    <th className="text-left px-4 py-3 font-bold">Video cũ nhất</th>
                    <th className="text-right px-4 py-3 font-bold">Đang lưu</th>
                    <th className="text-left px-4 py-3 font-bold">Ghi gần nhất</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-platinum-tint">
                  {pageItems.map(({ cam, recording, perDay, oldestMs, latestMs, stale }) => (
                    <tr key={cam.name} className="hover:bg-cloud-mist/30">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-midnight-indigo">{cam.name}</p>
                        <p data-ui-text="secondary" className="text-[10px] text-steel-gray">
                          {cam.zoneName || cam.group || 'Chưa gán khu vực'}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        {recording ? (
                          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-red-600">
                            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" /> Đang ghi
                          </span>
                        ) : cam.usingRecord ? (
                          <span className="text-[11px] font-semibold text-amber-600"
                            title={stale ? 'Trực tuyến nhưng không có đoạn ghi mới' : 'Camera mất kết nối'}>Gián đoạn</span>
                        ) : (
                          <span className="text-[11px] font-semibold text-steel-gray">Tắt ghi</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-[11px] font-semibold ${cam.status === 'online' ? 'text-green-600' : 'text-red-600'}`}>
                          {cam.status === 'online' ? 'Trực tuyến' : 'Mất kết nối'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-midnight-indigo">
                        {cam.health?.bitrateKbps ? `${(cam.health.bitrateKbps / 1000).toFixed(1)} Mbps` : '—'}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-midnight-indigo">
                        {cam.usingRecord ? formatGB(perDay) : '—'}
                      </td>
                      <td className="px-4 py-3 text-[12px] tabular-nums text-midnight-indigo">{formatTime(oldestMs)}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold text-midnight-indigo">{formatDays(daysSince(oldestMs))}</td>
                      <td className={`px-4 py-3 text-[12px] ${stale ? 'text-red-600 font-semibold' : 'text-slate-blue'}`}>{ago(latestMs)}</td>
                    </tr>
                  ))}
                </tbody>
              </ResponsiveTable>
            )}
          </PaginatedCollection>
        )}
      </div>
    </div>
  );
};

export default CameraRecording;
