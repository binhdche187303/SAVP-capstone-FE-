import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import AuthLayout from "../../../components/auth/AuthLayout";
import AuthAlert from "../../../components/auth/AuthAlert";
import { exchangeSsoTicket } from "../../../service/authService";
import { saveLoginSession } from "../../../utils/authSession";

/** Mã lỗi BE (auth/sso) → thông báo cho người dùng. */
const SSO_ERROR_MESSAGES = {
    SSO_CANCELLED: "Bạn đã hủy đăng nhập bằng tài khoản UEL.",
    SSO_DISABLED: "Đăng nhập bằng tài khoản UEL hiện chưa được bật.",
    SSO_PROVIDER_ERROR: "Không kết nối được hệ thống đăng nhập UEL. Vui lòng thử lại sau.",
    SSO_INVALID_CALLBACK: "Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại.",
    SSO_STATE_INVALID: "Phiên đăng nhập đã hết hạn hoặc không hợp lệ. Vui lòng đăng nhập lại.",
    SSO_TICKET_INVALID: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.",
    SSO_ACCOUNT_INACTIVE: "Tài khoản UEL của bạn đang bị khóa hoặc ngưng hoạt động.",
    SSO_ACCOUNT_NOT_LINKED:
        "Tài khoản UEL của bạn chưa có trong hệ thống. Vui lòng liên hệ quản trị viên để được cấp quyền truy cập.",
    SSO_ACCOUNT_AMBIGUOUS:
        "Tài khoản UEL khớp với nhiều tài khoản trong hệ thống. Vui lòng liên hệ quản trị viên để kiểm tra.",
    AUTH_ACCOUNT_INACTIVE: "Tài khoản của bạn đã bị vô hiệu hóa. Vui lòng liên hệ quản trị viên.",
    AUTH_ACCOUNT_LOCKED: "Tài khoản của bạn đang bị khóa. Vui lòng liên hệ quản trị viên.",
    AUTH_ACCOUNT_EXPIRED: "Tài khoản của bạn đã hết hạn sử dụng. Vui lòng liên hệ quản trị viên.",
    AUTH_ACCOUNT_STATUS_NOT_ALLOWED: "Tài khoản của bạn hiện không được phép đăng nhập.",
};
const DEFAULT_ERROR = "Đăng nhập bằng tài khoản UEL thất bại. Vui lòng thử lại.";

/**
 * Trang BE chuyển về sau khi đăng nhập UEL: /sso/callback?ticket=... hoặc ?error=CODE.
 * Ticket dùng 1 lần, hết hạn sau 60 giây — đổi ngay lấy JWT rồi vào trang chủ theo vai trò.
 */
const SsoCallback = () => {
    const navigate = useNavigate();
    const [params] = useSearchParams();
    const [error, setError] = useState(null);
    // StrictMode chạy effect 2 lần ở dev — ticket chỉ đổi được 1 lần.
    const startedRef = useRef(false);

    useEffect(() => {
        if (startedRef.current) return;
        startedRef.current = true;

        const ticket = params.get("ticket");
        const errorCode = params.get("error");
        // Không để ticket nằm lại trên thanh địa chỉ / lịch sử.
        window.history.replaceState(null, "", window.location.pathname);

        if (errorCode || !ticket) {
            setError(SSO_ERROR_MESSAGES[errorCode] || DEFAULT_ERROR);
            return;
        }

        exchangeSsoTicket(ticket)
            .then((response) => {
                if (!response?.success || !response.data) throw new Error("invalid response");
                const path = saveLoginSession(response.data);
                navigate(path, { replace: true });
            })
            .catch((err) => {
                const code = err?.error?.code || err?.code || "";
                setError(SSO_ERROR_MESSAGES[code] || DEFAULT_ERROR);
            });
    }, [params, navigate]);

    return (
        <AuthLayout variant="login">
            <div className="flex flex-col w-full items-start gap-6">
                <h1 className="font-gilroy font-bold text-midnight-indigo text-3xl tracking-tight">
                    Đăng nhập bằng tài khoản UEL
                </h1>
                {error ? (
                    <>
                        <AuthAlert type="error" message={error} />
                        <Link
                            to="/login"
                            replace
                            className="w-full h-14 bg-gradient-to-r from-action-blue to-glacier-blue text-white rounded-full font-sans font-semibold text-base flex items-center justify-center hover:opacity-95"
                        >
                            Quay lại trang đăng nhập
                        </Link>
                    </>
                ) : (
                    <div className="flex items-center gap-4" role="status">
                        <div className="relative w-10 h-10">
                            <div className="absolute inset-0 rounded-full border-4 border-platinum-tint" />
                            <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-action-blue animate-spin" />
                        </div>
                        <p className="font-sans text-slate-blue">Đang hoàn tất đăng nhập...</p>
                    </div>
                )}
            </div>
        </AuthLayout>
    );
};

export default SsoCallback;
