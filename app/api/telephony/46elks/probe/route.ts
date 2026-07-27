import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const response = () => NextResponse.json(
  { hangup: "busy" },
  {
    status: 200,
    headers: {
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  },
);

export async function GET() {
  return response();
}

export async function POST() {
  return response();
}
