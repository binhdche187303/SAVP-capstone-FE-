import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import BiometricSubmissionsReview from './BiometricSubmissionsReview';
import { getAvatarSubmissions } from '../../service/avatarReviewService';
import { getDepartments } from '../../service/sysAdminServices';

jest.mock('../../service/avatarReviewService', () => ({
    getAvatarSubmissions: jest.fn(),
    getAvatarSubmissionDetail: jest.fn(),
    getAvatarDownloadUrl: jest.fn(),
    approveAvatarSubmission: jest.fn(),
    rejectAvatarSubmission: jest.fn(),
}));
jest.mock('../../service/sysAdminServices', () => ({ getDepartments: jest.fn() }));
jest.mock('../../service/businessAdminServices', () => ({ getUserById: jest.fn() }));

beforeEach(() => {
    getAvatarSubmissions.mockResolvedValue({
        success: true,
        data: [],
        meta: { page: 1, limit: 10, total: 0, totalPages: 1 },
    });
    getDepartments.mockResolvedValue({ success: true, data: [] });
});

test('uses the new identification-list title and keeps refresh information in the header', async () => {
    render(
        <MemoryRouter initialEntries={['/business-admin/biometric-submissions']}>
            <BiometricSubmissionsReview />
        </MemoryRouter>,
    );

    await screen.findByText('Không có hồ sơ nào.');
    expect(screen.getByRole('heading', { name: 'Danh sách định danh' })).toBeInTheDocument();
    expect(screen.getByText('Định danh')).toBeInTheDocument();
    expect(screen.getByText(/Lần cuối làm mới lúc:/)).toBeInTheDocument();
    expect(screen.queryByText('Hậu kiểm FaceID')).not.toBeInTheDocument();
});
