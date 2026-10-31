import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppPageFrame } from "@/components/mobile/app-page-frame";
import { AuthGate } from "@/features/auth/auth-gate";
import { APPLICATIONS, getApplication } from "@/features/desktop/app-registry";

type Params = Promise<{ appId: string }>;

export function generateStaticParams() {
  return APPLICATIONS.map((app) => ({ appId: app.id }));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const app = getApplication((await params).appId);
  return { title: app?.name ?? "App" };
}

export default async function AppRoutePage({ params }: { params: Params }) {
  const { appId } = await params;
  if (!getApplication(appId)) notFound();
  return (
    <AuthGate>
      <AppPageFrame appId={appId} />
    </AuthGate>
  );
}
