import type { NextConfig } from "next";
const config: NextConfig = {
  poweredByHeader: false,
  outputFileTracingIncludes: {
    "/api/help/manual": ["./resources/Manual_FiberMap.pdf"],
  },
};
export default config;
