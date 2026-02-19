import type { Response } from "./base";

export type ErrorCode = "network" | "unauthorized" | "rate_limited" | "unknown";

export type ErrorResponse = Response<
  "h.error",
  { requestType: string; code: ErrorCode; message: string }
>;
