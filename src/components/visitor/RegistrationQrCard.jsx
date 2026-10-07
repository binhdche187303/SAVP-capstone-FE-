import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Printer, QrCode } from 'lucide-react';
import SimpleModal from '../common/SimpleModal';
import { btnGhost, btnPrimary } from '../common/uiClasses';

// Chỉ in tấm áp phích QR: ẩn mọi thứ khác trên trang khi in.
const PRINT_CSS = `
@media print {
    body * { visibility: hidden !important; }
    .visitor-qr-poster, .visitor-qr-poster * { visibility: visible !important; }
    .visitor-qr-poster { position: fixed; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 24px; background: #fff; }
}`;

export const registrationUrl = () => `${window.location.origin}/visitor/register`;

// Mã QR dẫn tới trang đăng ký khách, để dán ở cổng và quầy lễ tân cho khách chưa đăng ký.
const RegistrationQrCard = () => {
    const [open, setOpen] = useState(false);
    const url = registrationUrl();
    return (
        <>
            <button type="button" className={btnGhost} onClick={() => setOpen(true)}>
                <QrCode className="w-4 h-4" /> Mã QR đăng ký
            </button>
            <SimpleModal
                isOpen={open}
                title="Mã QR đăng ký khách"
                size="sm"
                onClose={() => setOpen(false)}
                footer={<button type="button" className={btnPrimary} onClick={() => window.print()}><Printer className="w-4 h-4" /> In mã QR</button>}
            >
                <style>{PRINT_CSS}</style>
                <div className="visitor-qr-poster text-center space-y-4">
                    <p className="text-lg font-bold text-midnight-indigo">Khách đến làm việc</p>
                    <p className="text-xs text-slate-blue">Quét mã bằng điện thoại để đăng ký trước khi vào khuôn viên.</p>
                    <div className="inline-block p-3 bg-white rounded-xl border border-platinum-tint">
                        <QRCodeSVG value={url} size={220} level="M" />
                    </div>
                    <p className="text-xs font-mono text-midnight-indigo break-all">{url}</p>
                    <p className="text-[11px] text-slate-blue">Đăng ký xong, nhìn vào camera tại cổng để được xác thực bằng khuôn mặt.</p>
                </div>
            </SimpleModal>
        </>
    );
};

export default RegistrationQrCard;
