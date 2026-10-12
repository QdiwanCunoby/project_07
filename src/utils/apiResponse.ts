// Envelope standard delle risposte API
export interface ApiSuccess<T> { data: T }
export interface ApiFailure { error: { code: string; message: string } }

export const ok = <T>(data: T): ApiSuccess<T> => ({ data });

export const fail = (code: string, message: string): ApiFailure => ({
  error: { code, message },
});
