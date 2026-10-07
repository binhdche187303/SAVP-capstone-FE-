import { useId, useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { setTokens, getAccessToken } from "../../../utils/request";
import { login as authLogin } from "../../../service/authService";
import AuthFormSkeleton from "../../../components/common/Skeleton/AuthFormSkeleton";
import AuthLayout from "../../../components/auth/AuthLayout";
import AuthAlert from "../../../components/auth/AuthAlert";
import PasswordInput from "../../../components/auth/PasswordInput";
import AuthTextInput from "../../../components/auth/AuthTextInput";

/**
 * Determines redirect path based on user roles from API response.
 * API returns: user.roles: string[] (e.g. ["ADMIN"], ["MANAGER"], ["EMPLOYEE"])
 */
const getRedirectPathByRoles = (roles) => {
    if (!roles || !Array.isArray(roles) || roles.length === 0) {
        return '/employee';
    }
    const normalizedRoles = roles.map(r => (typeof r === 'string' ? r : r.roleCode || r.role_code || '').toUpperCase());
    if (normalizedRoles.includes('SYSTEM_ADMIN') || normalizedRoles.includes('ADMIN')) {
        return '/system-admin';
    }
    if (normalizedRoles.includes('BUSINESS_ADMIN')) {
        return '/business-admin';
    }
    if (normalizedRoles.includes('MANAGER')) {
        return '/manager';
    }
    return '/employee';
};

const Login = () => {
    const navigate = useNavigate();
    const emailId = useId();
    const passwordId = useId();
    const rememberId = useId();

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [rememberLogin, setRememberLogin] = useState(false);

    // Initial skeleton loading state (check existing session)
    const [initialLoading, setInitialLoading] = useState(true);

    // API interaction states
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [redirecting, setRedirecting] = useState(false);

    // Client-side validation states (E1)
    const [emailError, setEmailError] = useState(null);
    const [passwordError, setPasswordError] = useState(null);

    // Check for existing session on mount — show skeleton while checking
    useEffect(() => {
        const token = getAccessToken();
        if (token) {
            // User already has a token, try to get stored user info and redirect
            try {
                const storedUser = JSON.parse(localStorage.getItem('user') || 'null');
                if (storedUser && storedUser.roles) {
                    const redirectPath = getRedirectPathByRoles(storedUser.roles);
                    navigate(redirectPath, { replace: true });
                    return;
                }
            } catch (e) {
                // Invalid stored user, continue to login
            }
        }

        // Load remembered email
        const remembered = localStorage.getItem('rememberedEmail');
        if (remembered) {
            setEmail(remembered);
            setRememberLogin(true);
        }

        // Small delay for skeleton to show smoothly, then reveal the form
        const timer = setTimeout(() => {
            setInitialLoading(false);
        }, 600);
        return () => clearTimeout(timer);
    }, [navigate]);

    const handleSubmit = async (event) => {
        event.preventDefault();

        // Client-side validation (E1)
        let hasError = false;
        setEmailError(null);
        setPasswordError(null);
        setError(null);

        const trimmedEmail = email.trim();

        if (!trimmedEmail) {
            setEmailError("Vui lòng nhập email");
            hasError = true;
        } else {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(trimmedEmail)) {
                setEmailError("Email không đúng định dạng");
                hasError = true;
            }
        }

        if (!password) {
            setPasswordError("Vui lòng nhập mật khẩu");
            hasError = true;
        }

        if (hasError) {
            return;
        }

        setLoading(true);

        try {
            // UC-AUTH-01 Đăng nhập hệ thống (POST /api/v1/auth/login, public)
            const response = await authLogin(trimmedEmail, password);

            if (response.success && response.data) {
                const { accessToken, refreshToken, user } = response.data;

                // Store tokens in localStorage for request header injection and rotation
                setTokens(accessToken, refreshToken);

                // Store user information if needed
                localStorage.setItem("user", JSON.stringify(user));
                if (rememberLogin) {
                    localStorage.setItem("rememberedEmail", trimmedEmail);
                } else {
                    localStorage.removeItem("rememberedEmail");
                }

                setRedirecting(true);

                // Redirect user to the app dashboard based on role
                const redirectPath = getRedirectPathByRoles(user?.roles);
                setTimeout(() => {
                    navigate(redirectPath, { replace: true });
                }, 1200);
            }
        } catch (err) {
            // Handle error response matching backend envelope
            const rawMessage = err.error?.message || err.message || "";
            const code = err.error?.code || err.code || "";
            let message = "Đăng nhập thất bại. Vui lòng thử lại.";

            // Ưu tiên nhận diện qua `code` (AUTH_ERROR_CODES ở BE) — đáng tin cậy hơn
            // parse substring message tiếng Anh, tránh nhầm lẫn (vd tài khoản hết hạn
            // từng bị rơi vào thông báo chung chung "kiểm tra lại thông tin").
            switch (code) {
                case "AUTH_INVALID_CREDENTIALS":
                    message = "Sai email hoặc mật khẩu. Vui lòng thử lại.";
                    break;
                case "AUTH_ACCOUNT_EXPIRED":
                    message = "Tài khoản của bạn đã hết hạn sử dụng. Vui lòng liên hệ quản trị viên để được gia hạn.";
                    break;
                case "AUTH_ACCOUNT_LOCKED":
                    message = "Tài khoản của bạn đã bị khóa. Vui lòng liên hệ quản trị viên.";
                    break;
                case "AUTH_ACCOUNT_INACTIVE":
                    message = "Tài khoản của bạn đã bị vô hiệu hóa. Vui lòng liên hệ quản trị viên.";
                    break;
                case "AUTH_ACCOUNT_STATUS_NOT_ALLOWED":
                    message = "Tài khoản của bạn hiện không thể đăng nhập. Vui lòng liên hệ quản trị viên.";
                    break;
                case "AUTH_TOO_MANY_ATTEMPTS":
                    message = "Bạn đã đăng nhập sai quá nhiều lần. Vui lòng thử lại sau ít phút.";
                    break;
                default: {
                    // Fallback cho lỗi không có code chuẩn (lỗi mạng, lỗi hệ thống khác)
                    const lowerMsg = rawMessage.toLowerCase();
                    if (lowerMsg.includes("invalid credentials") || lowerMsg.includes("unauthorized")) {
                        message = "Sai email hoặc mật khẩu. Vui lòng thử lại.";
                    } else if (lowerMsg.includes("not found")) {
                        message = "Tài khoản không tồn tại trong hệ thống.";
                    } else if (lowerMsg.includes("too many login attempts") || lowerMsg.includes("too many requests")) {
                        message = "Bạn đã đăng nhập sai quá nhiều lần. Vui lòng thử lại sau ít phút.";
                    } else if (rawMessage) {
                        // Không hiển thị trực tiếp log lỗi tiếng Anh từ BE
                        // Nếu là tiếng Việt thì giữ nguyên, còn không thì dùng lỗi chung
                        const isVietnamese = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(rawMessage);
                        message = isVietnamese ? rawMessage : "Đăng nhập thất bại. Vui lòng kiểm tra lại thông tin.";
                    }
                }
            }

            setError(message);
        } finally {
            setLoading(false);
        }
    };

    // Show skeleton while initial session check is in progress
    if (initialLoading) {
        return <AuthFormSkeleton variant="login" />;
    }

    // Fullscreen loading overlay after successful login
    if (redirecting) {
        return (
            <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-white">
                <div className="flex flex-col items-center gap-6">
                    {/* Spinner */}
                    <div className="relative w-16 h-16">
                        <div className="absolute inset-0 rounded-full border-4 border-platinum-tint" />
                        <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-action-blue animate-spin" />
                    </div>
                    <div className="text-center">
                        <p className="text-xl font-gilroy font-bold text-midnight-indigo">Đăng nhập thành công!</p>
                        <p className="text-sm font-sans text-slate-blue mt-1">Đang chuyển hướng đến trang chủ...</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <AuthLayout variant="login">
            <div className="flex flex-col w-full items-start gap-8">
                <header className="flex flex-col items-start gap-3 w-full">
                    <h1 className="font-gilroy font-bold text-midnight-indigo text-4xl tracking-tight">
                        Chào mừng trở lại
                    </h1>
                    <p className="font-sans font-normal text-slate-blue text-base">
                        Đăng nhập để quản lý khuôn viên của bạn
                    </p>
                </header>

                <AuthAlert type="error" message={error} />

                <form
                    className="flex flex-col w-full items-start gap-6"
                    onSubmit={handleSubmit}
                >
                    {/* Email Input */}
                    <div className="flex flex-col items-start gap-2 w-full">
                        <label
                            className="sr-only"
                            htmlFor={emailId}
                        >
                            Email hoặc Tên đăng nhập
                        </label>
                        <AuthTextInput
                            id={emailId}
                            name="email"
                            placeholder="Email hoặc Tên đăng nhập"
                            autoComplete="email"
                            value={email}
                            error={emailError}
                            onChange={(event) => {
                                setEmail(event.target.value);
                                if (emailError) setEmailError(null);
                            }}
                            disabled={loading}
                        />
                        {emailError && (
                            <span className="text-red-500 text-xs font-semibold font-sans">
                                {emailError}
                            </span>
                        )}
                    </div>

                    {/* Password Input */}
                    <div className="flex flex-col items-start gap-2 w-full">
                        <label
                            htmlFor={passwordId}
                            className="sr-only"
                        >
                            Mật khẩu
                        </label>
                        <PasswordInput
                            id={passwordId}
                            placeholder="Mật khẩu"
                            value={password}
                            onChange={(event) => {
                                setPassword(event.target.value);
                                if (passwordError) setPasswordError(null);
                            }}
                            error={passwordError}
                            disabled={loading}
                        />
                        {passwordError && (
                            <span className="text-red-500 text-xs font-semibold font-sans">
                                {passwordError}
                            </span>
                        )}
                    </div>

                    {/* Remember me & Forgot Password */}
                    <div className="flex items-center justify-between w-full mt-2">
                        <div className="flex items-center gap-2">
                            <input
                                id={rememberId}
                                name="remember"
                                type="checkbox"
                                checked={rememberLogin}
                                onChange={(event) => setRememberLogin(event.target.checked)}
                                className="w-4 h-4 bg-white rounded border border-solid border-platinum-tint cursor-pointer checked:bg-action-blue checked:border-action-blue focus-visible:ring-2 focus-visible:ring-action-blue focus-visible:ring-offset-2"
                                disabled={loading}
                            />
                            <label
                                htmlFor={rememberId}
                                className="font-sans font-medium text-slate-blue text-sm cursor-pointer select-none hover:text-midnight-indigo transition-colors"
                            >
                                Ghi nhớ đăng nhập
                            </label>
                        </div>
                        <Link
                            to="/forgot-password"
                            className="font-sans font-semibold text-action-blue text-sm hover:text-[#0054cc] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action-blue focus-visible:ring-offset-2 rounded-sm"
                        >
                            Quên mật khẩu?
                        </Link>
                    </div>

                    {/* Submit Button */}
                    <button
                        type="submit"
                        disabled={loading}
                        className={`mt-4 w-full h-14 bg-gradient-to-r from-action-blue to-glacier-blue text-white rounded-full font-sans font-semibold text-base shadow-md shadow-action-blue/20 hover:opacity-95 transition-opacity focus-visible:ring-2 focus-visible:ring-action-blue focus-visible:ring-offset-2 flex items-center justify-center gap-2 ${loading ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer'}`}
                    >
                        {loading ? "Đang xử lý..." : "Đăng nhập"}
                    </button>
                </form>
                {/* Lối vào cho khách đến làm việc (2.10) — không cần tài khoản */}
                <p className="mt-6 text-center text-sm text-slate-blue">
                    Khách đến làm việc?{' '}
                    <Link to="/visitor/register" className="font-semibold text-action-blue hover:underline">Đăng ký tại đây</Link>
                    {' · '}
                    <Link to="/visitor/status" className="font-semibold text-action-blue hover:underline">Tra cứu đăng ký</Link>
                </p>
            </div>
        </AuthLayout>
    );
};

export default Login;
