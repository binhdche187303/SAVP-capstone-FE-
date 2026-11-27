import { useEffect, useState } from 'react';
import { API_BASE_URL } from '../../utils/request';

export const resolveAvatarUrl = (user) => {
    if (!user || typeof user !== 'object') return '';

    return user.avatarUrl
        || user.avatar_url
        || user.user?.avatarUrl
        || user.user?.avatar_url
        || user.profile?.avatarUrl
        || user.profile?.avatar_url
        || '';
};

const resolveDisplayName = (user, name) => name
    || user?.fullName
    || user?.full_name
    || user?.user?.fullName
    || user?.user?.full_name
    || '?';

const UserAvatar = ({
    user,
    src,
    name,
    alt,
    className = '',
    imageClassName = '',
}) => {
    const avatarUrl = src || resolveAvatarUrl(user);
    const displayName = resolveDisplayName(user, name);
    const [failedUrl, setFailedUrl] = useState('');

    let finalAvatarUrl = avatarUrl;
    if (finalAvatarUrl && finalAvatarUrl.startsWith('/uploads/')) {
        // Ảnh lưu local: backend phục vụ ở gốc /uploads (KHÔNG nằm dưới /api/v1). Ghép với origin
        // của API — chế độ 1 địa chỉ thì chính là địa chỉ đang mở, nên đổi IP → tên miền vẫn đúng.
        finalAvatarUrl = `${API_BASE_URL.replace(/\/api\/v1\/?$/, '')}${finalAvatarUrl}`;
    } else if (finalAvatarUrl && finalAvatarUrl.startsWith('/') && !finalAvatarUrl.startsWith('//')) {
        const token = localStorage.getItem('token');
        finalAvatarUrl = `${API_BASE_URL}${finalAvatarUrl}${finalAvatarUrl.includes('?') ? '&' : '?'}token=${token}`;
    }

    useEffect(() => {
        setFailedUrl('');
    }, [finalAvatarUrl]);

    const shouldShowImage = Boolean(finalAvatarUrl) && failedUrl !== finalAvatarUrl;

    return (
        <div
            className={`overflow-hidden bg-gradient-to-tr from-action-blue to-glacier-blue text-white flex items-center justify-center select-none ${className}`}
            aria-label={alt || `Ảnh đại diện của ${displayName}`}
        >
            {shouldShowImage ? (
                <img
                    src={finalAvatarUrl}
                    alt={alt || `Ảnh đại diện của ${displayName}`}
                    className={`w-full h-full object-cover ${imageClassName}`}
                    onError={() => setFailedUrl(finalAvatarUrl)}
                />
            ) : (
                <span aria-hidden="true">{displayName.trim().charAt(0).toUpperCase() || '?'}</span>
            )}
        </div>
    );
};

export default UserAvatar;
