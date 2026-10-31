import type { Metadata } from "next";
import { StatusPanel } from "@/features/auth/status-panel";

export const metadata: Metadata = { title: "Status" };

export default function StatusPage() {
  return <StatusPanel />;
}
