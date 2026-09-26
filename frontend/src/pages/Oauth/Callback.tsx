// Callback.tsx — the landing point for Keycloak's auth-code + PKCE redirect
// (VITE_REDIRECT_URI, http://localhost:5173/auth/callback — see
// infra/keycloak/templates/damp-realm.template.json's damp-portal client).
// startPkceLogin (authUtils.ts) sends the browser to Keycloak; Keycloak
// sends it back here with ?code=...&state=... on success, or
// ?error=...&error_description=... on failure/denial.
import React, { useEffect, useRef } from 'react';
import { useDispatch } from 'react-redux';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { loginWithPkceCode } from '../../redux/slices/oauth-web-sockets/authSlice';
import type { AppDispatch } from '../../redux/store';

const Callback: React.FC = () => {
    const dispatch = useDispatch<AppDispatch>();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    // StrictMode/React 19 double-invokes effects in dev — without this
    // guard a single browser redirect would fire the code exchange twice,
    // and Keycloak's authorization codes are single-use, so the second
    // call would fail with a confusing error on an otherwise-successful
    // login.
    const exchangeStarted = useRef(false);

    useEffect(() => {
        if (exchangeStarted.current) return;
        exchangeStarted.current = true;

        const error = searchParams.get('error');
        if (error) {
            const description = searchParams.get('error_description') || error;
            navigate('/login', { replace: true, state: { error: description } });
            return;
        }

        const code = searchParams.get('code');
        const state = searchParams.get('state');
        if (!code || !state) {
            navigate('/login', { replace: true, state: { error: 'Missing authorization code — please try signing in again.' } });
            return;
        }

        dispatch(loginWithPkceCode({ code, state }))
            .unwrap()
            .then(() => navigate('/dashboard', { replace: true }))
            .catch((message: string) => navigate('/login', { replace: true, state: { error: message } }));
        // searchParams/navigate/dispatch are stable across this effect's one
        // real run (guarded above), and including navigate/dispatch would
        // re-trigger on identity changes React Router/Redux don't guarantee
        // are referentially stable.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <div className="flex min-h-screen items-center justify-center">
            <p className="text-sm text-gray-500">Signing you in…</p>
        </div>
    );
};

export default Callback;
