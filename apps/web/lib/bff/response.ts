import { NextResponse } from "next/server";
import type { ApiResponse } from "@void/types";

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json<ApiResponse<T>>({ ok: true, data }, init);
}

export function fail(code: string, message: string, status = 400) {
  return NextResponse.json<ApiResponse<never>>({ ok: false, error: { code, message } }, { status });
}
