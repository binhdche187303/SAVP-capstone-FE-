import { useParams } from 'react-router-dom';

import { MEETING_CALENDAR_MOCK_ENABLED } from '../../config/featureFlags';
import { isMockMeetingId } from '../../mocks/meetingCalendarMock';
import EmployeeMeetingDetail from './MeetingDetail';
import MockMeetingDetailPage from './MockMeetingDetailPage';

// MOCK-BE: id `mock-…` (lịch VPĐT giả lập) mở trang chi tiết mock; id thật vào trang chi tiết cuộc họp như cũ.
const MeetingDetailRoute = () => {
    const { id } = useParams();
    return MEETING_CALENDAR_MOCK_ENABLED && isMockMeetingId(id) ? <MockMeetingDetailPage /> : <EmployeeMeetingDetail />;
};

export default MeetingDetailRoute;
