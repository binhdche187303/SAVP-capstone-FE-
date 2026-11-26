import { Archive, Film, HardDrive, Info, Loader2, Video, Wifi } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import PaginatedCollection from '../../components/common/PaginatedCollection';
import ResponsiveTable from '../../components/common/ResponsiveTable';
import StatisticGrid from '../../components/common/StatisticGrid';
import StatisticCard, { statisticTone } from '../../components/common/StatisticCard';
import RefreshButton from '../../components/common/RefreshButton';
import { getHgCameras, getHgResources } from '../../service/hgvisionService';

// 2.2.7 Ghi hình & lưu trữ — CHỈ XEM, đồng bộ từ HGVision (ghi hình do HGVision/IVSS làm).
//  - Thật: GET /hgvision/cameras (usingRecord, status, health.bitrateKbps)
//          GET /hgvision/resources (disk.percent/used/total)
//  - MOCK: lịch ghi + số ngày lưu (HGVision có trang "Hệ thống → Lưu trữ" nhưng chưa biết API).
//    Khi có API: thay hàm mockStoragePolicy() bên dưới. Ghi trong docs/MOCK_CHO_BE.md.

// [MOCK] chính sách lưu trữ — giá trị cố định cho tới khi biết API "Lưu trữ" của HGVision.
const mockStoragePolicy = () => ({ schedule: 'Liên tục 24/7', retentionDays: 30 });

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

const MockTag = () => (
  <span title="Dữ liệu mẫu — chưa có API từ HGVision" className="ml-1 px-1 rounded bg-amber-100 text-amber-700 text-[9px] font-bold align-middle">MOCK</span>
);

const CameraRecording = () => {
  const [cameras, setCameras] = useState([]);
  const [disk, setDisk] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [camRes, resRes] = await Promise.allSettled([getHgCameras(), getHgResources()]);
    if (camRes.status === 'fulfilled') {
      setCameras(Array.isArray(camRes.value?.data) ? camRes.value.data : []);
    } else {
      setCameras([]);
      setError(camRes.reason?.error?.message || camRes.reason?.message || 'Không kết nối được HGVision.');
    }
    setDisk(resRes.status === 'fulfilled' ? resRes.value?.data?.disk || null : null);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const rows = useMemo(() => cameras.map((c) => ({
    cam: c,
    recording: c.usingRecord && c.status === 'online',
    perDay: gbPerDay(c.health?.bitrateKbps),
    policy: mockStoragePolicy(c),
  })), [cameras]);

  const recordingCount = rows.filter((r) => r.recording).length;
  const enabledCount = rows.filter((r) => r.cam.usingRecord).length;
  const totalPerDay = rows.reduce((s, r) => s + (r.cam.usingRecord && r.perDay ? r.perDay : 0), 0);
  const diskPct = disk?.percent != null ? Number(disk.percent) : null;

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <span data-ui-text="badge" className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-blue-50 text-action-blue mb-2">
            <Film className="w-3.5 h-3.5" /> Camera AI
          </span>
          <h1 className="text-2xl font-bold text-midnight-indigo tracking-tight">Ghi hình & lưu trữ</h1>
          <p className="text-slate-blue text-sm mt-1">Tình trạng ghi hình và ổ lưu trữ, đồng bộ từ HGVision.</p>
        </div>
        <div className="flex items-center gap-2">
          <RefreshButton onClick={load} busy={loading} />
        </div>
      </div>

      <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-100 text-xs text-midnight-indigo flex items-start gap-2">
        <Info className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
        <span>Lịch ghi hình và thời gian lưu trữ được cấu hình trên HGVision. Trang này chỉ hiển thị.</span>
      </div>

      {error && <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">{error}</div>}

      <StatisticGrid columns={4} className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatisticCard extraPosition="footer" icon={HardDrive} label="Ổ lưu trữ HGVision"
          value={diskPct != null ? `${diskPct.toFixed(0)}%` : '—'}
          helper={disk?.used != null && disk?.total != null ? `${formatBytes(disk.used)} / ${formatBytes(disk.total)}` : 'Chưa có dữ liệu'}>
          <div className="h-2 rounded-full bg-cloud-mist mt-2 overflow-hidden">
            <div className={`h-full ${diskPct > 85 ? 'bg-red-500' : diskPct > 70 ? 'bg-amber-500' : 'bg-green-500'}`}
              style={{ width: `${Math.min(100, diskPct || 0)}%` }} />
          </div>
        </StatisticCard>
        <StatisticCard icon={Video} label="Camera đang ghi" value={`${recordingCount} / ${rows.length}`}
          helper="Bật ghi và đang trực tuyến" tone={statisticTone('text-green-600')} />
        <StatisticCard icon={Wifi} label="Bật ghi nhưng mất kết nối" value={String(enabledCount - recordingCount)}
          helper="Đang gián đoạn ghi hình" tone={statisticTone(enabledCount - recordingCount > 0 ? 'text-red-600' : '')} />
        <StatisticCard icon={Archive} label="Ước tính ghi mỗi ngày" value={formatGB(totalPerDay)}
          helper="Tính từ bitrate thực tế của luồng" />
      </StatisticGrid>

      <div className="bg-white rounded-2xl border border-platinum-tint shadow-sm-1 overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 text-action-blue animate-spin" /></div>
        ) : rows.length === 0 ? (
          <div className="text-center py-12 text-slate-blue text-sm">Không có camera nào từ HGVision.</div>
        ) : (
          <PaginatedCollection items={rows} itemLabel="camera">
            {(pageItems) => (
              <ResponsiveTable className="w-full text-sm">
                <thead className="bg-cloud-mist/60 text-[11px] uppercase text-slate-blue">
                  <tr>
                    <th className="text-left px-4 py-3 font-bold">Camera</th>
                    <th className="text-left px-4 py-3 font-bold">Trạng thái ghi</th>
                    <th className="text-left px-4 py-3 font-bold">Kết nối</th>
                    <th className="text-right px-4 py-3 font-bold">Bitrate</th>
                    <th className="text-right px-4 py-3 font-bold">Ước tính/ngày</th>
                    <th className="text-left px-4 py-3 font-bold">Lịch ghi</th>
                    <th className="text-right px-4 py-3 font-bold">Lưu trữ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-platinum-tint">
                  {pageItems.map(({ cam, recording, perDay, policy }) => (
                    <tr key={cam.name} className="hover:bg-cloud-mist/30">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-midnight-indigo">{cam.name}</p>
                        <p data-ui-text="secondary" className="text-[10px] text-steel-gray">
                          {[cam.zoneName, cam.group].filter(Boolean).join(' · ') || 'Chưa gán khu vực'}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        {recording ? (
                          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-red-600">
                            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" /> Đang ghi
                          </span>
                        ) : cam.usingRecord ? (
                          <span className="text-[11px] font-semibold text-amber-600">Gián đoạn</span>
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
                      <td className="px-4 py-3 text-[12px] text-midnight-indigo">{policy.schedule}<MockTag /></td>
                      <td className="px-4 py-3 text-right tabular-nums text-midnight-indigo">{policy.retentionDays} ngày<MockTag /></td>
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
