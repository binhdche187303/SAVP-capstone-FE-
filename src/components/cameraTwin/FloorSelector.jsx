/** Thanh chọn tầng: Tầng hầm | Tầng trệt | Lầu 1 | … — chỉ các tầng có dữ liệu zone/phòng. */
const FloorSelector = ({ floors, value, onChange, summarize }) => (
  <div role="tablist" aria-label="Chọn tầng" className="flex flex-wrap gap-1.5">
    {floors.map((f) => {
      const s = summarize?.(f.cameraIds);
      const active = f.id === value;
      return (
        <button
          key={f.id}
          role="tab"
          aria-selected={active}
          onClick={() => onChange(f.id)}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold ${
            active
              ? "border-[#1e3a5f] bg-[#1e3a5f] text-white"
              : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
          }`}
        >
          {f.label}
          {s && s.total > 0 && (
            <span className={`rounded px-1 text-[10px] tabular-nums ${active ? "bg-white/20" : "bg-slate-100 text-slate-500"}`}>
              {s.total}
            </span>
          )}
          {s && s.offline + s.alert > 0 && <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />}
        </button>
      );
    })}
  </div>
);

export default FloorSelector;
