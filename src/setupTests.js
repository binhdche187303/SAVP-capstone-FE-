// Bộ so khớp DOM (toBeInTheDocument, toHaveAttribute…) cho React Testing Library.
import '@testing-library/jest-dom';

// utils/backendResolver gọi /health của API thật ngay khi được import; test không được gọi ra ngoài.
jest.mock('./utils/backendResolver', () => ({
    backendReady: Promise.resolve(),
    getApiBaseUrl: () => 'http://localhost/api/v1',
    getWsBaseUrl: () => 'http://localhost',
}));
