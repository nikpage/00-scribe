"use client";

import { useState, useEffect } from "react";

export function useDevice() {
  const [isPhone, setIsPhone] = useState(false);

  useEffect(() => {
    const check = () => setIsPhone(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  return { isPhone, isDesktop: !isPhone };
}
