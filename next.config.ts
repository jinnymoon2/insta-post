import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    localPatterns: [
      {
        pathname: "/api/image",
      },
    ],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "upload.wikimedia.org",
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      {
        protocol: "https",
        hostname: "plus.unsplash.com",
      },
      {
        protocol: "https",
        hostname: "media.cnn.com",
      },
      {
        protocol: "https",
        hostname: "ichef.bbci.co.uk",
      },
      {
        protocol: "https",
        hostname: "static01.nyt.com",
      },
    ],
    qualities: [75],
  },
};

export default nextConfig;
