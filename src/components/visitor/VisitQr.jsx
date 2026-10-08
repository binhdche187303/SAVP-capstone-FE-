import { QRCodeSVG } from 'qrcode.react';

// QR dẫn tới trang tra cứu trạng thái công khai của lượt khách.
const VisitQr = ({ code, size = 160 }) => (
    <div className="inline-flex flex-col items-center gap-2 p-3 bg-white rounded-xl border border-platinum-tint">
        <QRCodeSVG value={`${window.location.origin}/visitor/status/${code}`} size={size} level="M" />
        <span className="text-sm font-bold tracking-wider text-midnight-indigo whitespace-nowrap">{code}</span>
    </div>
);

export default VisitQr;
