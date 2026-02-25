"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useDevice } from "@/hooks/use-device";

export default function Home() {
  const router = useRouter();
  const { isPhone } = useDevice();

  useEffect(() => {
    router.replace(isPhone ? "/queue" : "/transcripts");
  }, [isPhone, router]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="animate-pulse text-muted-foreground">Loading...</div>
    </div>
  );
}
