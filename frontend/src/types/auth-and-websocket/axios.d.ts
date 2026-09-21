declare module 'axios' {
  export interface AxiosResponse<T = any> {
    data: T;
    status: number;
    statusText: string;
    headers: any;
    config: any;
    request?: any;
  }

  export interface AxiosInstance {
    get<T = any>(url: string, config?: AxiosXHRConfig): Promise<AxiosResponse<T>>;
    post<T = any, U = any>(url: string, data?: U, config?: AxiosXHRConfig): Promise<AxiosResponse<T>>;
    put<T = any, U = any>(url: string, data?: U, config?: AxiosXHRConfig): Promise<AxiosResponse<T>>;
    delete<T = any>(url: string, config?: AxiosXHRConfig): Promise<AxiosResponse<T>>;
    patch<T = any, U = any>(url: string, data?: U, config?: AxiosXHRConfig): Promise<AxiosResponse<T>>;
  }
  
  export interface AxiosError<T = any> extends Error {
    config: any;
    code?: string;
    request?: any;
    response?: AxiosResponse<T>;
    isAxiosError: boolean;
  }
  
  export interface InternalAxiosRequestConfig {
    headers?: any;
    [key: string]: any;
  }

  export interface AxiosXHRConfig {
    headers?: any;
    [key: string]: any;
  }

}