import type { AxiosResponse } from "axios";
import axiosInstance from "./axios";


export const get = async <T>(url: string): Promise<T> => {
    const response: AxiosResponse<T> = await axiosInstance.get(url);
    return response.data;
}

export const post = async <T, U>(url: string, data: U): Promise<T> => {
    const response: AxiosResponse<T> = await axiosInstance.post(url, data);
    return response.data;
}

export const put = async <T, U>(url: string, data: U): Promise<T> => {
    const response: AxiosResponse<T> = await axiosInstance.put(url, data);
    return response.data;
}

export const del = async <T>(url: string): Promise<T> => {
    const response: AxiosResponse<T> = await axiosInstance.delete(url);
    return response.data;
}

export const patch = async <T, U>(url: string, data: U): Promise<T> => {
    const response: AxiosResponse<T> = await axiosInstance.patch(url, data);
    return response.data;
}

// Specialized method for downloading files (blob responses)
export const downloadFile = async (url: string): Promise<Blob> => {
    const response: AxiosResponse<Blob> = await axiosInstance.get(url, {
        responseType: 'blob'
    });
    return response.data;
}

// Export the axios instance for advanced use cases (like blob responses)
export { axiosInstance };