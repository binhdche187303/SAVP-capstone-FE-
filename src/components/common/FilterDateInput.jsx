import { cloneElement } from 'react';
import DatePicker from 'react-datepicker';
import { vi } from 'date-fns/locale/vi';
import 'react-datepicker/dist/react-datepicker.css';
import './FilterCalendar.css';

export const calendarProps = {
    locale: vi,
    calendarClassName: 'camai-filter-calendar',
    popperClassName: 'camai-filter-calendar-popup',
    portalId: 'camai-filter-calendar-portal',
    previousMonthAriaLabel: 'Tháng trước',
    nextMonthAriaLabel: 'Tháng sau',
    chooseDayAriaLabelPrefix: 'Chọn ngày',
    disabledDayAriaLabelPrefix: 'Không thể chọn ngày',
    showMonthDropdown: true,
    showYearDropdown: true,
    dropdownMode: 'select',
    popperModifiers: [{
        name: 'calendarViewportMargin',
        fn: ({ x, rects, elements }) => {
            const width = elements.floating.ownerDocument.documentElement.clientWidth;
            return { x: Math.max(12, Math.min(x, width - rects.floating.width - 12)) };
        },
    }],
};

const parseLocal = value => {
    const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(value || '');
    if (!match) return null;
    const [, y, m, d, h = '0', minute = '0', second = '0'] = match;
    const date = new Date(+y, +m - 1, +d, +h, +minute, +second);
    return date.getFullYear() === +y && date.getMonth() === +m - 1 && date.getDate() === +d ? date : null;
};
const pad = value => String(value).padStart(2, '0');
const inputValue = (date, withTime) => date
    ? `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}${withTime ? `T${pad(date.getHours())}:${pad(date.getMinutes())}` : ''}`
    : '';

// Retain the HTML date-input contract (local ISO strings), while sharing one popup.
const FilterDateInput = ({ inputElement, id }) => {
    const props = inputElement.props;
    const withTime = props.type === 'datetime-local';
    const selected = parseLocal(props.value ?? props.defaultValue);
    const minimum = parseLocal(props.min);
    const maximum = parseLocal(props.max);
    const controlId = id || props.id;
    const allowed = date => !date || ((!minimum || date >= minimum) && (!maximum || date <= maximum));
    const change = (date, event) => {
        const day = date && !withTime ? new Date(date.getFullYear(), date.getMonth(), date.getDate()) : date;
        if (!allowed(day)) return;
        const target = { value: inputValue(day, withTime), name: props.name, id: controlId, type: props.type };
        props.onChange?.({ ...event, target, currentTarget: target });
    };

    return <DatePicker
        {...calendarProps}
        id={controlId}
        selected={selected}
        onChange={change}
        minDate={minimum || undefined}
        maxDate={maximum || undefined}
        disabled={props.disabled}
        readOnly={props.readOnly}
        required={props.required}
        name={props.name}
        title={props.title}
        dateFormat={withTime ? ['dd/MM/yyyy HH:mm', "yyyy-MM-dd'T'HH:mm"] : ['dd/MM/yyyy', 'yyyy-MM-dd']}
        placeholderText={props.placeholder || (withTime ? 'dd/MM/yyyy HH:mm' : 'dd/MM/yyyy')}
        strictParsing
        showTimeSelect={withTime}
        timeFormat="HH:mm"
        timeIntervals={1}
        timeCaption="Giờ"
        filterTime={withTime ? time => {
            const day = selected || new Date();
            return allowed(new Date(day.getFullYear(), day.getMonth(), day.getDate(), time.getHours(), time.getMinutes()));
        } : undefined}
        onBlur={props.onBlur}
        onFocus={props.onFocus}
        onInputClick={props.onClick}
        wrapperClassName={props.className?.split(/\s+/).includes('opacity-0') ? 'camai-date-input camai-date-input-overlay' : 'camai-date-input'}
        customInput={cloneElement(inputElement, { id: controlId, type: 'text', defaultValue: undefined, autoComplete: 'off' })}
    />;
};

export default FilterDateInput;
