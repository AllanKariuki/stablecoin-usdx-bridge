import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { useLocation, useNavigate } from 'react-router-dom';
import { selectIsAuthenticated } from '../../redux/slices/oauth-web-sockets/authSlice';
import { startPkceLogin } from '../../utils/authUtils';

/**
 * PKCE-only (docs/building-plan.md's P1 DoD: `npm run build && grep -r
 * "password" dist/` must come back empty). The ROPC form this page used to
 * render alongside the SSO button — and the `login`/`loginWithCridentials`
 * password-grant path it posted to — is gone; Keycloak's damp-portal client
 * keeps `directAccessGrantsEnabled` on server-side only as an operator
 * escape hatch, never exposed in this UI.
 */
const Login = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const isAuthenticated = useSelector(selectIsAuthenticated);
    const ssoError = (location.state as { error?: string } | null)?.error ?? null;
    const [isSsoRedirecting, setIsSsoRedirecting] = useState(false);

    const handleSsoLogin = async () => {
        setIsSsoRedirecting(true);
        try {
            await startPkceLogin();
            // startPkceLogin navigates the whole page away on success; this
            // component unmounts before the promise below would matter.
        } catch {
            setIsSsoRedirecting(false);
        }
    };

    useEffect(() => {
        if (isAuthenticated) {
            navigate('/dashboard');
        }
    }, [isAuthenticated, navigate]);

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-md w-full space-y-8">
                <div>
                    <div className="mx-auto h-12 w-12 flex items-center justify-center rounded-full bg-indigo-100">
                        <svg className="h-6 w-6 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                    </div>
                    <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
                        Sign in to your account
                    </h2>
                    <p className="mt-2 text-center text-sm text-gray-600">
                        Sign in with your DAMP account
                    </p>
                </div>

                {ssoError && (
                    <div className="rounded-md bg-red-50 p-4">
                        <p className="text-sm text-red-700">{ssoError}</p>
                    </div>
                )}

                <div>
                    <button
                        type="button"
                        onClick={handleSsoLogin}
                        disabled={isSsoRedirecting}
                        className={`group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white cursor-pointer ${
                            isSsoRedirecting
                                ? 'bg-gray-400 cursor-not-allowed'
                                : 'bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500'
                        } transition-colors duration-200`}
                    >
                        {isSsoRedirecting ? 'Redirecting…' : 'Sign in'}
                    </button>
                    <p className="mt-2 text-center text-xs text-gray-500">
                        Redirects to Keycloak — PKCE-secured, no credentials touch this site.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default Login;
