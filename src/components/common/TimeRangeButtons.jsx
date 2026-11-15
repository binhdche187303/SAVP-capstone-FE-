import { useId } from 'react';
import './TimeRangeButtons.css';

// Calendar periods use visible buttons; specialized rolling ranges use a dropdown.
const TimeRangeButtons = ({ label = 'Khoảng thời gian', value, onChange, options, disabled = false, id, className = '', customLabel = 'Tùy chọn', forceButtons = false }) => {
    const generatedId = useId();
    const labelId = `${id || generatedId}-label`;
    const choices = options.map(option => Array.isArray(option) ? option : [option.value, option.label]);
    const calendarLabels = { day: 'Ngày', today: 'Hôm nay', week: 'Tuần', month: 'Tháng', year: 'Năm', custom: customLabel };
    // Rolling hours/days and other specialized periods stay in a dropdown.
    const calendar = forceButtons || choices.every(([key]) => Object.hasOwn(calendarLabels, key));
    return (
        <div className={`camai-filter-field camai-time-field ${className}`}>
            <span id={labelId} data-filter-label className="camai-time-label">{label}</span>
            {!calendar ? <select id={id} aria-labelledby={labelId} disabled={disabled} value={value}
                className="camai-time-select" onChange={event => {
                    const selected = choices.find(([key]) => String(key) === event.target.value);
                    if (selected) onChange(selected[0]);
                }}>{choices.map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select> : <div id={id} role="group" aria-labelledby={labelId} data-filter-presets className="camai-time-buttons">
                {choices.map(([key, text]) => {
                    return <button key={key} type="button" data-filter-preset disabled={disabled}
                        aria-pressed={value === key} onClick={() => onChange(key)}>{calendarLabels[key] || text}</button>;
                })}
            </div>}
        </div>
    );
};

export default TimeRangeButtons;
