import logo from '../../assets/images/logo.png';

// Khung trang công khai (không đăng nhập) của phân hệ Khách: đăng ký và tra cứu.
const PublicShell = ({ title, subtitle, children }) => (
    <div className="min-h-screen bg-cloud-mist py-10 px-4">
        <div className="max-w-2xl mx-auto space-y-6">
            <header className="text-center space-y-2">
                <img src={logo} alt="Logo" className="h-12 mx-auto" />
                <h1 className="text-2xl font-bold text-midnight-indigo">{title}</h1>
                {subtitle && <p className="text-sm text-slate-blue">{subtitle}</p>}
            </header>
            {children}
            <p className="text-center text-[11px] text-slate-blue">Smart AI Vision Platform · Quản lý khách đến làm việc</p>
        </div>
    </div>
);

export default PublicShell;
