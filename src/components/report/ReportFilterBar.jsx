import FilterMultiSelect from '../common/FilterMultiSelect';
import TimeRangeButtons from '../common/TimeRangeButtons';
import { changeReportFilters, reportFilterChoices } from './reportFilterChoices';
import FilterBar from '../common/FilterBar';
import { Search } from 'lucide-react';
import './ReportFilterBar.css';
import { inputCls, searchInputCls, labelCls, btnPrimary } from '../common/uiClasses';

const pad = (n) => String(n).padStart(2, '0');
const toYmd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// Tuần tính từ thứ Hai, tháng từ ngày 1, đều đến hôm nay.
export const presetRange = (preset) => {
    const today = new Date();
    if (preset === 'week') {
        const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - ((today.getDay() + 6) % 7));
        return { from: toYmd(monday), to: toYmd(today) };
    }
    if (preset === 'year') return { from: toYmd(new Date(today.getFullYear(), 0, 1)), to: toYmd(today) };
    if (preset === 'month') return { from: toYmd(new Date(today.getFullYear(), today.getMonth(), 1)), to: toYmd(today) };
    return { from: toYmd(today), to: toYmd(today) };
};

export const defaultFilterValue = () => ({ preset: 'month', ...presetRange('month'), q: '' });

const PRESETS = [['today', 'Hôm nay'], ['week', 'Tuần này'], ['month', 'Tháng'], ['year', 'Năm'], ['custom', 'Tùy chọn']];

const ReportFilterBar = ({ definition, lookups = {}, value, onChange, onApply, loading }) => {
    const set = patch => onChange(changeReportFilters(definition, value, patch));
    const choosePreset = (preset) => set(preset === 'custom' ? { preset } : { preset, ...presetRange(preset) });
    const isCustom = value.preset === 'custom';

    return (
        <FilterBar as="form" variant="card"
            className="report-filter-bar"
            onSubmit={(e) => { e.preventDefault(); onApply(); }}
        >
            {/* Hàng 1: tìm kiếm + bộ lọc riêng của báo cáo (giống trang Quản lý khách). */}
            <div className="report-filter-main" style={{ '--report-filter-count': definition.filters.length + 1 }}>
                <div data-filter-search className="camai-filter-field space-y-1">
                    <label className={labelCls} htmlFor="report-q">Tìm trong bảng</label>
                    <div className="relative">
                        <Search className="w-3.5 h-3.5 text-steel-gray absolute left-3 top-1/2 -translate-y-1/2" />
                        <input id="report-q" type="text" value={value.q || ''} onChange={(e) => set({ q: e.target.value })} placeholder="Tên, mã, biển số…" className={searchInputCls} />
                    </div>
                </div>
                {definition.filters.map((filter) => {
                    const academic = definition.type === 'student-attendance';
                    const choices = reportFilterChoices(definition, filter, lookups, value);
                    return (
                        <div className="camai-filter-field space-y-1" key={filter.key}>
                            <label className={labelCls} htmlFor={`report-${filter.key}`}>{filter.label}</label>
                            <FilterMultiSelect
                                singleSelect={Boolean(filter.options) && choices.filter(choice => !['', 'all', 'ALL'].includes(choice.value)).length === 2}
                                id={`report-${filter.key}`}
                                value={value[filter.key] || ''}
                                onChange={(e) => set({ [filter.key]: e.target.value })}
                                className={inputCls}
                            >
                                <option value="">{academic && filter.lookup && choices.length === 0 ? 'Chưa có dữ liệu đã đồng bộ' : 'Tất cả'}</option>
                                {choices.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                            </FilterMultiSelect>
                        </div>
                    );
                })}
            </div>
            {/* Hàng 2: kỳ báo cáo + khoảng ngày + nút xem. */}
            <div className="report-filter-time">
                <TimeRangeButtons label="Kỳ báo cáo" value={value.preset} onChange={choosePreset} options={PRESETS} />
                <div className="report-filter-dates">
                    <div className="camai-filter-field space-y-1">
                        <label className={labelCls} htmlFor="report-from">Từ ngày</label>
                        <input id="report-from" type="date" value={value.from} disabled={!isCustom} onChange={(e) => set({ from: e.target.value })} className={`${inputCls} disabled:opacity-60`} />
                    </div>
                    <div className="camai-filter-field space-y-1">
                        <label className={labelCls} htmlFor="report-to">Đến ngày</label>
                        <input id="report-to" type="date" value={value.to} disabled={!isCustom} onChange={(e) => set({ to: e.target.value })} className={`${inputCls} disabled:opacity-60`} />
                    </div>
                </div>
                <button data-filter-action type="submit" className={`${btnPrimary} report-filter-submit`} disabled={loading}>{loading ? 'Đang tải...' : 'Xem báo cáo'}</button>
            </div>
        </FilterBar>
    );
};

export default ReportFilterBar;
