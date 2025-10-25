"use client"
import { signIn } from "next-auth/react"
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function SignInInner() {
  const params = useSearchParams();
  const error = params.get("error");

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-8 sm:p-20">
      <h1 className="text-3xl font-bold">Welcome to Unified Intelligence Platform</h1>
      {error === "not_allowed" && (
        <div className="mt-4 w-full max-w-md rounded-md border border-red-200 bg-red-50 p-4 text-red-800 shadow-sm">
          <p className="font-semibold">You are not authorized.</p>
          <p className="text-sm text-red-700">Please contact the administrator.</p>
        </div>
      )}
      <button
        onClick={() => signIn("authentik", { callbackUrl: "/protected" })}
        className="mt-6 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
      >
        Sign in
      </button>
    </div>
  );
}

export default function SignIn() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen">Loading...</div>}>
      <SignInInner />
    </Suspense>
  );
}
