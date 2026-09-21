export interface APIResponse<T> {
  data: T;
  totalElements: number;
  error?: string;
}

export interface CreatedAPIResponse<T> {
  data?: T;
  message: string;
}