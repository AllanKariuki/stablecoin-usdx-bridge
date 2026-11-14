import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { completeLogin } from './session';
import { useAuth } from './AuthProvider';
import { FullPageLoader } from '../ui/Feedback';
import { ErrorPage } from '../pages/ErrorPages';

/** Mounted at /auth/callback (the realm client's redirect URI) in every app. */
export function AuthCallback() {
  const navigate = useNavigate();
  const { reload, login } = useAuth();
  const [error, setError] = useState<string | null>(null);
  // StrictMode mounts effects twice; the code is single-use, so exchange once.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    completeLogin(window.location.search).then((result) => {
      if (!result.ok) return setError(result.error);
      reload();
      navigate(result.returnTo, { replace: true });
    });
  }, [navigate, reload]);

  if (error) {
    return (
      <ErrorPage
        code="Sign-in"
        title="We couldn't finish signing you in"
        message={error}
        primary={{ label: 'Try again', onClick: () => void login({ returnTo: '/' }) }}
      />
    );
  }
  return <FullPageLoader label="Finishing sign-in" />;
}
