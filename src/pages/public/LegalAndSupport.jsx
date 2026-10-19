import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';

const SECTIONS = [
    {
        id: 'overview',
        title: 'Tổng quan',
        type: 'link'
    },
    {
        id: 'terms-group',
        title: 'Điều khoản & Chính sách',
        type: 'group',
        children: [
            { id: 'terms', title: 'Điều khoản sử dụng' },
            { id: 'privacy', title: 'Quyền riêng tư' },
        ]
    },
    {
        id: 'docs-group',
        title: 'Tài liệu',
        type: 'group',
        children: [
            { id: 'docs-user', title: 'Hướng dẫn sử dụng' },
            { id: 'docs-api', title: 'Tài liệu API' },
        ]
    },
    {
        id: 'support',
        title: 'Liên hệ hỗ trợ',
        type: 'link'
    }
];

const LegalAndSupport = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const navigate = useNavigate();
    const initialTab = searchParams.get('tab') || 'overview';
    const [activeTab, setActiveTab] = useState(initialTab);
    const [expandedGroups, setExpandedGroups] = useState({
        'terms-group': true,
        'docs-group': true,
    });

    useEffect(() => {
        const tab = searchParams.get('tab');
        if (tab) {
            setActiveTab(tab);
            // Auto expand parent group if needed
            if (['terms', 'privacy'].includes(tab)) {
                setExpandedGroups(prev => ({ ...prev, 'terms-group': true }));
            }
            if (['docs-user', 'docs-api'].includes(tab)) {
                setExpandedGroups(prev => ({ ...prev, 'docs-group': true }));
            }
        }
    }, [searchParams]);

    const handleTabClick = (id) => {
        setActiveTab(id);
        setSearchParams({ tab: id });
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const toggleGroup = (id) => {
        setExpandedGroups(prev => ({
            ...prev,
            [id]: !prev[id]
        }));
    };

    const renderContent = () => {
        switch (activeTab) {
            case 'overview':
                return (
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <h1 className="text-4xl md:text-5xl font-extrabold text-midnight-indigo tracking-tight mb-4">Chào mừng đến với VISMA IVA!</h1>
                        <p className="text-slate-blue text-sm mb-10">Ngày hiệu lực: 01 Tháng 08, 2026</p>
                        
                        <div className="prose prose-slate max-w-none prose-headings:text-midnight-indigo prose-a:text-action-blue hover:prose-a:text-blue-700">
                            <p className="text-base text-gray-700 leading-relaxed mb-6">
                                Để xác định các điều khoản, điều kiện và chính sách nào điều chỉnh việc bạn truy cập và sử dụng dịch vụ của VISMA IVA, trước tiên hãy xác định bạn là loại người dùng nào. Dưới đây là các định nghĩa được sử dụng xuyên suốt các tài liệu pháp lý và chính sách của hệ thống.
                            </p>
                            <p className="text-base text-gray-700 leading-relaxed mb-8">
                                Vui lòng xem xét các điều khoản cụ thể dựa trên loại người dùng và vai trò của bạn (như được mô tả bên dưới).
                            </p>

                            <h3 className="text-xl font-bold mt-8 mb-4">Bạn có phải là "Khách hàng" của VISMA IVA không?</h3>
                            <p className="mb-4 text-gray-700">Bạn là "Khách hàng" nếu:</p>
                            <ul className="list-disc pl-6 space-y-3 text-gray-700 mb-8">
                                <li>Bạn là một cá nhân có tài khoản VISMA IVA đã đăng ký; hoặc</li>
                                <li>Bạn là một Tổ chức (Doanh nghiệp) đã mua giấy phép VISMA IVA cho Người dùng được ủy quyền để truy cập và sử dụng hệ thống.
                                    <ul className="list-[circle] pl-6 mt-3 space-y-2 text-sm text-gray-600">
                                        <li>"Tổ chức" có nghĩa là công ty hoặc tổ chức đã mua giấy phép sử dụng Dịch vụ với các miền email mà họ sở hữu.</li>
                                        <li>"Người dùng được ủy quyền" có nghĩa là nhân viên, chuyên gia tư vấn hoặc nhà thầu được Tổ chức cấp quyền truy cập vào Dịch vụ.</li>
                                    </ul>
                                </li>
                            </ul>
                        </div>
                    </div>
                );
            case 'privacy':
                return (
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <h1 className="text-4xl md:text-5xl font-extrabold text-midnight-indigo tracking-tight mb-4">Chính sách Quyền riêng tư</h1>
                        <p className="text-slate-blue text-sm mb-10">Cập nhật lần cuối: 01 Tháng 08, 2026</p>
                        
                        <div className="prose prose-slate max-w-none">
                            <h3 className="text-xl font-bold mt-8 mb-4 text-midnight-indigo">1. Thu thập dữ liệu sinh trắc học</h3>
                            <p className="text-base text-gray-700 leading-relaxed mb-6">
                                VISMA IVA cam kết bảo vệ dữ liệu khuôn mặt (FaceID) của bạn. Dữ liệu này chỉ được thu thập khi có sự đồng ý rõ ràng và ĐỘC QUYỀN sử dụng cho mục đích điểm danh và kiểm soát quyền truy cập tại các không gian phòng họp. Chúng tôi không chia sẻ hoặc bán dữ liệu sinh trắc học cho bất kỳ bên thứ ba nào.
                            </p>

                            <h3 className="text-xl font-bold mt-8 mb-4 text-midnight-indigo">2. Lưu trữ và Bảo mật</h3>
                            <p className="text-base text-gray-700 leading-relaxed mb-6">
                                Dữ liệu hình ảnh gốc không được lưu trữ vĩnh viễn trên máy chủ công khai. Thay vào đó, hệ thống chuyển đổi khuôn mặt thành các chuỗi vector (embeddings) và mã hóa an toàn trên máy chủ. Hình ảnh gốc (nếu có giữ lại để huấn luyện AI) được mã hoá và giới hạn quyền truy cập cực kỳ nghiêm ngặt.
                            </p>

                            <h3 className="text-xl font-bold mt-8 mb-4 text-midnight-indigo">3. Quyền của người dùng</h3>
                            <p className="text-base text-gray-700 leading-relaxed mb-6">
                                Bất cứ lúc nào, bạn cũng có quyền yêu cầu xem, trích xuất hoặc xóa bỏ hoàn toàn hồ sơ sinh trắc học của mình khỏi hệ thống VISMA IVA bằng cách thao tác trên trang Hồ sơ cá nhân, hoặc liên hệ với Quản trị viên hệ thống của tổ chức bạn.
                            </p>
                        </div>
                    </div>
                );
            case 'terms':
                return (
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <h1 className="text-4xl md:text-5xl font-extrabold text-midnight-indigo tracking-tight mb-4">Điều khoản sử dụng</h1>
                        <p className="text-slate-blue text-sm mb-10">Cập nhật lần cuối: 01 Tháng 08, 2026</p>
                        <div className="prose prose-slate max-w-none">
                            <p className="text-base text-gray-700 leading-relaxed mb-6">
                                Việc sử dụng nền tảng VISMA IVA đồng nghĩa với việc bạn đồng ý tuân thủ các quy định vận hành của tổ chức. Hệ thống giám sát việc ra vào phòng họp và ghi âm/bóc băng cuộc họp (nếu được kích hoạt) là tài sản dữ liệu của doanh nghiệp bạn. 
                            </p>
                            <h3 className="text-xl font-bold mt-8 mb-4 text-midnight-indigo">1. Mục đích sử dụng</h3>
                            <p className="text-base text-gray-700 leading-relaxed mb-6">
                                Nền tảng được cung cấp để tối ưu hoá việc quản lý tài nguyên không gian (phòng họp), tự động hoá điểm danh và ghi chép nội dung cuộc họp. Vui lòng không sử dụng hệ thống cho các mục đích vi phạm pháp luật, quấy rối, hoặc phát tán thông tin nội bộ trái phép.
                            </p>
                            
                            <h3 className="text-xl font-bold mt-8 mb-4 text-midnight-indigo">2. Trách nhiệm người dùng</h3>
                            <p className="text-base text-gray-700 leading-relaxed mb-6">
                                Bạn có trách nhiệm bảo mật thông tin tài khoản (email, mật khẩu). Trong trường hợp nghi ngờ tài khoản bị xâm phạm, vui lòng thông báo ngay cho Quản trị viên. Việc lạm dụng tài nguyên phòng họp (như đặt phòng ảo liên tục) có thể dẫn đến việc tài khoản bị giới hạn quyền theo chính sách của tổ chức.
                            </p>
                        </div>
                    </div>
                );
            case 'docs-user':
                return (
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <h1 className="text-4xl md:text-5xl font-extrabold text-midnight-indigo tracking-tight mb-4">Hướng dẫn sử dụng</h1>
                        <p className="text-base text-gray-700 leading-relaxed mb-8">Khám phá các tính năng cốt lõi của VISMA IVA và tìm hiểu cách hệ thống hoạt động.</p>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
                            {[
                                { title: 'Đăng ký khuôn mặt FaceID', desc: 'Quy trình cung cấp ảnh khuôn mặt đúng tiêu chuẩn để AI nhận diện khi bước vào phòng họp.' },
                                { title: 'Đặt phòng họp thông minh', desc: 'Tìm phòng trống, mời người tham gia và thiết lập tuỳ chọn ghi hình/bóc băng.' },
                                { title: 'Giao diện Trong cuộc họp (In-Meeting)', desc: 'Sử dụng công cụ bóc băng, điểm danh trực tiếp và gán tên người nói (Speaker Diarization).' },
                                { title: 'Phân tích & Báo cáo', desc: 'Dành cho quản lý: Đọc các chỉ số lấp đầy phòng, tỷ lệ No-show và tối ưu tài nguyên.' },
                            ].map((doc, i) => (
                                <div key={i} className="p-6 rounded-2xl border border-platinum-tint bg-white hover:border-action-blue/50 hover:shadow-md transition-all cursor-pointer group">
                                    <h4 className="font-bold text-lg text-midnight-indigo mb-2 group-hover:text-action-blue transition-colors">{doc.title}</h4>
                                    <p className="text-sm text-slate-blue leading-relaxed">{doc.desc}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                );
            case 'docs-api':
                return (
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <h1 className="text-4xl md:text-5xl font-extrabold text-midnight-indigo tracking-tight mb-4">Tài liệu API</h1>
                        <p className="text-base text-gray-700 leading-relaxed mb-8">Tài liệu tham khảo dành cho Developer và Đội ngũ tích hợp hệ thống.</p>
                        
                        <div className="bg-[#0d1117] rounded-2xl overflow-hidden border border-gray-800">
                            <div className="px-4 py-3 border-b border-gray-800 flex items-center gap-2">
                                <div className="w-3 h-3 rounded-full bg-red-500"></div>
                                <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                                <div className="w-3 h-3 rounded-full bg-green-500"></div>
                                <span className="text-gray-400 text-xs font-mono ml-2">REST API Overview</span>
                            </div>
                            <div className="p-6">
                                <pre className="text-sm font-mono text-gray-300 overflow-x-auto">
                                    <code>
{`// Base URL: https://api.smartracking.io.vn/api/v1

// 1. Authentication
POST /auth/login
POST /auth/refresh-token

// 2. User & Biometrics
GET /me/profile
POST /me/biometric-submission (multipart/form-data)

// 3. Meetings
GET /meetings/schedule
POST /meetings/book
GET /meetings/:id/transcription

// For full documentation, please contact your System Administrator
// or refer to the internal Swagger UI at /api/docs`}
                                    </code>
                                </pre>
                            </div>
                        </div>
                    </div>
                );
            case 'support':
                return (
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <h1 className="text-4xl md:text-5xl font-extrabold text-midnight-indigo tracking-tight mb-4">Liên hệ hỗ trợ</h1>
                        <p className="text-base text-gray-700 leading-relaxed mb-8">
                            Nếu bạn gặp sự cố kỹ thuật hoặc cần hỗ trợ về tài khoản, vui lòng điền vào biểu mẫu dưới đây.
                        </p>
                        
                        <div className="bg-cloud-mist/50 p-8 rounded-2xl border border-platinum-tint max-w-2xl">
                            <form className="space-y-5" onSubmit={(e) => e.preventDefault()}>
                                <div>
                                    <label className="block text-sm font-bold text-midnight-indigo mb-1.5">Tiêu đề vấn đề</label>
                                    <input type="text" className="w-full px-4 py-2.5 rounded-xl border border-outline-gray focus:border-action-blue focus:ring-1 focus:ring-action-blue outline-none transition-all" placeholder="Ví dụ: Lỗi không nhận diện được khuôn mặt..." />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-midnight-indigo mb-1.5">Phân loại</label>
                                    <select className="w-full px-4 py-2.5 rounded-xl border border-outline-gray focus:border-action-blue focus:ring-1 focus:ring-action-blue outline-none transition-all bg-white">
                                        <option>Lỗi ứng dụng (Bug)</option>
                                        <option>Tài khoản & Đăng nhập</option>
                                        <option>Thiết bị phần cứng (Camera, Mic)</option>
                                        <option>Góp ý tính năng</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-midnight-indigo mb-1.5">Chi tiết</label>
                                    <textarea rows={5} className="w-full px-4 py-2.5 rounded-xl border border-outline-gray focus:border-action-blue focus:ring-1 focus:ring-action-blue outline-none transition-all resize-none" placeholder="Mô tả chi tiết lỗi bạn đang gặp phải..."></textarea>
                                </div>
                                <button className="px-6 py-3 bg-action-blue hover:bg-blue-700 text-white font-bold rounded-xl shadow-sm transition-colors mt-2">
                                    Gửi yêu cầu hỗ trợ
                                </button>
                            </form>
                        </div>
                    </div>
                );
            default:
                return null;
        }
    };

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-platinum-tint min-h-[calc(100vh-8rem)]">
            <div className="flex-1 max-w-[1200px] mx-auto w-full px-6 lg:px-10 py-8 lg:py-12 flex flex-col md:flex-row gap-10 md:gap-16 lg:gap-24">
                
                {/* Sidebar Navigation */}
                <aside className="w-full md:w-64 flex-shrink-0">
                    <div className="sticky top-28">
                        <nav className="flex flex-col space-y-2 border-l border-platinum-tint/50 pl-4 py-2">
                            {SECTIONS.map((section) => (
                                <div key={section.id} className="mb-2">
                                    {section.type === 'link' ? (
                                        <button
                                            onClick={() => handleTabClick(section.id)}
                                            className={`w-full text-left py-1.5 text-base transition-colors ${
                                                activeTab === section.id 
                                                    ? 'text-action-blue font-extrabold' 
                                                    : 'text-slate-blue font-medium hover:text-midnight-indigo'
                                            }`}
                                        >
                                            {section.title}
                                        </button>
                                    ) : (
                                        <div>
                                            <button
                                                onClick={() => toggleGroup(section.id)}
                                                className="w-full flex items-center justify-between py-1.5 text-base font-bold text-midnight-indigo transition-colors group"
                                            >
                                                <span className="group-hover:text-action-blue transition-colors">{section.title}</span>
                                                <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-300 ${expandedGroups[section.id] ? 'rotate-180' : ''}`} />
                                            </button>
                                            
                                            <div className={`overflow-hidden transition-all duration-300 ease-in-out ${expandedGroups[section.id] ? 'max-h-40 opacity-100 mt-2' : 'max-h-0 opacity-0'}`}>
                                                <div className="flex flex-col space-y-2.5 pl-3">
                                                    {section.children.map(child => (
                                                        <button
                                                            key={child.id}
                                                            onClick={() => handleTabClick(child.id)}
                                                            className={`w-full text-left text-sm transition-colors ${
                                                                activeTab === child.id
                                                                    ? 'text-action-blue font-bold'
                                                                    : 'text-slate-blue hover:text-midnight-indigo'
                                                            }`}
                                                        >
                                                            {child.title}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </nav>
                    </div>
                </aside>

                {/* Main Content */}
                <main className="flex-1 min-w-0 pb-20">
                    {renderContent()}
                </main>
            </div>
        </div>
    );
};

export default LegalAndSupport;
