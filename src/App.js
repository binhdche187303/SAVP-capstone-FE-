import AppTypography from "./components/common/AppTypography";
import ToastContainer from "./components/common/ToastContainer";
import NotificationBanner from "./components/common/NotificationBanner";
import AllRouter from "./routers/AllRouter";
import ForcePasswordChangeGate from "./components/auth/ForcePasswordChangeGate";

// Handle auth expiry globally — full reload to /login clears all stale state
window.addEventListener('auth-expired', () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    window.location.replace('/login');
});

function App() {
  return (
    <>
      <AppTypography />
      <AllRouter />
      <ToastContainer />
      <NotificationBanner />
      <ForcePasswordChangeGate />
    </>
  );
}

export default App;
