"use client";

import { useEffect } from "react";

import { ErrorState } from "../../../src/client/components/error-state";

type ProjectErrorPageProps = {
  error: Error & {
    digest?: string;
  };
  reset: () => void;
};

export default function ProjectErrorPage({
  error,
  reset,
}: ProjectErrorPageProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return <ErrorState reset={reset} />;
}
