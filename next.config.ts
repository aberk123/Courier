import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // The weekly import advertises (and enforces) a 5 MB spreadsheet limit,
      // but Server Actions cap the request body at 1 MB by default -- and that
      // rejection happens in the framework, before the action runs, so it
      // surfaces as a 500 with nothing shown to the user. Raised just above
      // the app's own limit so the app's friendly error is always the one that
      // fires; the extra megabyte covers multipart boundary/header overhead.
      bodySizeLimit: "6mb",
    },
  },
};

export default nextConfig;
