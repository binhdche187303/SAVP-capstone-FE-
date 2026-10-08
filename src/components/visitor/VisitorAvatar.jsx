const COLORS = ['#006BFF', '#8247f5', '#0099ff', '#22c55e', '#f59e0b', '#BB32D5', '#476788'];

const colorOf = (name) => {
    let h = 0;
    for (let i = 0; i < name.length; i += 1) h = (h * 31 + name.charCodeAt(i)) % 997;
    return COLORS[h % COLORS.length];
};

// Ảnh khuôn mặt của khách; khách minh hoạ không có ảnh thật thì hiện chữ cái đầu của tên.
const VisitorAvatar = ({ visitor, size = 48 }) => {
    const name = visitor?.fullName || '?';
    const initial = name.trim().split(/\s+/).pop().charAt(0).toUpperCase();
    const missing = visitor?.hasPhoto === false;
    const style = { width: size, height: size, fontSize: size * 0.4 };
    return (
        <span className="inline-flex flex-col items-center gap-1 flex-shrink-0">
            {visitor?.photo ? (
                <img src={visitor.photo} alt={`Ảnh khuôn mặt của ${name}`} style={style} className="rounded-full object-cover border border-platinum-tint" />
            ) : (
                <span
                    style={{ ...style, backgroundColor: missing ? 'transparent' : colorOf(name), color: missing ? '#A6BBD1' : '#fff' }}
                    className={`rounded-full flex items-center justify-center font-bold ${missing ? 'border-2 border-dashed border-steel-gray' : ''}`}
                >
                    {initial}
                </span>
            )}
            {missing && size >= 64 && <span className="text-[10px] text-slate-blue">Chưa có ảnh</span>}
        </span>
    );
};

export default VisitorAvatar;
