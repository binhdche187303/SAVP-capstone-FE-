import { User } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';

import { useNavigate, useLocation } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { get } from '../../utils/request';
import { updateSelfProfile } from '../../service/employeeServices';
import { getBiometricStatus, updateSelfAvatar } from '../../service/avatarService';
import BiometricUploadForm from '../../components/biometric/BiometricUploadForm';

const STATUS_LABEL = {
    not_uploaded: { label: "Chưa nộp ảnh", badge: "bg-amber-50 text-amber-700 border border-amber-200" },
    pending_review: { label: "Đang chờ duyệt", badge: "bg-blue-50 text-action-blue border border-blue-200" },
    rejected: { label: "Bị từ chối", badge: "bg-red-50 text-red-700 border border-red-200" },
    approved: { label: "Đã duyệt", badge: "bg-green-50 text-green-700 border border-green-200" },
};

const Profile = () => {
    const navigate = useNavigate();
    const location = useLocation();

    const path = location.pathname;
    let rolePath = "/employee";
    let roleLabel = "Nhân viên";
    let showFaceRegisterBtn = false;
    let defaultMockCode = "NV003";
    let defaultMockEmail = "employee@smartracking.com";
    let defaultMockTitle = "Chuyên viên kỹ thuật";

    if (path.startsWith("/system-admin")) {
        rolePath = "/system-admin";
        roleLabel = "Quản trị hệ thống";
        defaultMockCode = "NV001";
        defaultMockEmail = "admin@smrmpts.com";
        defaultMockTitle = "Trưởng bộ phận Vận hành";
    } else if (path.startsWith("/business-admin")) {
        rolePath = "/business-admin";
        roleLabel = "Quản trị doanh nghiệp";
        defaultMockCode = "NV004";
        defaultMockEmail = "business@smartracking.com";
        defaultMockTitle = "Quản trị viên Doanh nghiệp";
    } else if (path.startsWith("/manager")) {
        rolePath = "/manager";
        roleLabel = "Quản lý";
        showFaceRegisterBtn = true;
        defaultMockCode = "NV002";
        defaultMockEmail = "manager@smartracking.com";
        defaultMockTitle = "Trưởng phòng Phát triển";
    } else if (path.startsWith("/guard")) {
        rolePath = "/guard";
        roleLabel = "Bảo vệ";
        defaultMockCode = "BV001";
        defaultMockEmail = "guard@smartracking.com";
        defaultMockTitle = "Nhân viên bảo vệ";
    } else if (path.startsWith("/teacher")) {
        rolePath = "/teacher";
        roleLabel = "Giảng viên";
        defaultMockCode = "GV001";
        defaultMockEmail = "teacher@smartracking.com";
        defaultMockTitle = "Giảng viên";
    } else if (path.startsWith("/student")) {
        rolePath = "/student";
        roleLabel = "Sinh viên";
        defaultMockCode = "SV001";
        defaultMockEmail = "student@smartracking.com";
        defaultMockTitle = "Sinh viên";
    } else if (path.startsWith("/employee")) {
        rolePath = "/employee";
        roleLabel = "Nhân viên";
        showFaceRegisterBtn = true;
        defaultMockCode = "NV003";
        defaultMockEmail = "employee@smartracking.com";
        defaultMockTitle = "Chuyên viên kỹ thuật";
    }

    const [loading, setLoading] = useState(true);
    const [updating, setUpdating] = useState(false);
    const [editMode, setEditMode] = useState(false);
    const [error, setError] = useState(null);
    const [successMessage, setSuccessMessage] = useState(null);
    
    // Biometric ID photo status
    const [biometricStatus, setBiometricStatus] = useState(null);
    const [biometricStatusLoading, setBiometricStatusLoading] = useState(false);
    const [biometricModalOpen, setBiometricModalOpen] = useState(false);
    
    // Avatar display photo status
    const [avatarModalOpen, setAvatarModalOpen] = useState(false);
    const [avatarFile, setAvatarFile] = useState(null);
    const [avatarPreviewUrl, setAvatarPreviewUrl] = useState(null);
    const [avatarUploadError, setAvatarUploadError] = useState(null);
    const [uploadingAvatar, setUploadingAvatar] = useState(false);

    const [profile, setProfile] = useState(null);
    const [formData, setFormData] = useState({
        fullName: "",
        phone: "",
        avatarFile: null,
        avatarPreview: ""
    });

    const fetchProfileData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const localUserStr = localStorage.getItem("user");
            if (!localUserStr) throw new Error("Không tìm thấy thông tin phiên làm việc.");
            const localUser = JSON.parse(localUserStr);
            const res = await get("/users/" + localUser.id);
            if (res?.success && res.data) {
                const data = res.data;
                setProfile(data);
                setFormData({
                    fullName: data.fullName || "",
                    phone: data.phoneNumber || data.phone || "",
                    avatarFile: null,
                    avatarPreview: data.avatarUrl || ""
                });
            } else {
                throw new Error("Không thể tải thông tin hồ sơ.");
            }
        } catch (err) {
            const localUserStr = localStorage.getItem("user");
            let localUser = {};
            if (localUserStr) { try { localUser = JSON.parse(localUserStr); } catch (e) {} }
            setProfile({ ...localUser });
            setFormData({
                fullName: localUser.fullName || "",
                phone: localUser.phoneNumber || localUser.phone || "",
                avatarFile: null,
                avatarPreview: localUser.avatarUrl || ""
            });
        } finally {
            setLoading(false);
        }
    }, [defaultMockEmail, defaultMockCode, defaultMockTitle, roleLabel]);

    const fetchBiometricStatus = useCallback(async () => {
        setBiometricStatusLoading(true);
        try {
            const res = await getBiometricStatus();
            if (res?.success && res.data) setBiometricStatus(res.data);
        } catch {} finally {
            setBiometricStatusLoading(false);
        }
    }, []);

    useEffect(() => { fetchProfileData(); }, [fetchProfileData]);
    useEffect(() => { if (showFaceRegisterBtn) fetchBiometricStatus(); }, [fetchBiometricStatus, showFaceRegisterBtn]);

    useEffect(() => {
        if (profile && profile.hasFaceProfile === false) {
            setBiometricModalOpen(true);
        }
    }, [profile]);

    useEffect(() => {
        if (successMessage) { const t = setTimeout(() => setSuccessMessage(null), 3000); return () => clearTimeout(t); }
    }, [successMessage]);
    useEffect(() => {
        if (error) { const t = setTimeout(() => setError(null), 3000); return () => clearTimeout(t); }
    }, [error]);

    const handleAvatarFileSelect = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!file.type.startsWith("image/")) {
            setAvatarUploadError("Định dạng tệp không được hỗ trợ. Vui lòng chọn ảnh (.png, .jpg, .jpeg, .webp).");
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            setAvatarUploadError("Dung lượng ảnh vượt quá giới hạn 5MB. Vui lòng chọn ảnh khác.");
            return;
        }
        setAvatarFile(file);
        setAvatarPreviewUrl(URL.createObjectURL(file));
        setAvatarUploadError(null);
    };

    const handleAvatarUpload = async () => {
        if (!avatarFile) return;
        setUploadingAvatar(true);
        setAvatarUploadError(null);
        try {
            const res = await updateSelfAvatar(avatarFile);
            if (res?.success && res.data?.avatarUrl) {
                const newUrl = res.data.avatarUrl;
                setProfile(prev => ({ ...prev, avatarUrl: newUrl }));
                setFormData(prev => ({ ...prev, avatarPreview: newUrl }));
                
                // Update local storage
                const localUserStr = localStorage.getItem("user");
                if (localUserStr) {
                    try {
                        const localUser = JSON.parse(localUserStr);
                        localUser.avatarUrl = newUrl;
                        localStorage.setItem("user", JSON.stringify(localUser));
                        window.dispatchEvent(new Event("storage"));
                    } catch (e) {}
                }
                setSuccessMessage("Cập nhật ảnh đại diện thành công.");
                setAvatarModalOpen(false);
                setAvatarFile(null);
                setAvatarPreviewUrl(null);
            } else {
                setAvatarUploadError(res?.error?.message || "Cập nhật ảnh đại diện thất bại.");
            }
        } catch (err) {
            setAvatarUploadError(err?.error?.message || "Lỗi kết nối hệ thống.");
        } finally {
            setUploadingAvatar(false);
        }
    };

    const handleBiometricUploadSuccess = () => {
        fetchBiometricStatus();
        setSuccessMessage("Ảnh sinh trắc học đã được gửi đi và đang chờ duyệt.");
        setBiometricModalOpen(false);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(null);
        setSuccessMessage(null);
        setUpdating(true);
        const phoneRegex = /^[0-9]+$/;
        if (formData.phone && !phoneRegex.test(formData.phone)) {
            setError("Số điện thoại không hợp lệ. Vui lòng chỉ nhập các chữ số.");
            setUpdating(false);
            return;
        }
        try {
            const localUserStr = localStorage.getItem("user");
            if (!localUserStr) throw new Error("Không tìm thấy thông tin phiên làm việc.");
            const localUser = JSON.parse(localUserStr);
            const userId = localUser.id;
            const payload = { fullName: formData.fullName, phoneNumber: formData.phone };
            const res = await updateSelfProfile(userId, payload);
            if (res?.success) {
                setSuccessMessage("Cập nhật thông tin cá nhân thành công.");
                setEditMode(false);
                localUser.fullName = payload.fullName;
                localStorage.setItem("user", JSON.stringify(localUser));
                window.dispatchEvent(new Event("storage"));
                fetchProfileData();
            } else {
                setError(res?.message || "Không thể cập nhật thông tin cá nhân.");
            }
        } catch (err) {
            setError(err?.message || err?.error?.message || "Thao tác thất bại. Không thể kết nối tới server.");
        } finally {
            setUpdating(false);
        }
    };

    const handleCancel = () => {
        setEditMode(false);
        if (profile) {
            setFormData({
                fullName: profile.fullName || "",
                phone: profile.phoneNumber || profile.phone || "",
                avatarFile: null,
                avatarPreview: profile.avatarUrl || ""
            });
        }
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px]">
                <div className="w-10 h-10 border-4 border-action-blue border-t-transparent rounded-full animate-spin"></div>
                <p className="mt-4 text-slate-blue text-sm font-medium">Đang tải hồ sơ cá nhân...</p>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-fade-in-up max-w-5xl mx-auto">
            <div>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-blue-50 text-action-blue mb-2">
                    <User className="w-3.5 h-3.5" />
                    Cá nhân
                </span>
                <h1 className="text-2xl font-bold text-midnight-indigo tracking-tight">Hồ sơ cá nhân</h1>
                <p className="text-slate-blue text-sm mt-1">Xem chi tiết thông tin hồ sơ của bạn và cấu hình sinh trắc học FaceID.</p>
            </div>

            {successMessage && (
                <div className="p-4 bg-green-50 border border-green-200 rounded-xl text-green-700 text-sm flex items-center gap-3 animate-pulse-soft">
                    <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>{successMessage}</span>
                </div>
            )}
            {error && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex items-center gap-3 animate-pulse-soft">
                    <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <span>{error}</span>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="md:col-span-1 bg-white p-6 rounded-2xl border border-platinum-tint shadow-sm-2 flex flex-col items-center text-center">
                    <div className="relative group w-32 h-32 rounded-full overflow-hidden ring-4 ring-action-blue/10 bg-gradient-to-tr from-action-blue to-glacier-blue flex items-center justify-center text-white text-4xl font-extrabold select-none mb-4">
                        {formData.avatarPreview ? (
                            <img src={formData.avatarPreview} alt="Profile Avatar" className="w-full h-full object-cover" />
                        ) : (
                            (profile?.fullName?.charAt(0)?.toUpperCase() || "?")
                        )}
                        <div 
                            onClick={() => setAvatarModalOpen(true)}
                            className="absolute inset-0 bg-midnight-indigo/70 text-white flex flex-col items-center justify-center cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                        >
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            <span className="text-[10px] font-bold mt-1 uppercase">Đổi ảnh</span>
                        </div>
                    </div>
                    
                    <button
                        type="button"
                        onClick={() => setAvatarModalOpen(true)}
                        className="mb-4 inline-flex items-center gap-1.5 px-3 py-1.5 bg-action-blue/10 hover:bg-action-blue hover:text-white text-action-blue rounded-xl text-xs font-bold transition-all"
                    >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        Đổi ảnh đại diện
                    </button>
                    <h3 className="text-lg font-bold text-midnight-indigo leading-tight">{profile?.fullName || ""}</h3>
                    <p className="text-xs text-slate-blue mt-1">{profile?.email || ""}</p>
                    <div className="flex flex-wrap gap-1.5 justify-center mt-3">
                        <span className="inline-flex text-[10px] px-2.5 py-0.5 bg-blue-50 text-action-blue rounded-full font-bold">{roleLabel}</span>
                    </div>

                    {showFaceRegisterBtn && !biometricStatusLoading && biometricStatus && (
                        <div className="w-full mt-3">
                            <div className="w-full flex flex-col p-3 bg-cloud-mist rounded-xl border border-outline-gray/60">
                                <span className="block text-[10px] font-bold text-slate-blue uppercase text-left">Trạng thái duyệt ảnh FaceID</span>
                                <span className={"inline-flex self-start mt-1.5 text-[10px] px-2 py-0.5 rounded-full font-semibold " + ((STATUS_LABEL[biometricStatus.biometricReviewStatus] || STATUS_LABEL.not_uploaded).badge)}>
                                    {(STATUS_LABEL[biometricStatus.biometricReviewStatus] || STATUS_LABEL.not_uploaded).label}
                                </span>
                                {biometricStatus.biometricReviewStatus === "rejected" && biometricStatus.message && (
                                    <p className="text-[10px] text-red-600 mt-1.5 text-left leading-relaxed">{biometricStatus.message}</p>
                                )}
                                {biometricStatus.biometricReviewStatus === "approved" && (
                                    <p className="text-[10px] text-green-600 mt-1.5 text-left">Ảnh sinh trắc học đã được duyệt.</p>
                                )}
                                
                                {(biometricStatus.biometricReviewStatus === "rejected" || biometricStatus.biometricReviewStatus === "not_uploaded") && (
                                    <button
                                        type="button"
                                        onClick={() => setBiometricModalOpen(true)}
                                        className="mt-3 w-full py-2 bg-action-blue hover:bg-glacier-blue text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-1.5"
                                    >
                                        Nộp ảnh sinh trắc học FaceID
                                    </button>
                                )}
                            </div>
                        </div>
                    )}

                    {showFaceRegisterBtn && (<>
                    <div className="w-full border-t border-platinum-tint/60 my-5" />
                    <div className="w-full flex flex-col gap-3.5 p-3.5 bg-cloud-mist rounded-xl border border-outline-gray/60">
                        <div className="flex items-center justify-between w-full">
                            <div className="text-left">
                                <span className="block text-xs font-bold text-slate-blue uppercase">Hồ sơ khuôn mặt</span>
                                <span className="text-xs text-steel-gray mt-0.5 block">Dữ liệu FaceID</span>
                            </div>
                            <span className={"inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold " + (profile?.hasFaceProfile ? "bg-green-50 text-green-700 border border-green-200" : "bg-amber-50 text-amber-700 border border-amber-200")}>
                                {profile?.hasFaceProfile ? "Đã hợp lệ" : "Chưa đăng ký"}
                            </span>
                        </div>
                        <button type="button" onClick={() => navigate(rolePath + "/face-register")} className="w-full py-2 bg-action-blue hover:bg-glacier-blue text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-1.5">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v1m6 11h2m-6 0h-2v4m0-16v.01M4 12H2m2 0h2v-4m0 16v.01M8 12v.01M16 12v.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                            </svg>
                            {profile?.hasFaceProfile ? "Cập nhật khuôn mặt" : "Đăng ký khuôn mặt ngay"}
                        </button>
                    </div>
                    </>)}
                </div>

                <div className="md:col-span-2 space-y-6">
                    <div className="bg-white p-6 rounded-2xl border border-platinum-tint shadow-sm-2">
                        <div className="flex items-center justify-between border-b border-platinum-tint/60 pb-4 mb-4">
                            <h2 className="text-base font-bold text-midnight-indigo">Thông tin cá nhân</h2>
                            {!editMode ? (
                                <button onClick={() => setEditMode(true)} className="inline-flex items-center justify-center px-3 py-1.5 border border-platinum-tint bg-white text-action-blue hover:bg-cloud-mist rounded-lg text-xs font-semibold transition-all">
                                    <svg className="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                    </svg>
                                    Chỉnh sửa
                                </button>
                            ) : (
                                <div className="flex gap-2">
                                    <button onClick={handleSubmit} disabled={updating} className="px-4 py-2 bg-action-blue text-white rounded-lg text-xs font-semibold disabled:opacity-50">
                                        Lưu lại
                                    </button>
                                    <button onClick={handleCancel} className="px-4 py-2 border border-platinum-tint bg-white text-slate-blue rounded-lg text-xs font-semibold">
                                        Hủy
                                    </button>
                                </div>
                            )}
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-blue uppercase mb-1.5">Họ và tên</label>
                                    <input
                                        type="text"
                                        disabled={!editMode || updating}
                                        value={formData.fullName}
                                        onChange={(e) => setFormData(prev => ({ ...prev, fullName: e.target.value }))}
                                        required
                                        className="w-full px-3 py-2 border border-platinum-tint rounded-xl text-sm focus:outline-none focus:border-action-blue disabled:bg-cloud-mist/30 text-midnight-indigo font-medium"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-blue uppercase mb-1.5">Số điện thoại</label>
                                    <input
                                        type="text"
                                        disabled={!editMode || updating}
                                        value={formData.phone}
                                        onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                                        className="w-full px-3 py-2 border border-platinum-tint rounded-xl text-sm focus:outline-none focus:border-action-blue disabled:bg-cloud-mist/30 text-midnight-indigo font-medium"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                                <div>
                                    <span className="block text-xs font-bold text-slate-blue uppercase mb-1.5">Mã nhân viên</span>
                                    <span className="text-sm font-semibold text-midnight-indigo block px-3 py-2 bg-cloud-mist/30 border border-platinum-tint/50 rounded-xl">{profile?.employeeCode || ""}</span>
                                </div>
                                <div>
                                    <span className="block text-xs font-bold text-slate-blue uppercase mb-1.5">Địa chỉ Email</span>
                                    <span className="text-sm font-semibold text-midnight-indigo block px-3 py-2 bg-cloud-mist/30 border border-platinum-tint/50 rounded-xl">{profile?.email || ""}</span>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                                <div>
                                    <span className="block text-xs font-bold text-slate-blue uppercase mb-1.5">Phòng ban</span>
                                    <span className="text-sm font-semibold text-midnight-indigo block px-3 py-2 bg-cloud-mist/30 border border-platinum-tint/50 rounded-xl">{profile?.department?.departmentName || profile?.department?.name || "Chưa có"}</span>
                                </div>
                                <div>
                                    <span className="block text-xs font-bold text-slate-blue uppercase mb-1.5">Chức vụ</span>
                                    <span className="text-sm font-semibold text-midnight-indigo block px-3 py-2 bg-cloud-mist/30 border border-platinum-tint/50 rounded-xl">{profile?.positionTitle || "Chưa có"}</span>
                                </div>
                            </div>
                        </form>
                    </div>

                    <div className="bg-white p-6 rounded-2xl border border-platinum-tint shadow-sm-2">
                        <div className="border-b border-platinum-tint/60 pb-4 mb-4">
                            <h2 className="text-base font-bold text-midnight-indigo">Cơ cấu quản lý</h2>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                            <div className="flex items-center gap-3.5 text-left">
                                <div className="w-10 h-10 rounded-xl bg-blue-50 text-action-blue flex items-center justify-center">
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                                    </svg>
                                </div>
                                <div>
                                    <span className="block text-[11px] font-bold text-slate-blue/85 uppercase tracking-wider">Bộ phận trực thuộc</span>
                                    <span className="text-sm font-bold text-midnight-indigo mt-1 block">{profile?.department?.departmentName || profile?.department?.name || "Chưa trực thuộc"}</span>
                                </div>
                            </div>
                            <div className="flex items-center gap-3.5 text-left">
                                <div className="w-10 h-10 rounded-xl bg-purple-50 text-royal-amethyst flex items-center justify-center">
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                    </svg>
                                </div>
                                <div>
                                    <span className="block text-[11px] font-bold text-slate-blue/85 uppercase tracking-wider">Quản lý trực tiếp</span>
                                    <span className="text-sm font-bold text-midnight-indigo mt-1 block">{profile?.directManager?.fullName || "Không có quản lý"}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white p-6 rounded-2xl border border-platinum-tint shadow-sm-2">
                        <div className="border-b border-platinum-tint/60 pb-4 mb-4">
                            <h2 className="text-base font-bold text-midnight-indigo">Thông tin hệ thống</h2>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-left">
                            <div>
                                <span className="block text-xs font-bold text-slate-blue uppercase">Trạng thái tài khoản</span>
                                <span className={"inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold mt-1.5 " + (profile?.accountStatus === "active" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700")}>{profile?.accountStatus === "active" ? "Hoạt động" : "Bị khóa"}</span>
                            </div>
                            <div>
                                <span className="block text-xs font-bold text-slate-blue uppercase">Đăng nhập cuối cùng</span>
                                <span className="text-xs font-semibold text-midnight-indigo mt-2.5 block">{profile?.lastLoginAt ? new Date(profile.lastLoginAt).toLocaleString("vi-VN") : "Chưa có thông tin"}</span>
                            </div>
                            <div>
                                <span className="block text-xs font-bold text-slate-blue uppercase">Ngày tạo tài khoản</span>
                                <span className="text-xs font-semibold text-midnight-indigo mt-2.5 block">{profile?.createdAt ? new Date(profile.createdAt).toLocaleDateString("vi-VN") : "Chưa rõ"}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Direct Avatar Upload Modal */}
            {createPortal(
                <AnimatePresence>
                    {avatarModalOpen && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/60 backdrop-blur-xl p-4"
                        >
                            <motion.div
                                initial={{ scale: 0.95, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0.95, opacity: 0 }}
                                className="bg-white rounded-2xl border border-platinum-tint shadow-lg w-full max-w-md p-6"
                            >
                                <div className="flex justify-between items-center border-b border-platinum-tint pb-3 mb-4">
                                    <h3 className="text-base font-bold text-midnight-indigo">Cập nhật ảnh đại diện</h3>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setAvatarModalOpen(false);
                                            setAvatarFile(null);
                                            setAvatarPreviewUrl(null);
                                            setAvatarUploadError(null);
                                        }}
                                        className="p-1 rounded-full text-slate-blue hover:text-midnight-indigo hover:bg-cloud-mist/60 transition-colors"
                                    >
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                </div>
                                
                                <div className="space-y-4">
                                    <div className="flex flex-col items-center gap-3">
                                        <div className="relative w-28 h-28 rounded-full overflow-hidden ring-4 ring-action-blue/10 bg-gradient-to-tr from-action-blue to-glacier-blue flex items-center justify-center text-white text-3xl font-extrabold select-none">
                                            {avatarPreviewUrl ? (
                                                <img src={avatarPreviewUrl} alt="Preview" className="w-full h-full object-cover" />
                                            ) : formData.avatarPreview ? (
                                                <img src={formData.avatarPreview} alt="Preview" className="w-full h-full object-cover" />
                                            ) : (
                                                <svg className="w-10 h-10 text-white/70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                                </svg>
                                            )}
                                        </div>

                                        <label className="cursor-pointer inline-flex items-center gap-1.5 px-4 py-2 bg-action-blue hover:bg-glacier-blue text-white rounded-xl text-xs font-semibold transition-all shadow-sm">
                                            Chọn ảnh đại diện
                                            <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleAvatarFileSelect} />
                                        </label>
                                        <span className="text-[10px] text-steel-gray">Hỗ trợ JPG, PNG, WEBP — tối đa 5MB</span>
                                    </div>

                                    {avatarUploadError && (
                                        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs flex items-start gap-2">
                                            <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                            </svg>
                                            <span>{avatarUploadError}</span>
                                        </div>
                                    )}

                                    <div className="flex gap-3 pt-2 border-t border-platinum-tint mt-4">
                                        <button
                                            type="button"
                                            onClick={handleAvatarUpload}
                                            disabled={uploadingAvatar || !avatarFile}
                                            className="flex-1 py-2 bg-action-blue hover:bg-glacier-blue text-white rounded-xl text-xs font-semibold shadow-sm transition-all disabled:opacity-40"
                                        >
                                            {uploadingAvatar ? "Đang tải lên..." : "Lưu ảnh đại diện"}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setAvatarModalOpen(false);
                                                setAvatarFile(null);
                                                setAvatarPreviewUrl(null);
                                                setAvatarUploadError(null);
                                            }}
                                            className="py-2 px-4 border border-platinum-tint bg-white text-slate-blue hover:bg-cloud-mist rounded-xl text-xs font-semibold transition-all"
                                        >
                                            Hủy
                                        </button>
                                    </div>
                                </div>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>,
                document.body
            )}

            {/* Biometric FaceID Upload Modal — chỉ hiển thị với employee/manager */}
            {showFaceRegisterBtn && createPortal(
                <AnimatePresence>
                    {biometricModalOpen && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/60 backdrop-blur-xl p-4"
                        >
                            <motion.div
                                initial={{ scale: 0.95, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0.95, opacity: 0 }}
                                className="bg-white rounded-2xl border border-platinum-tint shadow-lg w-full max-w-md p-6"
                            >
                                <div className="flex justify-between items-center border-b border-platinum-tint pb-3 mb-4">
                                    <h3 className="text-base font-bold text-midnight-indigo">Nộp ảnh sinh trắc học FaceID</h3>
                                    {profile?.hasFaceProfile !== false && (
                                        <button
                                            type="button"
                                            onClick={() => setBiometricModalOpen(false)}
                                            className="p-1 rounded-full text-slate-blue hover:text-midnight-indigo hover:bg-cloud-mist/60 transition-colors"
                                        >
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                        </button>
                                    )}
                                </div>
                                
                                <BiometricUploadForm 
                                    compact 
                                    onSuccess={handleBiometricUploadSuccess} 
                                    onCancel={profile?.hasFaceProfile === false ? undefined : () => setBiometricModalOpen(false)} 
                                />
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>,
                document.body
            )}
        </div>
    );
};

export default Profile;
