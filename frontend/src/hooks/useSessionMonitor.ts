import { useCallback, useEffect, useRef} from 'react'
import { useDispatch, useSelector } from 'react-redux';
import { isSessionExpired, sessionDuration } from '../utils/authUtils';
import { addNotification, removeNotification, updateNotification } from '../redux/slices/oauth-web-sockets/notificationSlice';
import { useNavigate } from 'react-router-dom';
import type { RootState } from '../redux/store';
import { logout } from '../redux/slices/oauth-web-sockets/authSlice';

const SESSION_DURATION = sessionDuration;
const WARNING_TIMES = [120, 60, 30, 10];
const COUNTDOWN_START = 5; // start countdown from 5 seconds

export const useSessionMonitor = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { isAuthenticated, sessionStartTime } = useSelector((state: RootState) =>  state.auth);
  const intervalRef = useRef<NodeJS.Timeout | null> (null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const countdownNotificationId = useRef<string | null>(null);
  const warningShownRef = useRef<Set<number>>(new Set());

  
  const getRemainingTime = useCallback((): number => {
    if (!sessionStartTime) return 0;
    const elapsedTime = Math.floor((Date.now() - sessionStartTime) / 1000);
    return Math.max(0, SESSION_DURATION - elapsedTime);
  }, [sessionStartTime]);

  const showWarningNotification = useCallback((remainingSeconds: number) => {
    const minutes = Math.floor(remainingSeconds / 60);
    const seconds = remainingSeconds % 60;

    let message: string;
    if (minutes > 0) {
        message = `Your session will expire in ${minutes} minute${minutes > 1 ? 's': ''}`;
    } else {
      message = `Your session will expire in ${seconds} second${seconds > 1 ? 's' : ''}`;
    }

    const notificationId = `session-warning-${remainingSeconds}-${Date.now()}`;
    dispatch(addNotification({
      id: notificationId,
      type: 'warning',
      title: 'Session Expiring soon',
      message,
      duration: 5000 // show for 5 seconds
    }));

    // Auto remove after duration
    setTimeout(() => {
      dispatch(removeNotification(notificationId));
    }, 5000);
  }, [dispatch]);

  const startCountdown = useCallback(() => {

    // prevent multiple countdowns
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
    }
    
    let countdownValue = COUNTDOWN_START;
    countdownNotificationId.current = `session-countdown-${Date.now()}`;

    // Show initial countdown notification
    dispatch(addNotification({
      id: countdownNotificationId.current,
      type: 'error',
      title: 'Session Expiring',
      message: `Logging out in ${countdownValue} seconds...`,
      duration: 0, // Persist until manually removed
      isCountdown: true,
      countdownValue
    }));

    countdownIntervalRef.current = setInterval(() => {
      countdownValue--;

      if (countdownValue > 0 && countdownNotificationId.current) {
        dispatch(updateNotification({
          id: countdownNotificationId.current,
          updates: {
            message: `Logging out in ${countdownValue} seconds...`,
            countdownValue
          }
        }));
      } else {
        // Countdown finished, logout user
        if (countdownNotificationId.current) {
          dispatch(removeNotification(countdownNotificationId.current));
        }
        if (countdownIntervalRef.current) {
          clearInterval(countdownIntervalRef.current);
          countdownIntervalRef.current = null;
        }
        dispatch(logout());
        navigate('/login');
      }
    }, 1000);
  }, [dispatch, navigate]);


  const checkSession = useCallback(() => {
    if (!isAuthenticated || !sessionStartTime) return;

    const remainingTime = getRemainingTime();

    if (remainingTime < 0 || isSessionExpired()) {
      // Session expired, logout user
      dispatch(logout());
      navigate('/login');
      return;
    }

    // Check for countdown phase
    if (remainingTime <= COUNTDOWN_START && !countdownIntervalRef.current) {
      startCountdown();
      return;
    }

    // Check for warning notifications
    WARNING_TIMES.forEach(warningTime => {
      if (remainingTime < warningTime && !warningShownRef.current.has(warningTime)) {
        warningShownRef.current.add(warningTime);
        showWarningNotification(remainingTime)
      }
    });
  }, [isAuthenticated, sessionStartTime, getRemainingTime, dispatch, navigate, startCountdown, showWarningNotification]);

  useEffect(() => {
    if (isAuthenticated) {
      // Reset warnings when session starts
      warningShownRef.current.clear();

      // check session every second
      intervalRef.current = setInterval(checkSession, 1000);

    } else {
      // clear intervals when not authenticated
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
      if (countdownNotificationId.current) {
        countdownNotificationId.current = null;
      }
    }

    return () => { 
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
    };
  }, [isAuthenticated, checkSession, dispatch]);

  return {
    remainingTime: getRemainingTime(),
    isSessionActive: isAuthenticated && getRemainingTime() > 0
  };
};

