import React, { Suspense } from 'react';
import Login from '../pages/auth/login/login';
import ForgotPassword from '../pages/auth/forgotpassword/forgotpassword';
import VerifyOTP from '../pages/auth/forgotpassword/vertifyOTP';
import { ChangePass } from '../pages/auth/forgotpassword/changePass';
import Error403 from '../pages/Error/403';
import Error404 from '../pages/Error/404';
import Error500 from '../pages/Error/500';
import ProtectedRoute from './ProtectedRoute';
import RoomUsageAnalytics from '../pages/shared/RoomUsageAnalytics';
import ZoneTrafficAnalytics from '../pages/shared/ZoneTrafficAnalytics';
import EmployeeOnTimeAnalytics from '../pages/shared/EmployeeOnTimeAnalytics';
import MeetingAttendanceAdmin from '../pages/shared/MeetingAttendanceAdmin';
import LearningLayout from '../pages/classroom/LearningLayout';
import ClassAttendanceDashboard from '../pages/classroom/ClassAttendanceDashboard';
import TeacherHome from '../pages/classroom/TeacherHome';
import TeacherSchedule from '../pages/classroom/TeacherSchedule';
import StudentClassDashboard from '../pages/classroom/StudentClassDashboard';
import StudentHome from '../pages/classroom/StudentHome';
import StudentSchedule from '../pages/classroom/StudentSchedule';
import ClassAttendanceAnalytics from '../pages/classroom/ClassAttendanceAnalytics';
import GuardLayout from '../pages/guard/GuardLayout';
import GuardDashboard from '../pages/guard/GuardDashboard';

// SystemAdmin Layout + Pages
import SystemAdminLayout from '../pages/systemAdmin/layout/SystemAdminLayout';
import DashBoard from '../pages/systemAdmin/dashBoard';
import DeviceManagement from '../pages/systemAdmin/DeviceManagement';
import EquipmentManagement from '../pages/systemAdmin/EquipmentManagement';
import ZoneManagement from '../pages/systemAdmin/ZoneManagement';
import RolePermissionManagement from '../pages/systemAdmin/RolePermissionManagement';
import SystemSettings from '../pages/systemAdmin/SystemSettings';
import Profile from '../pages/shared/Profile';
import Notifications from '../pages/systemAdmin/Notifications';
import ANPRManagement from '../pages/bussinessAdmin/ANPRManagement'; // SystemAdmin can also use this
import MyVehicles from '../pages/shared/MyVehicles';
import SecurityAlerts from '../pages/systemAdmin/SecurityAlerts';
import AlertRules from '../pages/systemAdmin/AlertRules';
import VehicleControlList from '../pages/systemAdmin/VehicleControlList';
import VehicleRegistrations from '../pages/systemAdmin/VehicleRegistrations';
import RoomAccessLogs from '../pages/systemAdmin/RoomAccessLogs';
import GatePresenceManagement from '../pages/systemAdmin/GatePresenceManagement';
import UserJourney from '../pages/shared/UserJourney';
import AuditLogs from '../pages/systemAdmin/AuditLogs';
// BusinessAdmin Layout + Pages
import BusinessAdminLayout from '../pages/bussinessAdmin/layout/BusinessAdminLayout';
import BusinessDashboard from '../pages/bussinessAdmin/dashBoard';
import BusinessUserManagement from '../pages/bussinessAdmin/UserManagement';
import BusinessDepartmentManagement from '../pages/bussinessAdmin/DepartmentManagement';
import BusinessRoomManagement from '../pages/bussinessAdmin/RoomManagement';

// Manager Layout + Pages
import ManagerLayout from '../pages/manager/layout/ManagerLayout';
import ManagerHomePage from '../pages/manager/homePage';
import ManagerMeetingApprovals from '../pages/manager/MeetingApprovals';
import ManagerMeetingAttendance from '../pages/manager/MeetingAttendance';
import ManagerFaceRegistration from '../pages/manager/FaceRegistration';
import BiometricSubmissionsReview from '../pages/bussinessAdmin/BiometricSubmissionsReview';

// Employee Layout + Pages
import EmployeeLayout from '../pages/employee/layout/EmployeeLayout';
import EmployeeHomePage from '../pages/employee/homePage';
import BookMeeting from '../pages/employee/BookMeeting';
import PersonalCalendar from '../pages/employee/PersonalCalendar';
import EmployeeFaceRegistration from '../pages/employee/FaceRegistration';
import EmployeeMeetingDetail from '../pages/employee/MeetingDetail';
import EmployeeRecordings from '../pages/employee/Recordings';
import EmployeeEquipmentReport from '../pages/employee/EquipmentReport';
import InMeetingRoom from '../pages/shared/InMeetingRoom';
import LegalAndSupport from '../pages/public/LegalAndSupport';
import GuestJoin from '../pages/guest/GuestJoin';
import GuestMeeting from '../pages/guest/GuestMeeting';

// Lazy-loaded to break circular dependency with minutesServices import chain
const DocumentArchive = React.lazy(() => import('../pages/bussinessAdmin/DocumentArchive'));

export const router = [
    // ========== Auth Routes (public) ==========
    {
        path: '/login',
        element: <Login />
    },
    {
        path: '/',
        element: <Login />
    },
    {
        path: '/forgot-password',
        element: <ForgotPassword />
    },
    {
        path: '/verify-otp',
        element: <VerifyOTP />
    },
    {
        path: '/change-password',
        element: <ChangePass />
    },
    {
        path: '/guest/join/:token',
        element: <GuestJoin />
    },
    {
        path: '/guest/meeting/:meetingId',
        element: <GuestMeeting />
    },
    // ========== SystemAdmin Routes (protected) ==========
    {
        path: '/system-admin',
        element: (
            <ProtectedRoute allowedRoles={['SYSTEM_ADMIN', 'ADMIN']}>
                <SystemAdminLayout />
            </ProtectedRoute>
        ),
        children: [
            {
                index: true,
                element: <DashBoard />
            },
            {
                path: 'devices',
                element: <DeviceManagement />
            },
            {
                path: 'zones',
                element: <ZoneManagement />
            },
            {
                path: 'zone-traffic',
                element: <ZoneTrafficAnalytics />
            },
            {
                path: 'roles-permissions',
                element: <RolePermissionManagement />
            },
            {
                path: 'settings',
                element: <SystemSettings />
            },
            {
                path: 'profile',
                element: <Profile />
            },
            {
                path: 'notifications',
                element: <Notifications />
            },
            {
                path: 'security-alerts',
                element: <SecurityAlerts />
            },
            {
                path: 'alert-rules',
                element: <AlertRules />
            },
            {
                path: 'anpr-management',
                element: <ANPRManagement />
            },
            {
                path: 'gate-presence',
                element: <GatePresenceManagement />
            },
            {
                path: 'vehicle-control-list',
                element: <VehicleControlList />
            },
            {
                path: 'vehicle-registrations',
                element: <VehicleRegistrations />
            },
            {
                path: 'room-access-logs',
                element: <RoomAccessLogs />
            },
            {
                path: 'user-journey',
                element: <UserJourney />
            },
            {
                path: 'audit-logs',
                element: <AuditLogs />
            },
            {
                path: 'legal',
                element: <LegalAndSupport />
            }
        ]
    },

    // ========== BusinessAdmin Routes (protected) ==========
    {
        path: '/business-admin',
        element: (
            <ProtectedRoute allowedRoles={['BUSINESS_ADMIN']}>
                <BusinessAdminLayout />
            </ProtectedRoute>
        ),
        children: [
            {
                index: true,
                element: <BusinessDashboard />
            },
            {
                path: 'users',
                element: <BusinessUserManagement />
            },
            {
                path: 'departments',
                element: <BusinessDepartmentManagement />
            },
            {
                path: 'rooms',
                element: <BusinessRoomManagement />
            },
            {
                path: 'equipments',
                element: <EquipmentManagement />
            },
            {
                path: 'biometric-submissions',
                element: <BiometricSubmissionsReview />
            },
            {
                path: 'profile',
                element: <Profile />
            },
            {
                path: 'notifications',
                element: <Notifications />
            },
            {
                path: 'meeting/:id',
                element: <EmployeeMeetingDetail />
            },
            {
                path: 'in-meeting/:id',
                element: <InMeetingRoom />
            },
            {
                path: 'room-analytics',
                element: <RoomUsageAnalytics />
            },
            {
                path: 'zone-traffic',
                element: <ZoneTrafficAnalytics />
            },
            {
                path: 'attendance-analytics',
                element: <EmployeeOnTimeAnalytics />
            },
            {
                path: 'meeting-attendance',
                element: <MeetingAttendanceAdmin />
            },
            {
                path: 'class-attendance',
                element: <ClassAttendanceAnalytics />
            },
            {
                path: 'legal',
                element: <LegalAndSupport />
            }
        ]
    },

    // ========== Manager Routes (protected) ==========
    {
        path: '/manager',
        element: (
            <ProtectedRoute allowedRoles={['MANAGER']}>
                <ManagerLayout />
            </ProtectedRoute>
        ),
        children: [
            {
                index: true,
                element: <ManagerHomePage />
            },
            {
                path: 'book',
                element: <BookMeeting />
            },
            {
                path: 'schedule',
                element: (
                    <ProtectedRoute requiredPermission="schedule.read.self">
                        <PersonalCalendar />
                    </ProtectedRoute>
                )
            },
            {
                path: 'profile',
                element: <Profile />
            },
            {
                path: 'face-register',
                element: <ManagerFaceRegistration />
            },
            {
                path: 'meeting/:id',
                element: <EmployeeMeetingDetail />
            },
            {
                path: 'in-meeting/:id',
                element: <InMeetingRoom />
            },
            {
                path: 'meeting-approvals',
                element: <ManagerMeetingApprovals />
            },
            {
                path: 'meeting-attendance',
                element: <ManagerMeetingAttendance />
            },
            {
                path: 'notifications',
                element: <Notifications />
            },
            {
                path: 'recordings',
                element: <EmployeeRecordings />
            },
            {
                path: 'rooms',
                element: <BusinessRoomManagement readOnly />
            },
            {
                path: 'equipments',
                element: <EmployeeEquipmentReport />
            },
            {
                path: 'minutes',
                element: <Suspense fallback={<div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-action-blue border-t-transparent rounded-full animate-spin"/></div>}><DocumentArchive scope="self" /></Suspense>
            },
            {
                path: 'user-journey',
                element: <UserJourney />
            },
            {
                path: 'attendance-analytics',
                element: <EmployeeOnTimeAnalytics />
            },
            {
                path: 'zone-traffic',
                element: <ZoneTrafficAnalytics />
            },
            {
                path: 'my-vehicles',
                element: <MyVehicles />
            },
            {
                path: 'legal',
                element: <LegalAndSupport />
            }
        ]
    },

    // ========== Guard Routes (protected) ==========
    {
        path: '/guard',
        element: (
            <ProtectedRoute allowedRoles={['GUARD']}>
                <GuardLayout />
            </ProtectedRoute>
        ),
        children: [
            {
                index: true,
                element: <GuardDashboard />
            },
            {
                path: 'profile',
                element: <Profile />
            },
            {
                path: 'notifications',
                element: <Notifications />
            }
        ]
    },

    // ========== Teacher Routes (protected) ==========
    {
        path: '/teacher',
        element: (
            <ProtectedRoute allowedRoles={['TEACHER']}>
                <LearningLayout role="teacher" />
            </ProtectedRoute>
        ),
        children: [
            {
                index: true,
                element: <TeacherHome />
            },
            {
                path: 'attendance',
                element: <ClassAttendanceDashboard mode="teacher" />
            },
            {
                path: 'attendance-report',
                element: <ClassAttendanceAnalytics mode="teacher" />
            },
            {
                path: 'schedule',
                element: <TeacherSchedule />
            },
            {
                path: 'profile',
                element: <Profile />
            },
            {
                path: 'notifications',
                element: <Notifications />
            }
        ]
    },

    // ========== Student Routes (protected) ==========
    {
        path: '/student',
        element: (
            <ProtectedRoute allowedRoles={['STUDENT']}>
                <LearningLayout role="student" />
            </ProtectedRoute>
        ),
        children: [
            {
                index: true,
                element: <StudentHome />
            },
            {
                path: 'attendance',
                element: <StudentClassDashboard />
            },
            {
                path: 'schedule',
                element: <StudentSchedule />
            },
            {
                path: 'profile',
                element: <Profile />
            },
            {
                path: 'notifications',
                element: <Notifications />
            }
        ]
    },

    // ========== Employee Routes (protected) ==========
    {
        path: '/employee',
        element: (
            <ProtectedRoute allowedRoles={['EMPLOYEE']}>
                <EmployeeLayout />
            </ProtectedRoute>
        ),
        children: [
            {
                index: true,
                element: <EmployeeHomePage />
            },
            {
                path: 'book',
                element: <BookMeeting />
            },
            {
                path: 'schedule',
                element: (
                    <ProtectedRoute requiredPermission="schedule.read.self">
                        <PersonalCalendar />
                    </ProtectedRoute>
                )
            },
            {
                path: 'profile',
                element: <Profile />
            },
            {
                path: 'face-register',
                element: <EmployeeFaceRegistration />
            },
            {
                path: 'meeting/:id',
                element: <EmployeeMeetingDetail />
            },
            {
                path: 'in-meeting/:id',
                element: <InMeetingRoom />
            },
            {
                path: 'notifications',
                element: <Notifications />
            },
            {
                path: 'recordings',
                element: <EmployeeRecordings />
            },
            {
                path: 'rooms',
                element: <BusinessRoomManagement readOnly />
            },
            {
                path: 'equipments',
                element: <EmployeeEquipmentReport />
            },
            {
                path: 'minutes',
                element: <Suspense fallback={<div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-action-blue border-t-transparent rounded-full animate-spin"/></div>}><DocumentArchive scope="self" /></Suspense>
            },
            {
                path: 'user-journey',
                element: <UserJourney />
            },
            {
                path: 'my-vehicles',
                element: <MyVehicles />
            },
            {
                path: 'legal',
                element: <LegalAndSupport />
            }
        ]
    },

    // ========== Error Routes ==========
    {
        path: '/403',
        element: <Error403 />
    },
    {
        path: '/404',
        element: <Error404 />
    },
    {
        path: '/500',
        element: <Error500 />
    },
    {
        path: '*',
        element: <Error404 />
    }
];
