import axios from 'axios';
import type { AxiosResponse, AxiosError } from 'axios';
import { getConfig } from '../Config';
import { getToken } from '../utils/authUtils';

const { VITE_API_BASE_URL } = getConfig();

const axiosInstance = axios.create({
    baseURL: VITE_API_BASE_URL || 'http://localhost:8080/api',
    headers: {
        'Content-Type': 'application/json'
    },
});

const setUpInterceptors = () => {
    axiosInstance.interceptors.request.use(
        (config: any) => {
            console.log('Outgoing request');
            const token = getToken();
            if (token) {
                if (!config.headers) {
                    config.headers = {};
                }
                config.headers.Authorization = `Bearer ${token}`;
            }
            return config;
        }, (error: AxiosError) => {
            return Promise.reject(error);
        }
    );

    axiosInstance.interceptors.response.use((response: AxiosResponse) => {
        console.log('Incoming response');
        return response;
    }, (error: AxiosError) => {
        console.error('Error in response', error);
        return Promise.reject(error);
    });
};

// Nothing else ever called this — every request/response went through
// axiosInstance with no Authorization header attached at all (the backend's
// own error, not a client no-op) until this session's live end-to-end
// verification caught it via bff's "missing bearer token" response.
setUpInterceptors();

export default axiosInstance;
export { setUpInterceptors };