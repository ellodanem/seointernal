export type GscProperty = {
  id: string;
  siteUrl: string;
  propertyType: "DOMAIN" | "URL_PREFIX";
  isPrimary: boolean;
  status: string;
  lastVerifiedAt: string | null;
  lastError: string | null;
};

export type Project = {
  id: string;
  slug: string;
  displayName: string;
  primaryOrigin: string;
  sitemapUrl: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  gscProperties: GscProperty[];
};

export type MeResponse = {
  user: {
    id: string;
    email: string;
    name: string;
    image?: string | null;
  };
  auth: {
    googleOAuthConfigured: boolean;
    gscCredentialsConfigured: boolean;
  };
};
